"""Truthful six-agent hop / event contract (ARTSA 2.0).

The planned chain is Research → Curator → Red Team → Target → Judge → Defender.
Only Red Team, Target, and Judge execute today. Wired hops are HMAC-signed.
Research / Curator / Defender stay not_wired and must not receive fake signatures.
"""

from __future__ import annotations

from datetime import UTC, datetime
from enum import Enum

from pydantic import BaseModel, ConfigDict, Field


class AgentRole(str, Enum):
    """Canonical agent identifiers — match campaign_live_bus LIVE_AGENTS."""

    RESEARCH = "research"
    CURATOR = "curator"
    RED_TEAM = "red_team"
    TARGET = "target"
    JUDGE = "judge"
    DEFENDER = "defender"


class HopExecutionState(str, Enum):
    """Whether this agent actually ran.

    ``not_wired`` — planned agent with no implementation (Research / Curator / Defender).
    ``executed`` — this hop ran in the campaign loop.
    ``idle`` — wired agent that has not run in this snapshot (existing Live Monitor term).
    """

    EXECUTED = "executed"
    NOT_WIRED = "not_wired"
    IDLE = "idle"


class HmacState(str, Enum):
    """Inter-agent HMAC handoff state. Matches Command Center ``HmacState``.

    Wired hops emit ``ok`` or ``fail`` after verify. Unwired agents stay ``unwired``.
    """

    UNWIRED = "unwired"
    UNVERIFIED = "unverified"
    OK = "ok"
    FAIL = "fail"


class HopEventType(str, Enum):
    ATTACK = "attack"
    RESPONSE = "response"
    VERDICT = "verdict"
    STATUS = "status"


WIRED_ROLES: tuple[AgentRole, ...] = (
    AgentRole.RED_TEAM,
    AgentRole.TARGET,
    AgentRole.JUDGE,
)
NOT_WIRED_ROLES: tuple[AgentRole, ...] = (
    AgentRole.RESEARCH,
    AgentRole.CURATOR,
    AgentRole.DEFENDER,
)
CHAIN_ORDER: tuple[AgentRole, ...] = (
    AgentRole.RESEARCH,
    AgentRole.CURATOR,
    AgentRole.RED_TEAM,
    AgentRole.TARGET,
    AgentRole.JUDGE,
    AgentRole.DEFENDER,
)

# Unwired agents always use this. Wired hops pass HmacState.OK / FAIL instead.
HMAC_HANDOFF_UNWIRED = HmacState.UNWIRED


class AgentHopEvent(BaseModel):
    """One hop on the agent chain — executed or explicitly not wired."""

    model_config = ConfigDict(from_attributes=True)

    campaign_id: str
    round: int | None = None
    agent: AgentRole
    role: AgentRole
    event_type: HopEventType
    timestamp: datetime = Field(default_factory=lambda: datetime.now(UTC))
    status: HopExecutionState
    latency_ms: float | None = None
    verdict: str | None = None
    evidence_id: str | None = None
    hmac_state: HmacState = HmacState.UNWIRED
    hmac_verified: bool | None = None


class AgentChainMember(BaseModel):
    """Roster row: planned vs actually wired/executed."""

    model_config = ConfigDict(from_attributes=True)

    agent: AgentRole
    role: AgentRole
    status: HopExecutionState
    hmac_state: HmacState = HmacState.UNWIRED
    hmac_verified: bool | None = None


def chain_roster(
    *,
    executed: frozenset[AgentRole] | None = None,
    wired_hmac: HmacState = HmacState.UNWIRED,
    wired_verified: bool | None = None,
) -> list[AgentChainMember]:
    """All six planned agents. Research / Curator / Defender are always not_wired."""
    ran = executed or frozenset()
    members: list[AgentChainMember] = []
    for role in CHAIN_ORDER:
        if role in NOT_WIRED_ROLES:
            status = HopExecutionState.NOT_WIRED
            hmac_state = HMAC_HANDOFF_UNWIRED
            hmac_verified = None
        elif role in ran:
            status = HopExecutionState.EXECUTED
            hmac_state = wired_hmac
            hmac_verified = wired_verified
        else:
            status = HopExecutionState.IDLE
            hmac_state = HMAC_HANDOFF_UNWIRED
            hmac_verified = None
        members.append(
            AgentChainMember(
                agent=role,
                role=role,
                status=status,
                hmac_state=hmac_state,
                hmac_verified=hmac_verified,
            )
        )
    return members


def executed_hop(
    *,
    campaign_id: str,
    round_number: int | None,
    agent: AgentRole,
    event_type: HopEventType,
    timestamp: datetime | None = None,
    latency_ms: float | None = None,
    verdict: str | None = None,
    evidence_id: str | None = None,
    hmac_state: HmacState = HmacState.UNWIRED,
    hmac_verified: bool | None = None,
) -> AgentHopEvent:
    """Build a hop for an agent that actually ran. Unwired roles are rejected."""
    if agent in NOT_WIRED_ROLES:
        raise ValueError(f"{agent.value} is not wired and must not be emitted as executed")
    return AgentHopEvent(
        campaign_id=campaign_id,
        round=round_number,
        agent=agent,
        role=agent,
        event_type=event_type,
        timestamp=timestamp or datetime.now(UTC),
        status=HopExecutionState.EXECUTED,
        latency_ms=latency_ms,
        verdict=verdict,
        evidence_id=evidence_id,
        hmac_state=hmac_state,
        hmac_verified=hmac_verified,
    )
