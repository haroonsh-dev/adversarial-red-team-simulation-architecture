"""Score model-emitted tool_calls before they are returned to the client."""

from __future__ import annotations

import json
import uuid
from typing import Any

from src.containment.engine import ContainmentEngine
from src.core.models.events import ToolCallEvent
from src.runtime.actions import RuntimeAction
from src.runtime.evidence import RedactedFinding, sha256_text

_DETECTOR = "RuntimeToolCallGate"
_ENGINE = ContainmentEngine()


def parse_openai_tool_calls(message: dict[str, Any] | None) -> list[dict[str, Any]]:
    if not isinstance(message, dict):
        return []
    raw = message.get("tool_calls") or []
    parsed: list[dict[str, Any]] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        fn = item.get("function") or {}
        name = str(fn.get("name") or item.get("name") or "")
        arguments = fn.get("arguments") if isinstance(fn, dict) else item.get("arguments")
        parsed.append({"id": item.get("id"), "name": name, "arguments": _coerce_args(arguments)})
    return parsed


def parse_anthropic_tool_uses(content: Any) -> list[dict[str, Any]]:
    if not isinstance(content, list):
        return []
    parsed: list[dict[str, Any]] = []
    for block in content:
        if not isinstance(block, dict) or block.get("type") != "tool_use":
            continue
        parsed.append(
            {
                "id": block.get("id"),
                "name": str(block.get("name") or ""),
                "arguments": _coerce_args(block.get("input")),
            }
        )
    return parsed


def _coerce_args(raw: Any) -> dict[str, Any]:
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, str):
        try:
            loaded = json.loads(raw) if raw else {}
        except json.JSONDecodeError:
            return {"raw": raw}
        return loaded if isinstance(loaded, dict) else {"raw": raw}
    if raw is None:
        return {}
    return {"raw": str(raw)}


def score_tool_calls(
    tool_calls: list[dict[str, Any]],
    *,
    body: str,
    session_id: uuid.UUID,
) -> list[RedactedFinding]:
    findings: list[RedactedFinding] = []
    for call in tool_calls:
        name = str(call.get("name") or "unknown_tool")
        arguments = call.get("arguments") if isinstance(call.get("arguments"), dict) else {}
        event = ToolCallEvent(
            session_id=session_id,
            agent_id="artsa-proxy",
            tool_name=name,
            arguments=arguments,
            response=None,
        )
        risk, verdict, _events = _ENGINE.evaluate_event(event)
        action = RuntimeAction.ALLOW
        if verdict.recommended_action == "KILL" or risk.overall_score >= 80.0:
            action = RuntimeAction.BLOCK
        elif verdict.recommended_action == "QUARANTINE" or risk.overall_score >= 50.0:
            action = RuntimeAction.QUARANTINE
        if action == RuntimeAction.ALLOW:
            continue
        findings.append(
            RedactedFinding(
                detector=_DETECTOR,
                category="UNSAFE_TOOL_CALL",
                body_sha256=sha256_text(body),
                span_start=0,
                span_end=0,
                match_length=0,
                action=action,
                tool_name=name,
                match_sha256=sha256_text(name),
            )
        )
    return findings
