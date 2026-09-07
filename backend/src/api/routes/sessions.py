"""Sessions Management and Telemetry Stream Endpoints."""

import json
import logging
import uuid
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.dependencies import get_current_tenant, get_db, get_session_tracker
from src.api.ws_auth import require_ws_auth
from src.core.models.events import ToolCallEvent
from src.core.models.sessions import Session
from src.data import memory_store
from src.data.repositories.evaluations import EvaluationRepository
from src.data.repositories.events import EventRepository
from src.data.repositories.sessions import SessionRepository
from src.services.session_tracker import SessionTracker
from src.services.telemetry_bus import telemetry_bus

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Sessions"])


class SessionActionRequest(BaseModel):
    action: Literal["KILL", "QUARANTINE", "THROTTLE", "ALERT", "RELEASE", "CLOSE"] = Field(
        ..., description="Action to enforce on agent session (RELEASE/CLOSE are incident workflow)"
    )


class TimelineEntry(BaseModel):
    event: ToolCallEvent
    evaluation: dict[str, Any] | None = None


_ACTION_TARGET_STATUS = {
    "KILL": "BREACHED",
    "QUARANTINE": "QUARANTINED",
    "CLOSE": "CLOSED",
    "RELEASE": "ACTIVE",
}


def _lookup_session(session_id: uuid.UUID, tracker: SessionTracker) -> Session | None:
    return tracker.get_session(session_id) or memory_store.get_session(session_id)


async def _require_tenant_session(
    session_id: uuid.UUID,
    tenant_id: str,
    tracker: SessionTracker,
    db: AsyncSession,
) -> Session:
    session = _lookup_session(session_id, tracker)
    if not session:
        repo = SessionRepository(db)
        session = await repo.get_session(session_id)
    if not session or session.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Session {session_id} not found")
    return session


@router.get("/sessions", response_model=list[Session])
async def list_sessions(
    tenant_id: str | None = Query(None),
    status: str | None = Query(None),
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    tracker: SessionTracker = Depends(get_session_tracker),
    current_tenant: str = Depends(get_current_tenant),
):
    """List agent sessions for the authenticated tenant only."""
    del tenant_id  # callers cannot select another org via query string
    effective_tenant = current_tenant
    active = list(tracker.active_sessions.values())
    if effective_tenant:
        active = [s for s in active if s.tenant_id == effective_tenant]
    if status:
        active = [s for s in active if s.status == status]
    if active:
        return active[offset : offset + limit]

    repo = SessionRepository(db)
    return await repo.list_sessions(tenant_id=effective_tenant, status=status, limit=limit, offset=offset)


@router.get("/sessions/{session_id}", response_model=Session)
async def get_session_details(
    session_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    tracker: SessionTracker = Depends(get_session_tracker),
    tenant_id: str = Depends(get_current_tenant),
):
    """Fetch details for a specific session by UUID."""
    return await _require_tenant_session(session_id, tenant_id, tracker, db)


@router.get("/sessions/{session_id}/timeline", response_model=list[TimelineEntry])
async def get_session_timeline(
    session_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    tracker: SessionTracker = Depends(get_session_tracker),
    tenant_id: str = Depends(get_current_tenant),
):
    """Return tool call events with containment evaluations ordered by timestamp."""
    await _require_tenant_session(session_id, tenant_id, tracker, db)
    event_repo = EventRepository(db)
    eval_repo = EvaluationRepository(db)

    tracked_events = tracker.session_events.get(str(session_id), [])
    events = tracked_events if tracked_events else await event_repo.get_by_session(session_id)
    events = sorted(events, key=lambda e: e.timestamp)

    evaluations = await eval_repo.get_by_session(session_id)

    return [
        TimelineEntry(
            event=evt,
            evaluation=evaluations.get(str(evt.id)),
        )
        for evt in events
    ]


@router.post("/sessions/{session_id}/action")
async def enforce_session_action(
    session_id: uuid.UUID,
    payload: SessionActionRequest,
    db: AsyncSession = Depends(get_db),
    tracker: SessionTracker = Depends(get_session_tracker),
    tenant_id: str = Depends(get_current_tenant),
):
    """Enforce a containment action. Authorization is server-side; tenant mismatch is 404."""
    session = await _require_tenant_session(session_id, tenant_id, tracker, db)

    # Ensure tracker has the session for in-memory follow-up ingest checks
    if not tracker.get_session(session_id):
        tracker.active_sessions[str(session_id)] = session

    target_status = _ACTION_TARGET_STATUS.get(payload.action)
    if target_status and session.status == target_status:
        logger.info("Idempotent %s on session %s (already %s)", payload.action, session_id, session.status)
        return {
            "session_id": str(session_id),
            "enforced_action": payload.action,
            "status": session.status,
            "idempotent": True,
        }

    tracker.apply_action(session_id, payload.action)
    repo = SessionRepository(db)
    updated = await repo.apply_action(session_id, payload.action)
    final = updated or tracker.get_session(session_id) or session
    event_id = str(uuid.uuid4())
    trace_id = str(uuid.uuid4())

    telemetry_bus.publish(
        {
            "type": "session_action",
            "event_id": event_id,
            "trace_id": trace_id,
            "session_id": str(session_id),
            "tenant_id": tenant_id,
            "agent_id": final.agent_id,
            "action": payload.action,
            "session_status": final.status,
            "risk_score": final.max_risk_score,
            "verdict": "BREACHED" if payload.action == "KILL" else "SUSPICIOUS",
            "severity": "CRITICAL" if payload.action == "KILL" else "HIGH",
            "flags": ["manual_containment"],
            "hmac_state": "unwired",
            "hmac_verified": None,
            "actor": tenant_id,
            "result": final.status,
            "reason": "operator_containment",
        }
    )

    logger.info("Enforced action %s on session %s → %s", payload.action, session_id, final.status)

    return {
        "session_id": str(session_id),
        "enforced_action": payload.action,
        "status": final.status,
        "idempotent": False,
        "trace_id": trace_id,
        "event_id": event_id,
    }


@router.websocket("/sessions/{session_id}/stream")
async def session_websocket_stream(websocket: WebSocket, session_id: uuid.UUID):
    """Live WebSocket telemetry stream for a specific session."""
    if await require_ws_auth(websocket) is None:
        return

    await websocket.accept()
    logger.info("WebSocket connected for session stream %s", session_id)
    try:
        while True:
            data = await websocket.receive_text()
            await websocket.send_text(
                json.dumps(
                    {
                        "session_id": str(session_id),
                        "event": "TELEMETRY_ACK",
                        "received": data,
                    }
                )
            )
    except WebSocketDisconnect:
        logger.info("WebSocket disconnected for session stream %s", session_id)
