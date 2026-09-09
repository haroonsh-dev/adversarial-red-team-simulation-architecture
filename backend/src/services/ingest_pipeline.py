"""Shared ingest pipeline — process + persist tool-call events.

Used by ``POST /ingest`` and Phase 2 ``POST /situations/evaluate?persist=true``.

Latency design: evaluate → update in-memory session → **publish telemetry**
→ then persist DB / alerts. Dashboards see events in milliseconds; durability
follows on the same request before the HTTP response returns.
"""

from __future__ import annotations

import hashlib
import logging
import time
from datetime import UTC, datetime
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from src.core.config import settings
from src.core.models.events import ToolCallEvent
from src.core.models.sessions import Session
from src.core.severity import severity_from_score
from src.data import memory_store
from src.data.repositories.evaluations import EvaluationRepository
from src.data.repositories.events import EventRepository
from src.data.repositories.sessions import SessionRepository
from src.services.alert_store import persist_alert, record_alert_from_evaluation
from src.services.event_processor import EventProcessor
from src.services.session_tracker import SessionTracker
from src.services.telemetry_bus import telemetry_bus
from src.services.approval_service import create_request
from src.runtime.circuit_breaker import circuit_breaker, record_breaker_trip

logger = logging.getLogger(__name__)

_CONTAINED_STATUSES = frozenset({"BREACHED", "QUARANTINED", "CLOSED", "PENDING_APPROVAL"})
_ENFORCE_ACTIONS = frozenset({"KILL", "QUARANTINE"})
# Chat / output checkpoints from Harness: keep scanning every message.
# Hard-containing the session after the first BREACH returns 403 and breaks
# the live custom-security client ("connection failed").
_MONITOR_ONLY_TOOLS = frozenset({"user_prompt", "model_output"})
_celery_import_warned = False


def maybe_enqueue_celery(event: ToolCallEvent) -> None:
    global _celery_import_warned
    if not settings.USE_CELERY:
        return
    try:
        from src.workers.tasks.process_events import process_tool_call_event

        _celery_import_warned = False
        process_tool_call_event.delay(event.model_dump(mode="json"))
    except ImportError as exc:
        if not _celery_import_warned:
            _celery_import_warned = True
            logger.warning(
                "USE_CELERY=true but the Celery worker stack is not importable (%s). "
                "Events will be processed synchronously instead.",
                exc,
            )
    except Exception as exc:
        logger.debug("Celery enqueue skipped: %s", exc)


class ContainedSessionError(Exception):
    """Raised when ingest is rejected because the session is already contained."""

    def __init__(self, session_id: str, session_status: str) -> None:
        self.session_id = session_id
        self.session_status = session_status
        super().__init__(f"Session {session_id} is contained ({session_status})")


def _is_monitor_only(event: ToolCallEvent) -> bool:
    return event.tool_name in _MONITOR_ONLY_TOOLS


def _scan_phase(event: ToolCallEvent) -> str:
    """Pre-exec = arguments only (tool has not returned). Post-exec = output scan."""
    return "post_exec" if event.response is not None else "pre_exec"


def _redact_post_exec_response(event: ToolCallEvent, sec_events: list[Any]) -> None:
    """Remove SDK tool output after scanning, retaining safe forensic metadata."""
    if not event.post_exec_redacted or event.response is None:
        return

    raw = str(event.response)
    event.response_sha256 = hashlib.sha256(raw.encode("utf-8", errors="replace")).hexdigest()
    event.response_findings = [
        {
            "detector": sec.detector,
            "event_type": sec.event_type,
            "severity": sec.severity,
            "risk_score": sec.risk_score,
            "description": sec.description,
            "evidence": {
                key: value
                for key, value in (sec.evidence or {}).items()
                if key in {"matched_pattern", "span", "match_length", "source", "fail_closed"}
            },
        }
        for sec in sec_events
    ]
    event.response = None


def _execution_allowed(action: str, *, monitor_only: bool) -> bool:
    if monitor_only:
        return True
    return action not in _ENFORCE_ACTIONS


def _publish_telemetry(
    *,
    event: ToolCallEvent,
    risk_score: Any,
    verdict: Any,
    sec_events: list[Any],
    enforced: bool,
    session_status: str | None,
    tenant_id: str | None = None,
) -> None:
    severity = severity_from_score(risk_score.overall_score)
    telemetry_bus.publish(
        {
            "type": "tool_call",
            "event_id": str(event.id),
            "trace_id": event.trace_id,
            "session_id": str(event.session_id),
            "agent_id": event.agent_id,
            "tool_name": event.tool_name,
            "risk_score": risk_score.overall_score,
            "verdict": verdict.verdict,
            "confidence": verdict.confidence,
            "action": verdict.recommended_action,
            "severity": severity,
            "flags": risk_score.flags,
            "security_event_count": len(sec_events),
            "detectors": [e.detector for e in sec_events],
            "security_events": [
                {"detector": e.detector, "risk_score": e.risk_score, "severity": e.severity}
                for e in sec_events
            ],
            "enforced": enforced,
            "session_status": session_status,
            "tenant_id": tenant_id,
            "hmac_state": "unwired",
            "hmac_verified": None,
            "latency_ms": event.latency_ms,
        }
    )


