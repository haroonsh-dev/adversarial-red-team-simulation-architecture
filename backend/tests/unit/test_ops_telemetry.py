"""Ops telemetry projection — no fake LIVE, HMAC, lift, or wired agents."""

from datetime import UTC, datetime, timedelta

from src.core.models.ops_events import AgentOpsState
from src.services.ops_telemetry import (
    adaptive_lift,
    agent_snapshots,
    build_ops_snapshot,
    detection_metrics_from_verdicts,
    metrics_from_campaigns,
    project_ingest_event,
    project_ingest_event_safe,
    telemetry_mode,
)


def test_telemetry_mode_never_reports_live_without_recent_event():
    now = datetime(2026, 9, 7, 12, 0, tzinfo=UTC)
    assert telemetry_mode(now=now, last_ts=None).value == "DISCONNECTED"
    assert telemetry_mode(now=now, last_ts=now - timedelta(seconds=31)).value == "STALE"
    assert telemetry_mode(now=now, last_ts=now - timedelta(seconds=5)).value == "LIVE"
    assert telemetry_mode(now=now, last_ts=now).value != "SIMULATION"


def test_adaptive_lift_is_difference_or_null():
    assert adaptive_lift(80.0, 62.0) == 18.0
    assert adaptive_lift(80.0, None) is None
    assert adaptive_lift(None, 62.0) is None


def test_detection_metrics_do_not_invent_precision():
    metrics = detection_metrics_from_verdicts({"BLOCKED": 8, "SUCCESS": 2})
    assert metrics.judged == 10
    assert metrics.true_positive == 8
    assert metrics.false_negative == 2
    assert metrics.detection_rate == 80.0
    assert metrics.recall == 80.0
    assert metrics.precision is None
    assert metrics.false_positive_rate is None


def test_metrics_from_campaigns_null_lift_without_baseline():
    jobs = [
        {
            "id": "c1",
            "name": "adaptive run",
            "status": "COMPLETED",
            "summary_json": {"results_by_verdict": {"BLOCKED": 7, "SUCCESS": 3}},
        }
    ]
    metrics = metrics_from_campaigns(jobs)
    assert metrics.adaptive_detection == 70.0
    assert metrics.baseline_detection is None
    assert metrics.adaptive_lift is None


def test_metrics_from_campaigns_computes_lift_when_baseline_exists():
    jobs = [
        {
            "id": "base",
            "name": "nightly baseline",
            "status": "COMPLETED",
            "summary_json": {"results_by_verdict": {"BLOCKED": 6, "SUCCESS": 4}},
        },
        {
            "id": "adapt",
            "name": "adaptive campaign",
            "status": "COMPLETED",
            "summary_json": {"results_by_verdict": {"BLOCKED": 8, "SUCCESS": 2}},
        },
    ]
    metrics = metrics_from_campaigns(jobs)
    assert metrics.baseline_detection == 60.0
    assert metrics.adaptive_detection == 80.0
    assert metrics.adaptive_lift == 20.0
    assert metrics.baseline_campaign_id == "base"
    assert metrics.adaptive_campaign_id == "adapt"


def test_unwired_agents_stay_not_wired():
    snaps = agent_snapshots(campaign_status="RUNNING", live_agents={"red_team": "running"})
    by_id = {s.agent_id: s for s in snaps}
    assert by_id["research"].state == AgentOpsState.NOT_WIRED
    assert by_id["curator"].state == AgentOpsState.NOT_WIRED
    assert by_id["defender"].state == AgentOpsState.NOT_WIRED
    assert by_id["red_team"].state == AgentOpsState.ACTIVE
    assert by_id["research"].current_round is None


def test_project_ingest_does_not_invent_asi_or_hmac():
    evt = project_ingest_event(
        {
            "event_id": "e1",
            "agent_id": "agent-x",
            "session_id": "s1",
            "verdict": "SAFE",
            "severity": "LOW",
            "detectors": [],
        }
    )
    assert evt.threat_code is None
    assert evt.hmac.hmac_state.value == "unwired"
    assert evt.hmac.verification_result is None


def test_malformed_ingest_does_not_raise():
    evt = project_ingest_event_safe(
        {"confidence": 99, "latency_ms": "nope", "agent_id": "a", "event_id": "bad"}
    )
    assert evt is not None
    assert evt.confidence is None
    assert evt.latency_ms is None


def test_build_ops_snapshot_filters_tenant_and_dedupes():
    now = datetime(2026, 9, 7, 12, 0, tzinfo=UTC)
    ingest = [
        {
            "event_id": "dup",
            "tenant_id": "acme",
            "agent_id": "a",
            "session_id": "s1",
            "timestamp": now.isoformat(),
            "detectors": ["PromptInjectionDetector"],
            "verdict": "SUSPICIOUS",
            "severity": "HIGH",
        },
        {
            "event_id": "dup",
            "tenant_id": "acme",
            "agent_id": "a",
            "session_id": "s1",
            "timestamp": now.isoformat(),
            "detectors": ["PromptInjectionDetector"],
        },
        {
            "event_id": "other",
            "tenant_id": "globex",
            "agent_id": "b",
            "session_id": "s2",
            "timestamp": now.isoformat(),
        },
    ]
    snap = build_ops_snapshot(tenant_id="acme", jobs=[], ingest_history=ingest, now=now)
    assert snap["telemetry_mode"] == "LIVE"
    assert snap["event_count"] == 1
    assert snap["events"][0]["threat_code"] == "ASI01"
    assert snap["hmac"]["hmac_state"] == "ok"
    assert all(e["hmac"]["signature_status"] == "unwired" for e in snap["events"])


def test_empty_snapshot_is_disconnected_not_live():
    snap = build_ops_snapshot(tenant_id="acme", jobs=[], ingest_history=[])
    assert snap["telemetry_mode"] == "DISCONNECTED"
    assert snap["metrics"]["adaptive_lift"] is None
