"""Pydantic v2 Event Models."""

import uuid
from datetime import UTC, datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class ToolCallEvent(BaseModel):
    """Event model representing an individual tool execution by an AI agent."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID = Field(default_factory=uuid.uuid4)
    session_id: uuid.UUID
    agent_id: str
    tool_name: str
    arguments: dict[str, Any] = Field(default_factory=dict)
    timestamp: datetime = Field(default_factory=lambda: datetime.now(UTC))
    trace_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    response: dict[str, Any] | None = None
    # SDK post-execution mode: response is scanned transiently, then cleared
    # before event persistence. Only its digest and redacted findings remain.
    post_exec_redacted: bool = False
    response_sha256: str | None = None
    response_findings: list[dict[str, Any]] = Field(default_factory=list)
    approval_retry_token: str | None = None
    latency_ms: float | None = None


class SecurityEvent(BaseModel):
    """Event model representing a detected containment risk or anomaly."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID = Field(default_factory=uuid.uuid4)
    session_id: uuid.UUID
    agent_id: str
    event_type: Literal[
        "PROMPT_INJECTION",
        "TOOL_PROMPT_INJECTION",
        "JAILBREAK",
        "CREDENTIAL_THEFT",
        "REVERSE_SHELL",
        "EGRESS_TUNNEL",
        "EGRESS_EXFIL",
        "PRIVILEGE_ESCALATION",
        "GOAL_DRIFT",
        "SANDBOX_ESCAPE",
        "CANARY_TRIGGERED",
        "SENSITIVE_DATA_EXPOSED",
        "SQL_INJECTION",
        "MCP_DESTRUCTIVE_TOOL",
        "CODE_EXECUTION_ABUSE",
    ]
    severity: Literal["LOW", "MEDIUM", "HIGH", "CRITICAL"]
    risk_score: float = Field(ge=0.0, le=100.0)
    description: str
    evidence: dict[str, Any] = Field(default_factory=dict)
    timestamp: datetime = Field(default_factory=lambda: datetime.now(UTC))
    detector: str
