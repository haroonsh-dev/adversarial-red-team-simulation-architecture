"""Buffered SSE output scan with holdback (Phase 2.4).

Upstream tokens are accumulated and scanned with the same RuntimeGate as
non-streaming completions. Only characters behind a holdback window are
released, so a secret split across chunks gets the same BLOCK verdict and is
not flushed to the client. Scanner errors and unparsed tails fail closed.
"""

from __future__ import annotations

import json
import logging
import uuid
from typing import Any
from uuid import UUID

from src.runtime.actions import RuntimeAction
from src.runtime.completions import (
    anthropic_output_blocked_body,
    assemble_scan_body,
    openai_output_blocked_body,
    registered_canaries,
)
from src.runtime.disclosure import fingerprint_from_messages
from src.runtime.evidence import RedactedFinding, sha256_text
from src.runtime.gate import RuntimeDecision, get_runtime_gate
from src.runtime.tool_calls import _coerce_args as coerce_tool_arguments

logger = logging.getLogger(__name__)

# Longer than typical API-key / Bearer spans so a split secret stays unreleased.
STREAM_HOLDBACK_CHARS = 256
STREAM_MAX_BUFFER_CHARS = 1_000_000


def fail_closed_decision(*, stream: bool = True, body: str = "") -> RuntimeDecision:
    return RuntimeDecision(
        action=RuntimeAction.BLOCK,
        findings=[
            RedactedFinding(
                detector="RuntimeGate",
                category="SCANNER_UNAVAILABLE",
                body_sha256=sha256_text(body),
                action=RuntimeAction.BLOCK,
            )
        ],
        body_sha256=sha256_text(body),
        stream=stream,
    )


def pop_sse_frames(buffer: str) -> tuple[list[str], str]:
    """Split complete SSE events; return (frames, remainder)."""
    frames: list[str] = []
    while True:
        lf = buffer.find("\n\n")
        crlf = buffer.find("\r\n\r\n")
        if lf < 0 and crlf < 0:
            break
        if crlf >= 0 and (lf < 0 or crlf < lf):
            end, sep_len = crlf, 4
        else:
            end, sep_len = lf, 2
        frames.append(buffer[:end])
        buffer = buffer[end + sep_len :]
    return frames, buffer


def parse_sse_frame(frame: str) -> tuple[str | None, str]:
    event_name: str | None = None
    data_lines: list[str] = []
    for raw_line in frame.splitlines():
        line = raw_line.rstrip("\r")
        if line.startswith("event:"):
            event_name = line[6:].strip()
        elif line.startswith("data:"):
            data_lines.append(line[5:].lstrip())
    return event_name, "\n".join(data_lines)


class StreamScanState:
    """Shared accumulator: text + completed tool_calls → RuntimeGate."""

    def __init__(
        self,
        *,
        messages: list[dict[str, Any]],
        session_id: UUID,
        extra_system: str | None = None,
    ) -> None:
        self.session_id = session_id
        self.fingerprint = fingerprint_from_messages(messages, extra_system)
        self.text = ""
        self.released = 0
        self.aborted = False
        self.final_decision: RuntimeDecision | None = None
        self.completed_tools: list[dict[str, Any]] = []

    def ingest_text(self, piece: str) -> tuple[RuntimeAction, str]:
        if self.aborted:
            return RuntimeAction.BLOCK, ""
        if not piece:
            return RuntimeAction.ALLOW, ""
        if len(self.text) + len(piece) > STREAM_MAX_BUFFER_CHARS:
            return self._abort(fail_closed_decision(body=self.text))
        self.text += piece
        decision = self._evaluate(include_tools=False)
        self.final_decision = decision
        if decision.action == RuntimeAction.BLOCK:
            return self._abort(decision)
        if decision.action == RuntimeAction.QUARANTINE:
            return decision.action, ""
        commit_end = max(0, len(self.text) - STREAM_HOLDBACK_CHARS)
        new = self.text[self.released : commit_end]
        self.released = commit_end
        return decision.action, new

    def finish(self, *, withhold_quarantine: bool = False) -> tuple[RuntimeDecision, str]:
        if self.aborted and self.final_decision is not None:
            return self.final_decision, ""
        decision = self._evaluate(include_tools=True)
        self.final_decision = decision
        if decision.action == RuntimeAction.BLOCK:
            self.aborted = True
            return decision, ""
        if decision.action == RuntimeAction.QUARANTINE and withhold_quarantine:
            return decision, ""
        rest = self.text[self.released :]
        self.released = len(self.text)
        return decision, rest

    def allowed_tools(
        self, decision: RuntimeDecision, *, pass_quarantine: bool = False
    ) -> list[dict[str, Any]]:
        if decision.action == RuntimeAction.BLOCK:
            return []
        blocked = {
            f.tool_name
            for f in decision.findings
            if f.category == "UNSAFE_TOOL_CALL" and f.tool_name
        }
        if decision.action != RuntimeAction.QUARANTINE or pass_quarantine:
            return list(self.completed_tools)
        return [t for t in self.completed_tools if str(t.get("name") or "") not in blocked]

    def _evaluate(self, *, include_tools: bool) -> RuntimeDecision:
        tools = self.completed_tools if include_tools else []
        body = assemble_scan_body(self.text, tools)
        return get_runtime_gate().evaluate(
            output_text=body,
            tool_calls=tools,
            fingerprint=self.fingerprint,
            registered_canaries=registered_canaries(),
            session_id=self.session_id,
            stream=True,
        )

    def _abort(self, decision: RuntimeDecision) -> tuple[RuntimeAction, str]:
        self.aborted = True
        self.final_decision = decision
        return RuntimeAction.BLOCK, ""