async def run_ingest_pipeline(
    events: list[ToolCallEvent],
    *,
    tenant_id: str,
    db: AsyncSession,
    redis: Any,
    processor: EventProcessor,
    tracker: SessionTracker,
) -> dict[str, Any]:
    """Evaluate events, push live telemetry ASAP, then persist."""
    if not events:
        raise ValueError("Empty event payload")

    ingest_start = time.perf_counter()
    event_repo = EventRepository(db)
    session_repo = SessionRepository(db)
    eval_repo = EvaluationRepository(db)

    if settings.ARTSA_BLOCK_CONTAINED_SESSIONS:
        for event in events:
            if _is_monitor_only(event):
                continue
            existing = tracker.get_session(event.session_id) or memory_store.get_session(event.session_id)
            if existing and existing.status in _CONTAINED_STATUSES:
                raise ContainedSessionError(str(event.session_id), existing.status)
            if await circuit_breaker.is_open(db, tenant_id=tenant_id, session_id=event.session_id):
                raise ContainedSessionError(str(event.session_id), "BREACHED")

    evaluations: list[dict[str, Any]] = []
    auto_enforced: str | None = None
    session_status: str | None = None
    redis_entries: list[dict[str, Any]] = []
    pending_alerts: list[Any] = []
    approval_id: str | None = None

    # --- Hot path: detect + memory + WS publish (no await except session create) ---
    for event in events:
        redis_entries.append(
            {
                "id": str(event.id),
                "session_id": str(event.session_id),
                "agent_id": event.agent_id,
                "tool_name": event.tool_name,
                "arguments": str(event.arguments),
            }
        )

        if not tracker.get_session(event.session_id):
            session = Session(id=event.session_id, agent_id=event.agent_id, tenant_id=tenant_id)
            tracker.active_sessions[str(event.session_id)] = session
            tracker.session_events[str(event.session_id)] = []
            memory_store.store_session(session)
            await session_repo.create_session(session, commit=False)

        tracker.add_event_to_session(event.session_id, event)
        # Fast path for Harness prompt/output; full detector pack for tools.
        # No response → pre-execution argument gate (ToolOutputScanner does not run).
        risk_score, verdict, sec_events = processor.process(
            event, fast=_is_monitor_only(event)
        )
        scan_phase = _scan_phase(event)
        _redact_post_exec_response(event, sec_events)

        # With ASI08 enabled, a hard decision blocks this operation immediately
        # but the session only becomes BREACHED once the breaker trips.
        mark_breached = (
            verdict.verdict == "BREACHED"
            and not _is_monitor_only(event)
            and not settings.ARTSA_CIRCUIT_BREAKER_ENABLED
        )
        tracker.update_session(
            session_id=event.session_id,
            risk_score=risk_score.overall_score,
            is_breached=mark_breached,
        )
        memory_store.update_session_risk(
            event.session_id,
            risk_score.overall_score,
            breached=mark_breached,
        )

        enforced = False
        action = verdict.recommended_action
        monitor_only = _is_monitor_only(event)
        execution_allowed = _execution_allowed(action, monitor_only=monitor_only)
        retry_authorized = bool(event.approval_retry_token)
        if action == "QUARANTINE" and not retry_authorized:
            approval = await create_request(
                db, tenant_id=tenant_id, session_id=event.session_id, tool_name=event.tool_name,
                arguments=event.arguments, findings=sec_events,
                requester={"agent_id": event.agent_id, "trace_id": event.trace_id},
            )
            approval_id = approval.id
            tracker.apply_action(event.session_id, "PENDING_APPROVAL")
            enforced = True
            auto_enforced = "APPROVAL_REQUIRED"
            session_status = "PENDING_APPROVAL"
        elif (
            (settings.ARTSA_AUTO_ENFORCE or event.post_exec_redacted)
            and action in _ENFORCE_ACTIONS
            and not monitor_only
        ):
            enforced = True
            if action == "KILL" and settings.ARTSA_CIRCUIT_BREAKER_ENABLED:
                opened = await circuit_breaker.record_block(
                    db, tenant_id=tenant_id, session_id=event.session_id
                )
                if opened:
                    record_breaker_trip(event.session_id)
                    tracker.apply_action(event.session_id, action)
                    auto_enforced = action
                else:
                    auto_enforced = "BLOCKED_OPERATION"
            else:
                tracker.apply_action(event.session_id, action)
                auto_enforced = action

        sess = tracker.get_session(event.session_id)
        session_status = sess.status if sess else session_status

        # Push to Command Center / Logs before slower DB + alert work.
        _publish_telemetry(
            event=event,
            risk_score=risk_score,
            verdict=verdict,
            sec_events=sec_events,
            enforced=enforced,
            session_status=session_status,
            tenant_id=tenant_id,
        )

        evaluation = {
            "event_id": str(event.id),
            "tool_name": event.tool_name,
            "risk_score": risk_score.overall_score,
            "verdict": verdict.verdict,
            "confidence": verdict.confidence,
            "recommended_action": verdict.recommended_action,
            "reasoning": verdict.reasoning,
            "flags": risk_score.flags,
            "rule_based_score": risk_score.rule_based_score,
            "statistical_score": risk_score.statistical_score,
            "semantic_score": risk_score.semantic_score,
            "goal_drift_score": risk_score.goal_drift_score,
            "injection_score": risk_score.injection_score,
            "trajectory_score": risk_score.trajectory_score,
            "tool_output_score": risk_score.tool_output_score,
            "canary_score": risk_score.canary_score,
            "sql_injection_score": risk_score.sql_injection_score,
            "mcp_destructive_score": risk_score.mcp_destructive_score,
            "policy_score": risk_score.policy_score,
            "tenant_id": tenant_id,
            "bypass_depth": risk_score.bypass_depth,
            "security_event_count": len(sec_events),
            "enforced": enforced,
            "scan_phase": scan_phase,
            "execution_allowed": execution_allowed,
            "pre_exec_blocked": scan_phase == "pre_exec" and not execution_allowed,
        }
        evaluations.append(evaluation)

        await session_repo.update_risk_score(
            event.session_id,
            risk_score.overall_score,
            breached=mark_breached,
            commit=False,
        )
        if enforced and auto_enforced != "BLOCKED_OPERATION":
            await session_repo.apply_action(
                event.session_id,
                "PENDING_APPROVAL" if auto_enforced == "APPROVAL_REQUIRED" else action,
                commit=False,
            )
        await eval_repo.upsert(str(event.id), event.session_id, evaluation, commit=False)

        try:
            from src.services.mongo_sink import mongo_sink

            mongo_sink.enqueue_evaluation(
                {
                    **evaluation,
                    "session_id": str(event.session_id),
                    "agent_id": event.agent_id,
                    "ts": datetime.now(UTC).isoformat(),
                }
            )
        except Exception as exc:  # pragma: no cover
            logger.debug("MongoDB evaluation enqueue skipped: %s", exc)

        maybe_enqueue_celery(event)

        alert = record_alert_from_evaluation(
            session_id=event.session_id,
            agent_id=event.agent_id,
            tool_name=event.tool_name,
            risk_score=risk_score.overall_score,
            verdict=verdict.verdict,
            recommended_action=verdict.recommended_action,
            tenant_id=tenant_id,
        )
        if alert is not None:
            pending_alerts.append(alert)

    await event_repo.bulk_insert(events)
    for alert in pending_alerts:
        await persist_alert(db, alert, commit=False)

    if redis_entries:
        redis.xadd_many("events:incoming", redis_entries)
    await db.commit()

    first_event = events[0]
    first_eval = evaluations[0]
    from src.services.prometheus_metrics import record_ingest

    elapsed_ms = (time.perf_counter() - ingest_start) * 1000
    record_ingest(elapsed_ms)
    if elapsed_ms > 50:
        logger.info(
            "Ingest %.1fms (events=%s tool=%s fast=%s)",
            elapsed_ms,
            len(events),
            first_event.tool_name,
            _is_monitor_only(first_event),
        )

    return {
        "ingested": len(events),
        "session_id": str(first_event.session_id),
        "timestamp": datetime.now(UTC).isoformat(),
        "risk_score": {"overall_score": first_eval["risk_score"], "flags": first_eval["flags"]},
        "verdict": {
            "verdict": first_eval["verdict"],
            "confidence": first_eval["confidence"],
            "recommended_action": first_eval["recommended_action"],
            "reasoning": first_eval["reasoning"],
        },
        "evaluations": evaluations,
        "session_status": session_status,
        "auto_enforced_action": auto_enforced,
        "security_events_count": first_eval.get("security_event_count", 0),
        "latency_ms": round(elapsed_ms, 2),
        "scan_phase": first_eval.get("scan_phase", "pre_exec"),
        "execution_allowed": first_eval.get("execution_allowed", True),
        "pre_exec_blocked": first_eval.get("pre_exec_blocked", False),
        "approval_id": approval_id,
    }
