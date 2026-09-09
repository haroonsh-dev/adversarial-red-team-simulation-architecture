"""Event Ingestion Pipeline Endpoint."""

import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import TypeAdapter, ValidationError
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.responses import JSONResponse

from src.api.dependencies import (
    get_current_tenant,
    get_db,
    get_event_processor,
    get_redis,
    get_session_tracker,
    rate_limit_dependency,
)
from src.core.models.events import ToolCallEvent
from src.services.event_processor import EventProcessor
from src.services.harness_ingest_adapter import (
    enforcement_view,
    is_health_check,
    normalize_to_tool_events,
)
from src.services.ingest_pipeline import ContainedSessionError, run_ingest_pipeline
from src.services.approval_service import consume_retry_token
from src.services.session_tracker import SessionTracker

router = APIRouter(tags=["Ingestion"])
logger = logging.getLogger(__name__)

_TOOL_CALL_ADAPTER = TypeAdapter(ToolCallEvent | list[ToolCallEvent])


async def _handle_ingest_body(
    raw: Any,
    *,
    tenant_id: str,
    db: AsyncSession,
    redis: Any,
    processor: EventProcessor,
    tracker: SessionTracker,
) -> dict[str, Any] | JSONResponse:
    if is_health_check(raw):
        return JSONResponse(
            status_code=200,
            content={
                "ok": True,
                "service": "artsa",
                "status": "healthy",
                "ping": True,
                "endpoint": "/api/v1/ingest",
            },
        )

    events: list[ToolCallEvent] | None = None
    mapped = normalize_to_tool_events(raw)
    if mapped:
        events = mapped
    else:
        try:
            payload = _TOOL_CALL_ADAPTER.validate_python(raw)
        except ValidationError as exc:
            logger.warning(
                "Ingest rejected (422). keys=%s",
                sorted(raw.keys()) if isinstance(raw, dict) else type(raw).__name__,
            )
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=exc.errors(),
            ) from exc
        events = payload if isinstance(payload, list) else [payload]

    if not events:
        raise HTTPException(status_code=400, detail="Empty event payload")

    # A retry token is bound to this exact tenant/session/tool/arguments tuple.
    # Consume it before processing; a malformed or reused token fails closed.
    for event in events:
        if event.approval_retry_token:
            if not consume_retry_token(
                redis, event.approval_retry_token, tenant_id=tenant_id,
                session_id=event.session_id, tool_name=event.tool_name, arguments=event.arguments,
            ):
                raise HTTPException(status_code=403, detail="Invalid or already used approval retry token")

    # Live chat checkpoints (prompt/output) stay in monitor mode so Harness keeps
    # posting every message until the user disables Custom Security Service.
    scan_type = str(raw.get("type") or "").lower() if isinstance(raw, dict) else ""
    monitor_only = scan_type in {"prompt_scan", "output_scan"} or all(
        e.tool_name in {"user_prompt", "model_output"} for e in events
    )

    try:
        result = await run_ingest_pipeline(
            events,
            tenant_id=tenant_id,
            db=db,
            redis=redis,
            processor=processor,
            tracker=tracker,
        )
    except ContainedSessionError as exc:
        # Soft response — never 403 the Harness browser client.
        return JSONResponse(
            status_code=200,
            content={
                "ok": True,
                "allowed": bool(monitor_only),
                "blocked": not monitor_only,
                "action": "NONE" if monitor_only else "KILL",
                "status": "monitored" if monitor_only else "blocked",
                "mode": "monitor" if monitor_only else "enforce",
                "advisory": True,
                "advisory_blocked": True,
                "session_id": exc.session_id,
                "session_status": exc.session_status,
                "message": "Session is contained — further tool calls rejected",
                "verdict": {
                    "verdict": "BREACHED",
                    "recommended_action": "KILL",
                    "confidence": 1.0,
                    "reasoning": f"Session already contained ({exc.session_status})",
                },
            },
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return enforcement_view(result, monitor_only=monitor_only)


@router.post("/ingest", status_code=status.HTTP_201_CREATED, response_model=None)
async def ingest_events(
    request: Request,
    tenant_id: str = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
    redis=Depends(get_redis),
    processor: EventProcessor = Depends(get_event_processor),
    tracker: SessionTracker = Depends(get_session_tracker),
    _: None = Depends(rate_limit_dependency),
) -> dict[str, Any] | JSONResponse:
    """Ingest tool call event(s), evaluate risk, and return verdicts for enforcement.

    Accepts native ``ToolCallEvent`` payloads and common Harness scan shapes
    (prompt / shell / model-output text) so connected chat clients populate
    Command Center + Logs.
    """
    try:
        raw = await request.json()
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid JSON body") from exc

    return await _handle_ingest_body(
        raw,
        tenant_id=tenant_id,
        db=db,
        redis=redis,
        processor=processor,
        tracker=tracker,
    )


@router.post("/inspect", status_code=status.HTTP_200_OK, response_model=None)
async def inspect_alias(
    request: Request,
    tenant_id: str = Depends(get_current_tenant),
    db: AsyncSession = Depends(get_db),
    redis=Depends(get_redis),
    processor: EventProcessor = Depends(get_event_processor),
    tracker: SessionTracker = Depends(get_session_tracker),
    _: None = Depends(rate_limit_dependency),
) -> dict[str, Any] | JSONResponse:
    """Alias for Harness 'Custom Security Service' URLs ending in ``/v1/inspect``."""
    try:
        raw = await request.json()
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid JSON body") from exc

    return await _handle_ingest_body(
        raw,
        tenant_id=tenant_id,
        db=db,
        redis=redis,
        processor=processor,
        tracker=tracker,
    )