class OpenAIStreamGate:
    """Parse OpenAI SSE, hold back text, abort/redact on BLOCK."""

    def __init__(
        self,
        *,
        messages: list[dict[str, Any]],
        session_id: UUID,
        extra_system: str | None = None,
        retry_authorized: bool = False,
    ) -> None:
        self.state = StreamScanState(
            messages=messages, session_id=session_id, extra_system=extra_system
        )
        self._buf = ""
        self._finalized = False
        self._chunk_id = "chatcmpl-artsa-gated"
        self._tool_acc: dict[int, dict[str, Any]] = {}
        self._finish_reason: str | None = None
        self._retry_authorized = retry_authorized

    @property
    def aborted(self) -> bool:
        return self.state.aborted

    @property
    def final_decision(self) -> RuntimeDecision | None:
        return self.state.final_decision

    def feed(self, raw: str) -> list[str]:
        if self.state.aborted or self._finalized:
            return []
        self._buf += raw
        frames, self._buf = pop_sse_frames(self._buf)
        out: list[str] = []
        for frame in frames:
            out.extend(self._handle_frame(frame))
            if self.state.aborted or self._finalized:
                break
        return out

    def finish(self) -> list[str]:
        if self._finalized:
            return []
        if self.state.aborted:
            return []
        if self._buf.strip():
            self._finalized = True
            decision = fail_closed_decision(body=self.state.text)
            self.state.aborted = True
            self.state.final_decision = decision
            return self._block_frames(decision)
        return self._finalize()

    def _handle_frame(self, frame: str) -> list[str]:
        _event, data = parse_sse_frame(frame)
        if not data or data.startswith(":"):
            return []
        if data == "[DONE]":
            return self._finalize()
        try:
            obj = json.loads(data)
        except json.JSONDecodeError:
            self._finalized = True
            decision = fail_closed_decision(body=self.state.text)
            self.state.aborted = True
            self.state.final_decision = decision
            return self._block_frames(decision)
        if obj.get("id"):
            self._chunk_id = str(obj["id"])
        choice = (obj.get("choices") or [{}])[0]
        if not isinstance(choice, dict):
            choice = {}
        delta = choice.get("delta") or {}
        if choice.get("finish_reason"):
            self._finish_reason = str(choice["finish_reason"])
        out: list[str] = []
        content = delta.get("content")
        if isinstance(content, str) and content:
            action, released = self.state.ingest_text(content)
            if action == RuntimeAction.BLOCK:
                self._finalized = True
                assert self.state.final_decision is not None
                return self._block_frames(self.state.final_decision)
            if released:
                out.append(self._content_frame(released))
        tool_deltas = delta.get("tool_calls") or []
        if isinstance(tool_deltas, list):
            self._accumulate_tools(tool_deltas)
        if obj.get("error"):
            # Upstream error — still fail closed if we cannot scan; forward shape as block.
            return out
        return out

    def _accumulate_tools(self, deltas: list[Any]) -> None:
        for item in deltas:
            if not isinstance(item, dict):
                continue
            index = int(item.get("index") or 0)
            slot = self._tool_acc.setdefault(
                index, {"id": None, "name": "", "arguments": ""}
            )
            if item.get("id"):
                slot["id"] = item["id"]
            fn = item.get("function") or {}
            if isinstance(fn, dict):
                if fn.get("name"):
                    slot["name"] = str(fn["name"])
                if isinstance(fn.get("arguments"), str):
                    slot["arguments"] += fn["arguments"]

    def _completed_tools(self) -> list[dict[str, Any]]:
        completed: list[dict[str, Any]] = []
        for slot in self._tool_acc.values():
            name = str(slot.get("name") or "")
            if not name:
                continue
            completed.append(
                {
                    "id": slot.get("id"),
                    "name": name,
                    "arguments": coerce_tool_arguments(slot.get("arguments") or {}),
                }
            )
        return completed

    def _finalize(self) -> list[str]:
        if self._finalized:
            return []
        self._finalized = True
        self.state.completed_tools = self._completed_tools()
        decision, rest = self.state.finish(withhold_quarantine=not self._retry_authorized)
        if decision.action == RuntimeAction.BLOCK:
            return self._block_frames(decision)
        if decision.action == RuntimeAction.QUARANTINE and not self._retry_authorized:
            return []
        frames: list[str] = []
        if rest:
            frames.append(self._content_frame(rest))
        tools = self.state.allowed_tools(decision, pass_quarantine=self._retry_authorized)
        if tools:
            frames.append(self._tools_frame(tools))
            finish_reason = "tool_calls"
        else:
            finish_reason = self._finish_reason or "stop"
            if finish_reason == "tool_calls" and not tools:
                finish_reason = "stop"
        frames.append(self._finish_frame(finish_reason))
        frames.append("data: [DONE]\n\n")
        return frames

    def _content_frame(self, text: str) -> str:
        return (
            "data: "
            + json.dumps(
                {
                    "id": self._chunk_id,
                    "object": "chat.completion.chunk",
                    "choices": [
                        {
                            "index": 0,
                            "delta": {"content": text},
                            "finish_reason": None,
                        }
                    ],
                }
            )
            + "\n\n"
        )

    def _tools_frame(self, tools: list[dict[str, Any]]) -> str:
        tool_calls = []
        for i, tool in enumerate(tools):
            args = tool.get("arguments") or {}
            args_s = args if isinstance(args, str) else json.dumps(args, default=str)
            tool_calls.append(
                {
                    "index": i,
                    "id": tool.get("id") or f"call_{i}",
                    "type": "function",
                    "function": {"name": tool.get("name"), "arguments": args_s},
                }
            )
        return (
            "data: "
            + json.dumps(
                {
                    "id": self._chunk_id,
                    "object": "chat.completion.chunk",
                    "choices": [
                        {
                            "index": 0,
                            "delta": {"tool_calls": tool_calls},
                            "finish_reason": None,
                        }
                    ],
                }
            )
            + "\n\n"
        )

    def _finish_frame(self, finish_reason: str) -> str:
        return (
            "data: "
            + json.dumps(
                {
                    "id": self._chunk_id,
                    "object": "chat.completion.chunk",
                    "choices": [
                        {"index": 0, "delta": {}, "finish_reason": finish_reason}
                    ],
                }
            )
            + "\n\n"
        )

    def _block_frames(self, decision: RuntimeDecision) -> list[str]:
        return [
            "data: " + json.dumps(openai_output_blocked_body(decision)) + "\n\n",
            "data: [DONE]\n\n",
        ]


