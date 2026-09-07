"""Canonical security-event contract validation."""

import pytest
from pydantic import ValidationError
from src.core.models.hops import HmacState
from src.core.models.ops_events import (
    OPERATOR_ACTIONS,
    SecurityOpsEvent,
    TelemetryMode,
    unwired_hmac,
)


def test_security_ops_event_requires_agents():
    evt = SecurityOpsEvent(source_agent="Red Team", target_agent="Target")
    assert evt.event_id
    assert evt.trace_id
    assert evt.hmac.hmac_state == HmacState.UNWIRED
    assert evt.hmac.signature_status == "unwired"
    assert evt.hmac.verification_result is None
    assert evt.hmac.replay_detected is None


def test_security_ops_event_rejects_confidence_out_of_range():
    with pytest.raises(ValidationError):
        SecurityOpsEvent(source_agent="a", target_agent="b", confidence=1.5)


def test_unwired_hmac_never_claims_verify():
    rec = unwired_hmac(sender="Red Team", receiver="Target", event_id="e1")
    dumped = rec.model_dump()
    assert dumped["hmac_state"] == "unwired"
    assert dumped["signature_status"] == "unwired"
    assert dumped["verification_result"] is None


def test_operator_catalog_does_not_fake_unimplemented_actions():
    by_id = {a.action_id: a for a in OPERATOR_ACTIONS}
    assert by_id["KILL_SESSION"].implemented is True
    assert by_id["QUARANTINE_AGENT"].implemented is True
    assert by_id["BLOCK_TOOL"].implemented is False
    assert by_id["REPLAY_ROUND"].implemented is False
    assert by_id["DEPLOY_MITIGATION"].implemented is False


def test_telemetry_mode_includes_honest_values():
    assert TelemetryMode.LIVE.value == "LIVE"
    assert TelemetryMode.SIMULATION.value == "SIMULATION"
    assert TelemetryMode.STALE.value == "STALE"
    assert TelemetryMode.DISCONNECTED.value == "DISCONNECTED"
