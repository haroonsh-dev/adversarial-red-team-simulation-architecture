"""Live MCP Protocol Interceptor — allow-listed methods + full containment engine.

WS-2.5 (MCP parity): besides the method/tool allow-lists and fast regex checks,
every ``tools/call`` is ALSO scored by the full ``ContainmentEngine`` (the same
detector stack as the ingest path: rule-based, SQLi, MCP-destructive, semantic,
goal-drift, trajectory, tool-output). A call the engine scores >= SUSPICIOUS is
blocked, so MCP traffic gets the same verdicts as the main pipeline instead of
a separate, weaker regex list.
"""

from __future__ import annotations

import logging
import os
import re
import uuid
from typing import Any, ClassVar

from pydantic import BaseModel, Field

from src.containment.engine import ContainmentEngine
from src.core.models.events import ToolCallEvent

logger = logging.getLogger(__name__)

_DEFAULT_ALLOWED_METHODS = frozenset(
    {
        "tools/list",
        "tools/call",
        "tools/get",
        "prompts/list",
        "prompts/get",
        "resources/list",
        "resources/read",
        "initialize",
        "ping",
        "notifications/initialized",
    }
)

_DENY_PREFIXES = ("Disallowed", "Tool not")


class MCPJsonRpcRequest(BaseModel):
    """MCP JSON-RPC 2.0 Request Payload."""

    jsonrpc: str = "2.0"
    id: Any | None = 1
    method: str
    params: dict[str, Any] | None = Field(default_factory=dict)


class MCPInspectionResult(BaseModel):
    """Result of MCP JSON-RPC payload inspection."""

    is_safe: bool
    threat_score: float
    detected_patterns: list[str]
    method: str
    action_taken: str
    inspected_params: dict[str, Any]
    # WS-2.5: full containment-engine verdict on tools/call (0 when not scored).
    engine_score: float = 0.0
    engine_verdict: str = ""
    engine_events: list[str] = Field(default_factory=list)


class MCPProxyInterceptor:
    """Inline inspector for Model Context Protocol (MCP) with method/tool allow-lists.

    WORKPACKAGE B (B6): previously each injection pattern added +3 and blocking
    required threat_score >= 4, so a *single* dangerous signal (delete_user,
    /etc/passwd, rm -rf) always passed. Now CRITICAL patterns each carry a
    hard-deny score >= 8 — one hit ⇒ BLOCKED. Corroborating patterns (base64)
    still add +3 and only block in combination.
    """

    # (regex, label, threat_score) — a single CRITICAL match hard-denies.
    CRITICAL_PATTERNS: ClassVar[list[tuple[str, str, float]]] = [
        (r"(?i)system override", "System Persona Override", 8.0),
        (r"(?i)ignore previous instructions", "Instruction Hijack", 8.0),
        (r"(?i)exfiltrate", "Data Exfiltration Intent", 8.0),
        (r"(?i)delete_user|drop_table|rm -rf", "Unauthorized System Command", 9.0),
        (r"(?i)169\.254\.169\.254", "Cloud Metadata Probe", 9.0),
        (r"(?i)/etc/passwd|/etc/shadow", "Sensitive Path Access", 9.0),
    ]

    # (regex, label, additive_score) — corroborating signals, +3 each.
    ADDITIVE_PATTERNS: ClassVar[list[tuple[str, str, float]]] = [
        (r"(?i)base64", "Base64 Obfuscation Attempt", 3.0),
    ]

    def __init__(
        self,
        allowed_methods: set[str] | None = None,
        allowed_tools: set[str] | None = None,
    ) -> None:
        self._history: list[MCPInspectionResult] = []
        env_methods = os.getenv("ARTSA_MCP_ALLOWED_METHODS")
        if allowed_methods is not None:
            self.allowed_methods = {m.strip() for m in allowed_methods if m.strip()}
        elif env_methods:
            self.allowed_methods = {m.strip() for m in env_methods.split(",") if m.strip()}
        else:
            self.allowed_methods = set(_DEFAULT_ALLOWED_METHODS)

        env_tools = os.getenv("ARTSA_MCP_ALLOWED_TOOLS", "").strip()
        if allowed_tools is not None:
            self.allowed_tools = {t.strip() for t in allowed_tools if t.strip()}
        elif env_tools:
            self.allowed_tools = {t.strip() for t in env_tools.split(",") if t.strip()}
        else:
            self.allowed_tools = set()

        # Shared containment engine (WS-2.5 parity with the ingest path).
        self._engine = ContainmentEngine()

    def inspect_request(
        self, req: MCPJsonRpcRequest, *, session_id: uuid.UUID | None = None
    ) -> MCPInspectionResult:
        """Inspect MCP JSON-RPC for disallowed methods, tools, or injection patterns."""
        detected: list[str] = []
        threat_score = 0.0

        if req.method not in self.allowed_methods:
            detected.append(f"Disallowed MCP method: {req.method}")
            threat_score = 10.0

        params = req.params or {}
        tool_name = str(params.get("name") or params.get("tool") or "")
        if (
            self.allowed_tools
            and req.method.startswith("tools/")
            and tool_name
            and tool_name not in self.allowed_tools
        ):
            detected.append(f"Tool not on allow-list: {tool_name}")
            threat_score = max(threat_score, 9.0)

        params_str = str(params)
        # CRITICAL patterns: a single match hard-denies (threat >= 8).
        for pattern, label, score in self.CRITICAL_PATTERNS:
            if re.search(pattern, params_str):
                detected.append(label)
                threat_score = max(threat_score, score)
        # Corroborating patterns: each adds +3; alone they do not block.
        for pattern, label, score in self.ADDITIVE_PATTERNS:
            if re.search(pattern, params_str):
                detected.append(label)
                threat_score += score

        # WS-2.5 MCP parity: run tools/call through the full containment engine
        # (same detector stack as the ingest path). SUSPICIOUS+ blocks, matching
        # ingest enforcement (QUARANTINE/KILL are both enforced there).
        engine_score = 0.0
        engine_verdict = ""
        engine_events: list[str] = []
        if req.method.startswith("tools/"):
            event = ToolCallEvent(
                session_id=session_id or uuid.uuid4(),
                agent_id="mcp-proxy",
                tool_name="mcp_call",
                arguments=params,
            )
            risk, verdict, sec_events = self._engine.evaluate_event(event)
            engine_score = risk.overall_score
            engine_verdict = verdict.verdict
            engine_events = [e.event_type for e in sec_events]
            if engine_score >= 50.0:  # SUSPICIOUS / BREACHED
                detected.append(
                    f"Containment engine {engine_verdict} "
                    f"({engine_score:.0f}: {', '.join(engine_events) or 'no flags'})"
                )
                threat_score = max(threat_score, 8.0)

        threat_score = min(threat_score, 10.0)
        hard_deny = any(d.startswith(_DENY_PREFIXES) for d in detected)
        is_safe = threat_score < 4.0 and not hard_deny
        action_taken = "PASSED" if is_safe else "BLOCKED"

        result = MCPInspectionResult(
            is_safe=is_safe,
            threat_score=threat_score,
            detected_patterns=detected,
            method=req.method,
            action_taken=action_taken,
            inspected_params=params,
            engine_score=engine_score,
            engine_verdict=engine_verdict,
            engine_events=engine_events,
        )
        self._history.append(result)
        logger.info(
            "MCP Inspection [%s]: Safe=%s | Score=%.1f | Patterns=%s",
            req.method,
            is_safe,
            threat_score,
            detected,
        )
        return result

    def get_history(self) -> list[MCPInspectionResult]:
        return self._history