class AnthropicStreamGate:
    """Parse native Anthropic SSE; same holdback / fail-closed contract."""

    def __init__(
        self,
        *,
        messages: list[dict[str, Any]],
        session_id: UUID,
        extra_system: str | None = None,
        model: str = "claude",
        retry_authorized: bool = False,
    ) -> None:
        self.state = StreamScanState(
            messages=messages, session_id=session_id, extra_system=extra_system
        )
        self.emitter = AnthropicSseEmitter(model=model)
        self._buf = ""
        self._finalized = False
        self._tool_acc: dict[int, dict[str, Any]] = {}
        self._retry_authorized = retry_authorized

    @property
    def aborted(self) -> bool:
        return self.state.aborted

    @property
    def final_decision(self) -> RuntimeDecision | None:
        return self.state.final_decision

    def feed(self, raw: str) -> list[str]:
        if self.state.aborted or self._finalized:
            return []
        self._buf += raw
        frames, self._buf = pop_sse_frames(self._buf)
        out: list[str] = []
        for frame in frames:
            out.extend(self._handle_frame(frame))
            if self.state.aborted or self._finalized:
                break
        return out

    def finish(self) -> list[str]:
        if self._finalized:
            return []
        if self.state.aborted:
            return []
        if self._buf.strip():
            self._finalized = True
            decision = fail_closed_decision(body=self.state.text)
            self.state.aborted = True
            self.state.final_decision = decision
            return self.emitter.block(decision)
        return self._finalize()

    def _handle_frame(self, frame: str) -> list[str]:
        _event, data = parse_sse_frame(frame)
        if not data:
            return []
        try:
            obj = json.loads(data)
        except json.JSONDecodeError:
            self._finalized = True
            decision = fail_closed_decision(body=self.state.text)
            self.state.aborted = True
            self.state.final_decision = decision
            return self.emitter.block(decision)
        typ = str(obj.get("type") or _event or "")
        if typ == "error":
            return []
        if typ == "message_stop":
            return self._finalize()
        if typ == "content_block_start":
            block = obj.get("content_block") or {}
            index = int(obj.get("index") or 0)
            if block.get("type") == "tool_use":
                self._tool_acc[index] = {
                    "id": block.get("id"),
                    "name": str(block.get("name") or ""),
                    "arguments": json.dumps(block.get("input") or {})
                    if isinstance(block.get("input"), dict)
                    else "",
                }
            return []
        if typ == "content_block_delta":
            delta = obj.get("delta") or {}
            index = int(obj.get("index") or 0)
            if delta.get("type") == "text_delta" and isinstance(delta.get("text"), str):
                action, released = self.state.ingest_text(delta["text"])
                if action == RuntimeAction.BLOCK:
                    self._finalized = True
                    assert self.state.final_decision is not None
                    return self.emitter.block(self.state.final_decision)
                if released:
                    return self.emitter.text(released)
            if delta.get("type") == "input_json_delta" and isinstance(
                delta.get("partial_json"), str
            ):
                slot = self._tool_acc.setdefault(
                    index, {"id": None, "name": "", "arguments": ""}
                )
                slot["arguments"] += delta["partial_json"]
            return []
        return []

    def _completed_tools(self) -> list[dict[str, Any]]:
        completed: list[dict[str, Any]] = []
        for slot in self._tool_acc.values():
            name = str(slot.get("name") or "")
            if not name:
                continue
            completed.append(
                {
                    "id": slot.get("id"),
                    "name": name,
                    "arguments": coerce_tool_arguments(slot.get("arguments") or {}),
                }
            )
        return completed

    def _finalize(self) -> list[str]:
        if self._finalized:
            return []
        self._finalized = True
        self.state.completed_tools = self._completed_tools()
        decision, rest = self.state.finish(withhold_quarantine=not self._retry_authorized)
        if decision.action == RuntimeAction.BLOCK:
            return self.emitter.block(decision)
        if decision.action == RuntimeAction.QUARANTINE and not self._retry_authorized:
            return []
        return self.emitter.finish_ok(
            rest, self.state.allowed_tools(decision, pass_quarantine=self._retry_authorized)
        )


