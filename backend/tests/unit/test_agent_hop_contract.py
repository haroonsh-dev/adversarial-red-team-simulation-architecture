"""Typed hop/event contract — validation and honesty rules."""

from datetime import UTC, datetime

import pytest
from pydantic import ValidationError
from src.core.models.hops import (
    NOT_WIRED_ROLES,
    WIRED_ROLES,
    AgentHopEvent,
    AgentRole,
    HmacState,
    HopEventType,
    HopExecutionState,
    chain_roster,
    executed_hop,
)


def test_executed_hop_schema_validates():
    hop = executed_hop(
        campaign_id="camp-1",
        round_number=2,
        agent=AgentRole.RED_TEAM,
        event_type=HopEventType.ATTACK,
        timestamp=datetime(2026, 9, 6, tzinfo=UTC),
        latency_ms=12.5,
        evidence_id="atk-1",
    )
    assert hop.status == HopExecutionState.EXECUTED
    assert hop.role == AgentRole.RED_TEAM
    assert hop.hmac_state == HmacState.UNWIRED
    assert hop.hmac_verified is None
    dumped = hop.model_dump(mode="json")
    again = AgentHopEvent.model_validate(dumped)
    assert again.latency_ms == 12.5


def test_executed_hop_rejects_unwired_agents():
    for role in NOT_WIRED_ROLES:
        with pytest.raises(ValueError, match="not wired"):
            executed_hop(
                campaign_id="c",
                round_number=1,
                agent=role,
                event_type=HopEventType.STATUS,
            )


def test_latency_null_when_unmeasured():
    hop = executed_hop(
        campaign_id="c",
        round_number=1,
        agent=AgentRole.JUDGE,
        event_type=HopEventType.VERDICT,
        latency_ms=None,
        verdict="BLOCKED",
    )
    assert hop.latency_ms is None
    assert hop.verdict == "BLOCKED"


def test_chain_roster_marks_research_curator_defender_not_wired():
    roster = chain_roster(executed=frozenset(WIRED_ROLES))
    by_agent = {m.agent: m for m in roster}
    assert by_agent[AgentRole.RESEARCH].status == HopExecutionState.NOT_WIRED
    assert by_agent[AgentRole.CURATOR].status == HopExecutionState.NOT_WIRED
    assert by_agent[AgentRole.DEFENDER].status == HopExecutionState.NOT_WIRED
    assert by_agent[AgentRole.RED_TEAM].status == HopExecutionState.EXECUTED
    assert by_agent[AgentRole.TARGET].status == HopExecutionState.EXECUTED
    assert by_agent[AgentRole.JUDGE].status == HopExecutionState.EXECUTED
    assert all(m.hmac_state == HmacState.UNWIRED for m in roster)
    assert all(m.hmac_verified is None for m in roster)


def test_chain_roster_idle_for_wired_agents_not_yet_run():
    roster = chain_roster(executed=frozenset({AgentRole.RED_TEAM}))
    by_agent = {m.agent: m for m in roster}
    assert by_agent[AgentRole.TARGET].status == HopExecutionState.IDLE
    assert by_agent[AgentRole.JUDGE].status == HopExecutionState.IDLE
    assert by_agent[AgentRole.RESEARCH].status == HopExecutionState.NOT_WIRED


def test_hop_event_rejects_invalid_status():
    with pytest.raises(ValidationError):
        AgentHopEvent(
            campaign_id="c",
            agent=AgentRole.TARGET,
            role=AgentRole.TARGET,
            event_type=HopEventType.RESPONSE,
            status="fabricated",  # type: ignore[arg-type]
        )
