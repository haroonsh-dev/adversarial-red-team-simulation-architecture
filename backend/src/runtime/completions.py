"""Extract and mutate OpenAI/Anthropic completion payloads for the runtime gate."""

from __future__ import annotations

import json
from typing import Any
from uuid import UUID

from src.runtime.actions import RuntimeAction
from src.runtime.disclosure import PromptFingerprint, fingerprint_from_messages
from src.runtime.gate import RuntimeDecision, get_runtime_gate
from src.runtime.tool_calls import parse_anthropic_tool_uses, parse_openai_tool_calls


def openai_output_blocked_body(decision: RuntimeDecision) -> dict[str, Any]:
    return {
        "error": {
            "message": "ARTSA containment: model output blocked.",
            "type": "artsa_containment_block",
            "param": None,
            "code": "output_blocked",
            "artsa": output_artsa(decision),
        }
    }


def anthropic_output_blocked_body(decision: RuntimeDecision) -> dict[str, Any]:
    return {
        "type": "error",
        "error": {
            "type": "forbidden_error",
            "message": "ARTSA containment: model output blocked.",
            "code": "output_blocked",
            "artsa": output_artsa(decision),
        },
    }


def output_artsa(decision: RuntimeDecision) -> dict[str, Any]:
    # Client errors expose only classification metadata. Audit rows retain the
    # digest-only forensic detail required for operators, including tool names.
    public_findings = [
        {
            "detector": finding.detector,
            "category": finding.category,
            "span_start": finding.span_start,
            "span_end": finding.span_end,
            "match_length": finding.match_length,
            "action": finding.action.value,
        }
        for finding in decision.findings
    ]
    return {
        "action": decision.action.value,
        "body_sha256": decision.body_sha256,
        "stream": decision.stream,
        "categories": [f.category for f in decision.findings],
        "findings": public_findings,
    }


def extract_openai_output(payload: dict[str, Any]) -> tuple[str, list[dict[str, Any]]]:
    choice = (payload.get("choices") or [{}])[0]
    message = choice.get("message") or {}
    text = message.get("content") if isinstance(message.get("content"), str) else ""
    tool_calls = parse_openai_tool_calls(message)
    return text or "", tool_calls


def extract_anthropic_output(payload: dict[str, Any]) -> tuple[str, list[dict[str, Any]]]:
    content = payload.get("content")
    texts: list[str] = []
    if isinstance(content, list):
        for block in content:
            if isinstance(block, dict) and block.get("type") == "text":
                texts.append(str(block.get("text") or ""))
    elif isinstance(content, str):
        texts.append(content)
    return "\n".join(texts), parse_anthropic_tool_uses(content)


def assemble_scan_body(text: str, tool_calls: list[dict[str, Any]]) -> str:
    parts = [text]
    if tool_calls:
        parts.append(json.dumps(tool_calls, default=str, separators=(",", ":")))
    return "\n".join(p for p in parts if p)


def registered_canaries() -> tuple[str, ...]:
    from src.core.config import settings

    raw = (getattr(settings, "ARTSA_OUTPUT_CANARIES", "") or "").strip()
    if not raw:
        return ()
    return tuple(part.strip() for part in raw.split(",") if part.strip())


def gate_openai_completion(
    payload: dict[str, Any],
    *,
    messages: list[dict[str, Any]],
    session_id: UUID,
    extra_system: str | None = None,
) -> tuple[RuntimeDecision, dict[str, Any] | None]:
    text, tool_calls = extract_openai_output(payload)
    decision = _decide(text, tool_calls, messages, session_id, extra_system)
    if decision.action == RuntimeAction.BLOCK:
        return decision, None
    if decision.action == RuntimeAction.QUARANTINE:
        return decision, _strip_openai_tools(payload, decision)
    return decision, payload


def gate_anthropic_completion(
    payload: dict[str, Any],
    *,
    messages: list[dict[str, Any]],
    session_id: UUID,
    extra_system: str | None = None,
) -> tuple[RuntimeDecision, dict[str, Any] | None]:
    text, tool_calls = extract_anthropic_output(payload)
    decision = _decide(text, tool_calls, messages, session_id, extra_system)
    if decision.action == RuntimeAction.BLOCK:
        return decision, None
    if decision.action == RuntimeAction.QUARANTINE:
        return decision, _strip_anthropic_tools(payload, decision)
    return decision, payload


def _decide(
    text: str,
    tool_calls: list[dict[str, Any]],
    messages: list[dict[str, Any]],
    session_id: UUID,
    extra_system: str | None,
) -> RuntimeDecision:
    fingerprint: PromptFingerprint | None = fingerprint_from_messages(messages, extra_system)
    body = assemble_scan_body(text, tool_calls)
    return get_runtime_gate().evaluate(
        output_text=body,
        tool_calls=tool_calls,
        fingerprint=fingerprint,
        registered_canaries=registered_canaries(),
        session_id=session_id,
        stream=False,
    )


def _blocked_tool_names(decision: RuntimeDecision) -> set[str]:
    return {
        f.tool_name
        for f in decision.findings
        if f.category == "UNSAFE_TOOL_CALL" and f.tool_name
    }


def _strip_openai_tools(payload: dict[str, Any], decision: RuntimeDecision) -> dict[str, Any]:
    blocked = _blocked_tool_names(decision)
    if not blocked:
        return payload
    mutated = json.loads(json.dumps(payload))
    choice = (mutated.get("choices") or [{}])[0]
    message = choice.get("message") or {}
    tools = message.get("tool_calls") or []
    message["tool_calls"] = [
        t
        for t in tools
        if isinstance(t, dict) and str((t.get("function") or {}).get("name") or "") not in blocked
    ]
    if not message["tool_calls"]:
        message.pop("tool_calls", None)
        choice["finish_reason"] = choice.get("finish_reason") or "stop"
    return mutated


def _strip_anthropic_tools(payload: dict[str, Any], decision: RuntimeDecision) -> dict[str, Any]:
    blocked = _blocked_tool_names(decision)
    if not blocked:
        return payload
    mutated = json.loads(json.dumps(payload))
    content = mutated.get("content")
    if isinstance(content, list):
        mutated["content"] = [
            block
            for block in content
            if not (
                isinstance(block, dict)
                and block.get("type") == "tool_use"
                and str(block.get("name") or "") in blocked
            )
        ]
    return mutated