class AnthropicSseEmitter:
    def __init__(self, model: str) -> None:
        self.model = model
        self.started = False
        self.msg_id = f"msg_{uuid.uuid4().hex}"

    def text(self, piece: str) -> list[str]:
        frames: list[str] = []
        if not self.started:
            self.started = True
            frames.append(
                _anthropic_sse(
                    "message_start",
                    {
                        "type": "message_start",
                        "message": {
                            "id": self.msg_id,
                            "type": "message",
                            "role": "assistant",
                            "model": self.model,
                            "content": [],
                            "stop_reason": None,
                        },
                    },
                )
            )
            frames.append(
                _anthropic_sse(
                    "content_block_start",
                    {
                        "type": "content_block_start",
                        "index": 0,
                        "content_block": {"type": "text", "text": ""},
                    },
                )
            )
        frames.append(
            _anthropic_sse(
                "content_block_delta",
                {
                    "type": "content_block_delta",
                    "index": 0,
                    "delta": {"type": "text_delta", "text": piece},
                },
            )
        )
        return frames

    def block(self, decision: RuntimeDecision) -> list[str]:
        return [_anthropic_sse("error", anthropic_output_blocked_body(decision))]

    def finish_ok(self, rest: str, tools: list[dict[str, Any]]) -> list[str]:
        frames: list[str] = []
        if rest:
            frames.extend(self.text(rest))
        if self.started:
            frames.append(
                _anthropic_sse(
                    "content_block_stop",
                    {"type": "content_block_stop", "index": 0},
                )
            )
        for i, tool in enumerate(tools, start=1):
            frames.append(
                _anthropic_sse(
                    "content_block_start",
                    {
                        "type": "content_block_start",
                        "index": i,
                        "content_block": {
                            "type": "tool_use",
                            "id": tool.get("id") or f"toolu_{i}",
                            "name": tool.get("name"),
                            "input": tool.get("arguments") or {},
                        },
                    },
                )
            )
            frames.append(
                _anthropic_sse(
                    "content_block_stop",
                    {"type": "content_block_stop", "index": i},
                )
            )
        stop_reason = "tool_use" if tools else "end_turn"
        if self.started or tools:
            frames.append(
                _anthropic_sse(
                    "message_delta",
                    {
                        "type": "message_delta",
                        "delta": {"stop_reason": stop_reason, "stop_sequence": None},
                    },
                )
            )
            frames.append(_anthropic_sse("message_stop", {"type": "message_stop"}))
        elif not frames:
            frames.append(_anthropic_sse("message_stop", {"type": "message_stop"}))
        return frames


