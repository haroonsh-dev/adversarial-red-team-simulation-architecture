"""Project existing ingest + campaign buses into the Command Center ops contract.

Does not invent detections, HMAC verifies, or LIVE freshness.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Any

from src.core.asi import HMAC_STATUS, HMAC_THREAT_CODE, AsiStatus, classify_asi
from src.core.models.hops import (
    NOT_WIRED_ROLES,
    AgentRole,
    HmacState,
    chain_roster,
)
from src.core.models.ops_events import (
    OPERATOR_ACTIONS,
    AgentOpsSnapshot,
    AgentOpsState,
    DetectionMetrics,
    HmacIntegrityRecord,
    SecurityOpsEvent,
    TelemetryMode,
    unwired_hmac,
)
from src.data.campaign_job_store import campaign_job_store
from src.services.campaign_live_bus import campaign_live_bus, default_agents
from src.services.telemetry_bus import telemetry_bus

logger = logging.getLogger(__name__)

STALE_AFTER_SEC = 30.0
_DEFAULT_TENANTS = frozenset({"default_org", "default_tenant"})
_SEVERITIES = frozenset({"CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"})

_LIVE_TO_OPS: dict[str, AgentOpsState] = {
    "idle": AgentOpsState.IDLE,
    "running": AgentOpsState.ACTIVE,
    "done": AgentOpsState.WAITING,
}

_ROLE_LABEL = {
    AgentRole.RESEARCH: "Research",
    AgentRole.CURATOR: "Curator",
    AgentRole.RED_TEAM: "Red Team",
    AgentRole.TARGET: "Target",
    AgentRole.JUDGE: "Judge",
    AgentRole.DEFENDER: "Defender",
}


def _parse_ts(raw: Any) -> datetime:
    if isinstance(raw, datetime):
        return raw if raw.tzinfo else raw.replace(tzinfo=UTC)
    if isinstance(raw, str) and raw:
        try:
            return datetime.fromisoformat(raw)
        except ValueError:
            pass
    return datetime.now(UTC)


def telemetry_mode(*, now: datetime | None = None, last_ts: datetime | None = None) -> TelemetryMode:
    """LIVE only when a real event arrived recently. Never SIMULATION here."""
    if last_ts is None:
        return TelemetryMode.DISCONNECTED
    clock = now or datetime.now(UTC)
    if last_ts.tzinfo is None:
        last_ts = last_ts.replace(tzinfo=UTC)
    age = (clock - last_ts).total_seconds()
    if age <= STALE_AFTER_SEC:
        return TelemetryMode.LIVE
    return TelemetryMode.STALE


def _rate(num: int, den: int) -> float | None:
    if den <= 0:
        return None
    return round(100.0 * num / den, 1)


def detection_metrics_from_verdicts(
    verdict_counts: dict[str, int],
    *,
    containment_contained: int = 0,
    containment_total: int = 0,
    detection_latency_ms: float | None = None,
) -> DetectionMetrics:
    """Red-team scoring: BLOCKED = TP, SUCCESS/PARTIAL = FN. No FP/TN labels."""
    blocked = int(verdict_counts.get("BLOCKED", 0) or 0)
    success = int(verdict_counts.get("SUCCESS", 0) or 0)
    partial = int(verdict_counts.get("PARTIAL", 0) or 0)
    tp = blocked
    fn = success + partial
    judged = tp + fn
    recall = _rate(tp, judged)
    return DetectionMetrics(
        judged=judged,
        true_positive=tp,
        false_negative=fn,
        false_positive=None,
        true_negative=None,
        detection_rate=recall,
        precision=None,
        recall=recall,
        false_positive_rate=None,
        false_negative_rate=_rate(fn, judged),
        detection_latency_ms=detection_latency_ms,
        containment_rate=_rate(containment_contained, containment_total),
        adaptive_detection=None,
        baseline_detection=None,
        adaptive_lift=None,
    )


def adaptive_lift(adaptive: float | None, baseline: float | None) -> float | None:
    """adaptive_lift = adaptive_detection - baseline_detection. Null if either missing."""
    if adaptive is None or baseline is None:
        return None
    return round(adaptive - baseline, 1)


def _is_baseline_job(job: dict[str, Any]) -> bool:
    name = str(job.get("name") or "").lower()
    profile = str(job.get("attack_profile") or "").lower()
    return "baseline" in name or "baseline" in profile


def metrics_from_campaigns(jobs: list[dict[str, Any]]) -> DetectionMetrics:
    """Use persisted campaign summaries only. Missing baseline → lift is null."""
    completed = [j for j in jobs if str(j.get("status", "")).upper() == "COMPLETED"]
    adaptive_job = None
    baseline_job = None
    for job in reversed(completed):
        summary = job.get("summary_json") or job.get("summary") or {}
        if not isinstance(summary, dict):
            continue
        if _is_baseline_job(job):
            if baseline_job is None:
                baseline_job = (job, summary)
        elif adaptive_job is None:
            adaptive_job = (job, summary)

    combined: dict[str, int] = {}
    latency: float | None = None
    for job in completed:
        summary = job.get("summary_json") or job.get("summary") or {}
        if not isinstance(summary, dict):
            continue
        for key, val in (summary.get("results_by_verdict") or {}).items():
            combined[str(key).upper()] = combined.get(str(key).upper(), 0) + int(val or 0)
        if latency is None and summary.get("total_duration_ms") and summary.get("completed_rounds"):
            try:
                latency = float(summary["total_duration_ms"]) / max(
                    1, int(summary["completed_rounds"])
                )
            except (TypeError, ValueError, ZeroDivisionError):
                latency = None

    metrics = detection_metrics_from_verdicts(combined, detection_latency_ms=latency)

    def _rate_from_summary(summary: dict[str, Any]) -> float | None:
        counts = {
            str(k).upper(): int(v or 0)
            for k, v in (summary.get("results_by_verdict") or {}).items()
        }
        return detection_metrics_from_verdicts(counts).detection_rate

    adaptive = _rate_from_summary(adaptive_job[1]) if adaptive_job else None
    baseline = _rate_from_summary(baseline_job[1]) if baseline_job else None
    metrics.adaptive_detection = adaptive
    metrics.baseline_detection = baseline
    metrics.adaptive_lift = adaptive_lift(adaptive, baseline)
    metrics.adaptive_campaign_id = str(adaptive_job[0]["id"]) if adaptive_job else None
    metrics.baseline_campaign_id = str(baseline_job[0]["id"]) if baseline_job else None
    return metrics


def _severity(raw: Any) -> str:
    value = str(raw or "INFO").upper()
    return value if value in _SEVERITIES else "INFO"


def _optional_float(raw: Any) -> float | None:
    if raw is None:
        return None
    try:
        return float(raw)
    except (TypeError, ValueError):
        return None


def _confidence(raw: Any) -> float | None:
    value = _optional_float(raw)
    if value is None or not 0.0 <= value <= 1.0:
        return None
    return value


def _role_label(agent: str) -> str:
    try:
        return _ROLE_LABEL[AgentRole(agent)]
    except ValueError:
        return agent


def _visible_to_tenant(raw: dict[str, Any], tenant_id: str) -> bool:
    ev_tenant = raw.get("tenant_id")
    if ev_tenant is None:
        return tenant_id in _DEFAULT_TENANTS
    return str(ev_tenant) == tenant_id


def project_ingest_event(raw: dict[str, Any]) -> SecurityOpsEvent:
    detectors = [str(d) for d in (raw.get("detectors") or [])] if isinstance(raw.get("detectors"), list) else []
    asi, status = classify_asi(detectors=detectors)
    threat_status: str = "unclassified"
    if asi and status:
        threat_status = "classified" if status == AsiStatus.SUPPORTED else "unsupported"
    event_id = str(raw.get("event_id") or raw.get("id") or raw.get("session_id") or "")
    if not event_id:
        event_id = f"ingest-{raw.get('timestamp')}-{raw.get('tool_name')}"
    agent = str(raw.get("agent_id") or "unknown")
    return SecurityOpsEvent(
        event_id=event_id,
        campaign_id=raw.get("campaign_id"),
        session_id=str(raw.get("session_id")) if raw.get("session_id") else None,
        round_id=raw.get("round_id"),
        timestamp=_parse_ts(raw.get("timestamp") or raw.get("ts")),
        source_agent=agent,
        target_agent="containment",
        threat_code=asi,
        threat_status=threat_status,  # type: ignore[arg-type]
        severity=_severity(raw.get("severity")),  # type: ignore[arg-type]
        payload=str(raw.get("tool_name") or raw.get("type") or ""),
        detection_signal=",".join(detectors) if detectors else str(raw.get("type") or "tool_call"),
        verdict=str(raw.get("verdict") or ""),
        mitigation=str(raw.get("action") or raw.get("recommended_action") or ""),
        confidence=_confidence(raw.get("confidence")),
        trace_id=str(raw.get("trace_id") or event_id),
        tool_name=raw.get("tool_name"),
        latency_ms=_optional_float(raw.get("latency_ms")),
        status=str(raw.get("session_status") or raw.get("status") or "") or None,
        hmac=unwired_hmac(sender=agent, receiver="containment", event_id=event_id),
        event_type=str(raw.get("type") or "tool_call"),
    )


def project_ingest_event_safe(raw: dict[str, Any]) -> SecurityOpsEvent | None:
    try:
        return project_ingest_event(raw)
    except Exception as exc:
        logger.warning("Skipping malformed ingest telemetry: %s", exc)
        return None


def project_campaign_hop(raw: dict[str, Any]) -> SecurityOpsEvent | None:
    hop = raw.get("hop")
    if not isinstance(hop, dict):
        return None
    try:
        return _project_campaign_hop(raw, hop)
    except Exception as exc:
        logger.warning("Skipping malformed campaign hop: %s", exc)
        return None


def _project_campaign_hop(raw: dict[str, Any], hop: dict[str, Any]) -> SecurityOpsEvent | None:
    agent = str(hop.get("agent") or raw.get("actor") or "")
    if agent in {r.value for r in NOT_WIRED_ROLES}:
        return None
    campaign_id = str(raw.get("campaign_id") or hop.get("campaign_id") or "")
    round_no = hop.get("round") if hop.get("round") is not None else raw.get("round")
    round_id = f"{campaign_id}:r{round_no}" if campaign_id and round_no is not None else None
    event_id = str(hop.get("evidence_id") or raw.get("seq") or f"{campaign_id}:{raw.get('kind')}:{round_no}")
    kind = str(raw.get("kind") or hop.get("event_type") or "attack")
    source, target = _hop_pair(agent, kind)
    category = str(raw.get("attack_type") or "")
    cat_code = category.split(":", 1)[0].strip() if category else None
    asi, status = classify_asi(attack_category=cat_code)
    threat_status = "unclassified"
    if asi and status:
        threat_status = "classified" if status == AsiStatus.SUPPORTED else "unsupported"
    latency = hop.get("latency_ms")
    try:
        latency_ms = float(latency) if latency is not None else None
    except (TypeError, ValueError):
        latency_ms = None
    return SecurityOpsEvent(
        event_id=f"hop-{event_id}-{kind}",
        campaign_id=campaign_id or None,
        session_id=None,
        round_id=round_id,
        timestamp=_parse_ts(raw.get("ts") or hop.get("timestamp")),
        source_agent=source,
        target_agent=target,
        threat_code=asi,
        threat_status=threat_status,  # type: ignore[arg-type]
        severity="INFO",
        payload=str(raw.get("summary") or ""),
        detection_signal=kind,
        verdict=str(hop.get("verdict") or raw.get("outcome") or ""),
        mitigation="",
        confidence=None,
        trace_id=str(hop.get("evidence_id") or event_id),
        latency_ms=latency_ms,
        status=str(hop.get("status") or "executed"),
        hmac=_hmac_from_hop(hop, source, target, event_id),
        event_type=kind,
    )


def _hmac_from_hop(hop: dict[str, Any], source: str, target: str, event_id: str) -> HmacIntegrityRecord:
    state_raw = str(hop.get("hmac_state") or "unwired")
    try:
        state = HmacState(state_raw)
    except ValueError:
        state = HmacState.UNWIRED
    verified = hop.get("hmac_verified")
    if state == HmacState.OK or verified is True:
        return HmacIntegrityRecord(
            sender=source,
            receiver=target,
            hmac_state=HmacState.OK,
            signature_status="verified",
            verification_result="OK",
            replay_detected=False,
            event_id=event_id,
        )
    if state == HmacState.FAIL or verified is False:
        return HmacIntegrityRecord(
            sender=source,
            receiver=target,
            hmac_state=HmacState.FAIL,
            signature_status="failed",
            verification_result=str(hop.get("verification_result") or "FAIL"),
            replay_detected=bool(hop.get("replay_detected")),
            event_id=event_id,
            containment_result="CAMPAIGN_ABORTED",
        )
    return unwired_hmac(sender=source, receiver=target, event_id=event_id)


def _hop_pair(agent: str, kind: str) -> tuple[str, str]:
    if kind == "attack" or agent == "red_team":
        return "Red Team", "Target"
    if kind == "response" or agent == "target":
        return "Target", "Judge"
    if kind == "verdict" or agent == "judge":
        return "Judge", "Target"
    return _role_label(agent), "Target"


def agent_snapshots(
    *,
    campaign_status: str | None,
    live_agents: dict[str, str] | None,
    contained: bool = False,
    current_round: int | None = None,
    last_event_id: str | None = None,
    hop_latencies: dict[str, float | None] | None = None,
) -> list[AgentOpsSnapshot]:
    stage = live_agents or default_agents("idle")
    roster = chain_roster()
    out: list[AgentOpsSnapshot] = []
    for member in roster:
        role = member.agent
        if member.status.value == "not_wired":
            state = AgentOpsState.NOT_WIRED
        elif contained and role in (AgentRole.TARGET, AgentRole.RED_TEAM):
            state = AgentOpsState.CONTAINED
        else:
            state = _LIVE_TO_OPS.get(stage.get(role.value, "idle"), AgentOpsState.IDLE)
            if campaign_status and campaign_status.upper() in {"COMPLETED", "FAILED"} and state != AgentOpsState.NOT_WIRED:
                state = AgentOpsState.IDLE
        lat = (hop_latencies or {}).get(role.value)
        out.append(
            AgentOpsSnapshot(
                agent_id=role.value,
                role=_ROLE_LABEL[role],
                state=state,
                current_task=None,
                last_event_id=last_event_id if state == AgentOpsState.ACTIVE else None,
                latency_ms=lat if state != AgentOpsState.NOT_WIRED else None,
                risk=None,
                current_round=current_round if state != AgentOpsState.NOT_WIRED else None,
            )
        )
    return out


def build_ops_snapshot(
    *,
    tenant_id: str,
    jobs: list[dict[str, Any]] | None = None,
    ingest_history: list[dict[str, Any]] | None = None,
    now: datetime | None = None,
) -> dict[str, Any]:
    jobs = jobs if jobs is not None else campaign_job_store.list_jobs(limit=100, tenant_id=tenant_id)
    raw_ingest = ingest_history if ingest_history is not None else telemetry_bus.get_history(limit=80)
    ingest = [e for e in raw_ingest if isinstance(e, dict) and _visible_to_tenant(e, tenant_id)]

    ops_events: list[SecurityOpsEvent] = []
    seen: set[str] = set()
    for raw in ingest:
        evt = project_ingest_event_safe(raw)
        if evt is None or evt.event_id in seen:
            continue
        seen.add(evt.event_id)
        ops_events.append(evt)

    current_campaign = None
    current_round = None
    live_agents = None
    campaign_status = None
    hop_lats: dict[str, float | None] = {}
    for job in jobs:
        if str(job.get("status", "")).upper() == "RUNNING":
            current_campaign = job
            break
    if current_campaign is None and jobs:
        current_campaign = jobs[0]

    if current_campaign:
        cid = str(current_campaign["id"])
        hop_events = campaign_live_bus.history(cid, limit=80)
        campaign_status = str(current_campaign.get("status") or "")
        current_round = current_campaign.get("rounds_completed")
        for raw in hop_events:
            projected = project_campaign_hop(raw)
            if projected is None or projected.event_id in seen:
                continue
            seen.add(projected.event_id)
            ops_events.append(projected)
            hop = raw.get("hop") if isinstance(raw, dict) else None
            if isinstance(hop, dict) and hop.get("agent") and hop.get("latency_ms") is not None:
                hop_lats[str(hop["agent"])] = hop.get("latency_ms")
            if raw.get("agents"):
                live_agents = raw["agents"]
            if raw.get("round") is not None:
                current_round = raw.get("round")

    ops_events.sort(key=lambda e: e.timestamp, reverse=True)
    last_ts = ops_events[0].timestamp if ops_events else None
    mode = telemetry_mode(now=now, last_ts=last_ts)

    metrics = metrics_from_campaigns(jobs)
    session_ids = {str(e.get("session_id")) for e in ingest if e.get("session_id")}
    contained_ids = {
        str(e.get("session_id"))
        for e in ingest
        if e.get("session_id")
        and str(e.get("session_status") or "").upper() in {"QUARANTINED", "BREACHED", "CLOSED"}
    }
    if session_ids:
        metrics.containment_rate = _rate(len(contained_ids), len(session_ids))

    agents = agent_snapshots(
        campaign_status=campaign_status,
        live_agents=live_agents,
        contained=False,
        current_round=int(current_round) if current_round is not None else None,
        last_event_id=ops_events[0].event_id if ops_events else None,
        hop_latencies=hop_lats,
    )

    hmac_family = {
        "threat_code": HMAC_THREAT_CODE,
        "status": HMAC_STATUS.value,
        "hmac_state": "ok",
        "note": (
            "Red Team → Target → Judge payloads are HMAC-signed with Redis replay "
            "protection. Research/Curator/Defender remain unwired. WS tickets are not handoffs."
        ),
    }

    return {
        "telemetry_mode": mode.value,
        "tenant_id": tenant_id,
        "current_campaign": (
            {
                "id": current_campaign.get("id"),
                "name": current_campaign.get("name"),
                "status": current_campaign.get("status"),
                "rounds_completed": current_campaign.get("rounds_completed"),
                "total_rounds": current_campaign.get("max_rounds") or current_campaign.get("total_rounds"),
            }
            if current_campaign
            else None
        ),
        "current_session_id": ops_events[0].session_id if ops_events else None,
        "current_round": current_round,
        "agents": [a.model_dump(mode="json") for a in agents],
        "events": [e.model_dump(mode="json") for e in ops_events[:100]],
        "event_count": len(ops_events),
        "metrics": metrics.model_dump(mode="json"),
        "hmac": hmac_family,
        "operator_actions": [a.model_dump(mode="json") for a in OPERATOR_ACTIONS],
        "last_event_at": last_ts.isoformat() if last_ts else None,
        "remaining": {
            "hmac_handoff": "wired_rt_target_judge",
            "asi08": "not_implemented",
            "research_curator_defender": "not_wired",
            "precision_fpr": "null_without_benign_labels",
            "new_websocket": "not_added — reuse GET /telemetry/ops plus existing ingest WS",
        },
    }
