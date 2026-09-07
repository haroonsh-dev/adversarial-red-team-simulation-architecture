"""Canonical Command Center security-event contract (ARTSA 2.0 ops).

Snake_case matches the rest of the containment API. Command Center's
``StructuredSecurityEvent`` uses camelCase — map at the frontend boundary,
do not duplicate a second schema here.

HMAC fields on wired hops are verified. Unwired agents stay ``unwired``.
"""

from __future__ import annotations

from datetime import UTC, datetime
from enum import Enum
from typing import Any, Literal
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field

from src.core.models.hops import HmacState


class TelemetryMode(str, Enum):
    """Honest freshness. Never report LIVE without a recent real event."""

    LIVE = "LIVE"
    STALE = "STALE"
    DISCONNECTED = "DISCONNECTED"
    SIMULATION = "SIMULATION"


class AgentOpsState(str, Enum):
    """Agent stage for the interaction map. ``not_wired`` is not a fake idle."""

    IDLE = "idle"
    ACTIVE = "active"
    RESPONDING = "responding"
    WAITING = "waiting"
    CONTAINED = "contained"
    NOT_WIRED = "not_wired"


class HmacIntegrityRecord(BaseModel):
    """Inter-agent HMAC handoff record. Wired hops are verified; unwired agents stay unwired."""

    model_config = ConfigDict(from_attributes=True)

    sender: str | None = None
    receiver: str | None = None
    hmac_state: HmacState = HmacState.UNWIRED
    signature_status: Literal["unwired", "verified", "failed"] = "unwired"
    verification_result: str | None = None
    replay_detected: bool | None = None
    nonce: str | None = None
    event_id: str | None = None
    containment_result: str | None = None


def unwired_hmac(
    *,
    sender: str | None = None,
    receiver: str | None = None,
    event_id: str | None = None,
) -> HmacIntegrityRecord:
    return HmacIntegrityRecord(
        sender=sender,
        receiver=receiver,
        hmac_state=HmacState.UNWIRED,
        signature_status="unwired",
        verification_result=None,
        replay_detected=None,
        nonce=None,
        event_id=event_id,
        containment_result=None,
    )


class SecurityOpsEvent(BaseModel):
    """One validated security / hop event the Command Center can consume."""

    model_config = ConfigDict(from_attributes=True)

    event_id: str = Field(default_factory=lambda: str(uuid4()))
    campaign_id: str | None = None
    session_id: str | None = None
    round_id: str | None = None
    timestamp: datetime = Field(default_factory=lambda: datetime.now(UTC))
    source_agent: str
    target_agent: str
    threat_code: str | None = None
    threat_status: Literal["classified", "unsupported", "unwired", "unclassified"] = (
        "unclassified"
    )
    severity: Literal["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"] = "INFO"
    payload: str = ""
    detection_signal: str = ""
    verdict: str = ""
    mitigation: str = ""
    confidence: float | None = Field(default=None, ge=0.0, le=1.0)
    trace_id: str = Field(default_factory=lambda: str(uuid4()))
    tool_name: str | None = None
    tool_arguments: dict[str, Any] | None = None
    model: str | None = None
    provider: str | None = None
    latency_ms: float | None = None
    parent_event_id: str | None = None
    status: str | None = None
    hmac: HmacIntegrityRecord = Field(default_factory=unwired_hmac)
    event_type: str = "security"


class AgentOpsSnapshot(BaseModel):
    agent_id: str
    role: str
    state: AgentOpsState
    current_task: str | None = None
    last_event_id: str | None = None
    latency_ms: float | None = None
    risk: float | None = None
    current_round: int | None = None


class OperatorActionSpec(BaseModel):
    action_id: str
    implemented: bool
    method: str | None = None
    path: str | None = None
    note: str = ""


class DetectionMetrics(BaseModel):
    """Rates are 0–100 or null when the denominator is missing. Never invented."""

    judged: int = 0
    true_positive: int = 0
    false_negative: int = 0
    false_positive: int | None = None
    true_negative: int | None = None
    detection_rate: float | None = None
    precision: float | None = None
    recall: float | None = None
    false_positive_rate: float | None = None
    false_negative_rate: float | None = None
    detection_latency_ms: float | None = None
    containment_rate: float | None = None
    adaptive_detection: float | None = None
    baseline_detection: float | None = None
    adaptive_lift: float | None = None
    adaptive_campaign_id: str | None = None
    baseline_campaign_id: str | None = None


class AuditEvent(BaseModel):
    timestamp: datetime = Field(default_factory=lambda: datetime.now(UTC))
    actor: str
    action: str
    target: str
    result: str
    reason: str = ""
    campaign_id: str | None = None
    session_id: str | None = None
    trace_id: str = Field(default_factory=lambda: str(uuid4()))


# Operator actions that exist today vs interface-only TODOs.
OPERATOR_ACTIONS: tuple[OperatorActionSpec, ...] = (
    OperatorActionSpec(
        action_id="KILL_SESSION",
        implemented=True,
        method="POST",
        path="/api/v1/sessions/{session_id}/action",
        note="Body {action: KILL}. Authoritative on the server; frontend cannot authorize.",
    ),
    OperatorActionSpec(
        action_id="QUARANTINE_AGENT",
        implemented=True,
        method="POST",
        path="/api/v1/sessions/{session_id}/action",
        note="Quarantines the session, not a durable agent identity. There is no /containment/quarantine route.",
    ),
    OperatorActionSpec(
        action_id="BLOCK_TOOL",
        implemented=False,
        note="TODO: no per-tool block API. Policy rules can approximate via /policies.",
    ),
    OperatorActionSpec(
        action_id="REPLAY_ROUND",
        implemented=False,
        note="TODO: rounds are persisted; re-execution is not an API.",
    ),
    OperatorActionSpec(
        action_id="DEPLOY_MITIGATION",
        implemented=False,
        note="Human-gated: POST /policies/suggest and POST /findings/{id}/promote exist; no auto-deploy.",
    ),
)
