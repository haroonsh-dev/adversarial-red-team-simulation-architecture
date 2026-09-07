"""Normalize external Harness / custom-security payloads into ARTSA ToolCallEvents.

Browser harnesses often POST prompt/tool/output scans that are not native
``ToolCallEvent`` shapes. Without this adapter, chat traffic never reaches the
containment engine — only the ``health_check`` verify ping succeeds.
"""

from __future__ import annotations

import logging
import uuid
from typing import Any

from src.core.models.events import ToolCallEvent

logger = logging.getLogger(__name__)


def is_health_check(raw: Any) -> bool:
    if not isinstance(raw, dict):
        return False
    if raw.get("type") in {"health_check", "ping", "heartbeat"}:
        return True
    return raw.get("ping") is True and "session_id" not in raw and "tool_name" not in raw


def _as_uuid(value: Any) -> uuid.UUID:
    if value is None or value == "":
        return uuid.uuid4()
    try:
        return uuid.UUID(str(value))
    except (ValueError, TypeError, AttributeError):
        return uuid.uuid5(uuid.NAMESPACE_URL, str(value))


def _pick_text(raw: dict[str, Any]) -> str:
    for key in (
        "content",
        "prompt",
        "text",
        "message",
        "input",
        "query",
        "user_prompt",
        "output",
        "response",
        "command",
        "cmd",
        "code",
    ):
        val = raw.get(key)
        if isinstance(val, str) and val.strip():
            return val
        if isinstance(val, dict):
            nested = _pick_text(val)
            if nested:
                return nested
        if isinstance(val, list):
            parts = []
            for item in val:
                if isinstance(item, str):
                    parts.append(item)
                elif isinstance(item, dict):
                    parts.append(
                        str(item.get("text") or item.get("content") or item.get("prompt") or "")
                    )
            joined = "\n".join(p for p in parts if p).strip()
            if joined:
                return joined
    # OpenAI-ish messages array
    messages = raw.get("messages")
    if isinstance(messages, list):
        parts = []
        for m in messages:
            if isinstance(m, dict):
                c = m.get("content")
                if isinstance(c, str):
                    parts.append(c)
                elif isinstance(c, list):
                    for p in c:
                        if isinstance(p, dict) and p.get("text"):
                            parts.append(str(p["text"]))
        joined = "\n".join(parts).strip()
        if joined:
            return joined
    return ""


def _tool_name_for(raw: dict[str, Any], text: str) -> str:
    explicit = raw.get("tool_name") or raw.get("tool") or raw.get("name")
    if isinstance(explicit, str) and explicit.strip():
        return explicit.strip()

    kind = str(raw.get("type") or raw.get("kind") or raw.get("checkpoint") or "").lower()
    if any(k in kind for k in ("shell", "command", "tool", "bash", "terminal")):
        return "execute_command"
    if any(k in kind for k in ("output", "completion", "response", "model")):
        return "model_output"
    if any(k in kind for k in ("prompt", "user", "chat", "input", "message")):
        return "user_prompt"

    lower = text.lower()
    if any(tok in lower for tok in ("curl ", "rm -rf", "bash ", "/bin/", "chmod ", "wget ")):
        return "execute_command"
    return "user_prompt"


def _arg_key_for(tool_name: str) -> str:
    if tool_name in {"execute_command", "shell", "bash", "run_terminal_cmd"}:
        return "cmd"
    if tool_name in {"model_output", "llm_response"}:
        return "output"
    return "prompt"


def normalize_to_tool_events(raw: Any) -> list[ToolCallEvent] | None:
    """Return ToolCallEvents if ``raw`` can be interpreted; else None.

    ``None`` means the caller should fall back to strict ToolCallEvent validation
    (or 422).
    """
    if isinstance(raw, list):
        out: list[ToolCallEvent] = []
        for item in raw:
            evs = normalize_to_tool_events(item)
            if evs:
                out.extend(evs)
        return out or None

    if not isinstance(raw, dict):
        return None

    # Already a native tool-call shape
    if raw.get("tool_name") and raw.get("session_id") and raw.get("agent_id"):
        return None  # let TypeAdapter validate natively

    text = _pick_text(raw)
    if not text:
        logger.info(
            "Harness/ingest body not mapped (no text). keys=%s type=%s",
            sorted(raw.keys()),
            raw.get("type"),
        )
        return None

    tool_name = _tool_name_for(raw, text)
    agent_id = str(raw.get("agent_id") or raw.get("agent") or raw.get("source") or "harness")
    session_id = _as_uuid(raw.get("session_id") or raw.get("conversation_id") or raw.get("chat_id"))
    arg_key = _arg_key_for(tool_name)
    arguments: dict[str, Any] = {arg_key: text}
    # Keep extras for forensics without breaking detectors
    for k in ("path", "url", "cwd", "language"):
        if k in raw and raw[k] is not None:
            arguments[k] = raw[k]

    event = ToolCallEvent(
        session_id=session_id,
        agent_id=agent_id[:128],
        tool_name=tool_name[:128],
        arguments=arguments,
        trace_id=str(raw.get("trace_id") or raw.get("id") or uuid.uuid4()),
    )
    logger.info(
        "Mapped external scan → tool_call agent=%s tool=%s chars=%d",
        event.agent_id,
        event.tool_name,
        len(text),
    )
    return [event]


def enforcement_view(
    pipeline_result: dict[str, Any],
    *,
    monitor_only: bool = False,
) -> dict[str, Any]:
    """Augment ARTSA ingest result with Harness-friendly allow/block flags.

    Harness ``securityResponseBlocks`` treats ``allowed:false``, ``blocked:true``,
    ``action:KILL``, and ``status:blocked`` as a hard chat block. For live
    prompt/output monitoring we keep the pipe open (``allowed:true``) so every
    message still reaches ARTSA until the user disables the security service.
    Tool/shell scans still hard-block.
    """
    verdict = pipeline_result.get("verdict") or {}
    action = str(verdict.get("recommended_action") or "NONE").upper()
    risky = action in {"KILL", "QUARANTINE"} or str(verdict.get("verdict") or "").upper() in {
        "BREACHED",
        "SUSPICIOUS",
    }

    if monitor_only:
        return {
            **pipeline_result,
            "ok": True,
            # Keep Harness Session.prompt open — continuous live monitor.
            "allowed": True,
            "blocked": False,
            "action": "NONE",
            "status": "monitored",
            "mode": "monitor",
            "advisory": True,
            "advisory_blocked": risky,
            "advisory_action": action if risky else "NONE",
        }

    blocked = action in {"KILL", "QUARANTINE"}
    return {
        **pipeline_result,
        "ok": True,
        "allowed": not blocked,
        "blocked": blocked,
        "action": action,
        "status": "blocked" if blocked else "allowed",
        "mode": "enforce",
        "execution_allowed": pipeline_result.get("execution_allowed", not blocked),
        "scan_phase": pipeline_result.get("scan_phase", "pre_exec"),
    }