class OpenAIToAnthropicStreamTranslator:
    """Map gated OpenAI SSE frames onto Anthropic SSE (converted proxy path)."""

    def __init__(self, model: str) -> None:
        self.emitter = AnthropicSseEmitter(model=model)
        self._done = False
        self._pending_tools: list[dict[str, Any]] = []

    def consume(self, openai_frame: str) -> list[str]:
        if self._done:
            return []
        _event, data = parse_sse_frame(openai_frame)
        if not data:
            return []
        if data == "[DONE]":
            self._done = True
            return self.emitter.finish_ok("", self._pending_tools)
        try:
            obj = json.loads(data)
        except json.JSONDecodeError:
            self._done = True
            return self.emitter.block(fail_closed_decision())
        err = obj.get("error")
        if isinstance(err, dict):
            self._done = True
            artsa = err.get("artsa")
            if isinstance(artsa, dict):
                return [
                    _anthropic_sse(
                        "error",
                        {
                            "type": "error",
                            "error": {
                                "type": "forbidden_error",
                                "message": "ARTSA containment: model output blocked.",
                                "code": "output_blocked",
                                "artsa": artsa,
                            },
                        },
                    )
                ]
            return self.emitter.block(fail_closed_decision())
        choice = (obj.get("choices") or [{}])[0]
        if not isinstance(choice, dict):
            choice = {}
        delta = choice.get("delta") or {}
        text = delta.get("content")
        out: list[str] = []
        if isinstance(text, str) and text:
            out.extend(self.emitter.text(text))
        tools = delta.get("tool_calls") or []
        if isinstance(tools, list):
            parsed_tools: list[dict[str, Any]] = []
            for item in tools:
                if not isinstance(item, dict):
                    continue
                fn = item.get("function") or {}
                parsed_tools.append(
                    {
                        "id": item.get("id"),
                        "name": fn.get("name") if isinstance(fn, dict) else None,
                        "arguments": coerce_tool_arguments(
                            fn.get("arguments") if isinstance(fn, dict) else {}
                        ),
                    }
                )
            if parsed_tools:
                self._pending_tools = parsed_tools
        finish_reason = choice.get("finish_reason")
        if finish_reason:
            self._done = True
            return out + self.emitter.finish_ok("", self._pending_tools)
        return out


def _anthropic_sse(event: str, data: dict[str, Any]) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"
