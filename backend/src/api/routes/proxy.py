"""Detection-gated LLM reverse proxy routes (OpenAI & Anthropic compatible).

Exposed under both ``/v1/proxy/...`` and ``/api/v1/proxy/...`` so developers
can set ``base_url=http://localhost:8000/v1/proxy`` in any OpenAI/Anthropic
client and get containment enforcement transparently.
"""

from __future__ import annotations

import json
import logging
import time
import uuid
from collections.abc import AsyncIterator
from typing import Any

from fastapi import APIRouter, Body, Depends, Header, HTTPException, Request
from fastapi.responses import JSONResponse, Response, StreamingResponse

from src.core.config import settings
from src.gateway.llm_proxy import ProxyAction, get_llm_proxy
from src.gateway.url_safety import SSRFBlockedError
from src.runtime.actions import RuntimeAction
from src.runtime.audit import record_runtime_audit
from src.runtime.completions import (
    anthropic_output_blocked_body,
    gate_anthropic_completion,
    gate_openai_completion,
    openai_output_blocked_body,
)
from src.runtime.evidence import RedactedFinding, sha256_text
from src.runtime.gate import RuntimeDecision, get_runtime_gate
from src.runtime.session import apply_runtime_session_action
from src.runtime.stream import AnthropicStreamGate, OpenAIStreamGate, OpenAIToAnthropicStreamTranslator
from src.api.dependencies import get_current_tenant, get_db, get_redis, get_session_tracker
from src.data.orm import SessionORM
from src.data.repositories.sessions import SessionRepository
from src.services.approval_service import consume_retry_token, create_request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(tags=["LLM Proxy"])
logger = logging.getLogger(__name__)

_OPENAI_PROXY_TOOL = "llm_proxy.chat.completions"
_ANTHROPIC_PROXY_TOOL = "llm_proxy.messages"


def _sse(data: dict[str, Any], event: str | None = None) -> str:
    """Format a server-sent-event payload."""
    payload = json.dumps(data)
    if event:
        return f"event: {event}\ndata: {payload}\n\n"
    return f"data: {payload}\n\n"


def _openai_block_error(scan: dict[str, Any]) -> dict[str, Any]:
    return {
        "error": {
            "message": (
                f"ARTSA containment: prompt blocked (risk {scan['risk_score']:.1f}, "
                f"verdict {scan['verdict']}). Flags: {', '.join(scan['flags']) or 'none'}."
            ),
            "type": "artsa_containment_block",
            "param": None,
            "code": "prompt_blocked",
            "artsa": scan,
        }
    }


def _anthropic_block_error(scan: dict[str, Any]) -> dict[str, Any]:
    return {
        "type": "error",
        "error": {
            "type": "forbidden_error",
            "message": (
                f"ARTSA containment: prompt blocked (risk {scan['risk_score']:.1f}, "
                f"verdict {scan['verdict']})."
            ),
            "artsa": scan,
        },
    }


def _request_session_id(request: Request) -> uuid.UUID:
    cached = getattr(request.state, "artsa_session_id", None)
    if isinstance(cached, uuid.UUID):
        return cached
    try:
        session_id = uuid.UUID(request.headers.get("X-ARTSA-Session-ID", ""))
    except (ValueError, TypeError):
        session_id = uuid.uuid4()
    request.state.artsa_session_id = session_id
    return session_id


def _session_headers(session_id: uuid.UUID) -> dict[str, str]:
    return {"X-ARTSA-Session-ID": str(session_id)}


def _openai_output_block_error(decision: RuntimeDecision) -> dict[str, Any]:
    return openai_output_blocked_body(decision)


def _anthropic_output_block_error(decision: RuntimeDecision) -> dict[str, Any]:
    return anthropic_output_blocked_body(decision)


async def _record_output_decision(
    decision: RuntimeDecision, session_id: uuid.UUID, *, db: AsyncSession, tenant_id: str
) -> bool:
    """Audit output containment and trip ASI08 only after the configured limit."""
    if decision.action == RuntimeAction.ALLOW:
        return False
    record_runtime_audit(get_runtime_gate().to_audit(decision, session_id=session_id))
    if decision.action != RuntimeAction.BLOCK:
        apply_runtime_session_action(session_id, decision.action)
        return False
    from src.runtime.circuit_breaker import circuit_breaker, record_breaker_trip

    opened = await circuit_breaker.record_block(db, tenant_id=tenant_id, session_id=session_id)
    # Retain each rolling-window event across independent proxy requests.
    await db.commit()
    if opened:
        record_breaker_trip(session_id)
        apply_runtime_session_action(session_id, RuntimeAction.BLOCK)
        await SessionRepository(db).apply_action(session_id, "KILL", commit=False)
        await db.commit()
        try:
            from src.services import alert_store

            alert_store.record_alert_from_evaluation(
                session_id=session_id,
                agent_id="artsa-proxy",
                tool_name="llm_output",
                risk_score=100.0,
                verdict="BREACHED",
                recommended_action="KILL",
            )
        except Exception as exc:
            logger.debug("Output-block alert skipped: %s", exc)
    return opened


async def _circuit_breaker_open(db: AsyncSession, *, tenant_id: str, session_id: uuid.UUID) -> bool:
    from src.runtime.circuit_breaker import circuit_breaker

    return await circuit_breaker.is_open(db, tenant_id=tenant_id, session_id=session_id)


def _circuit_breaker_error(session_id: uuid.UUID) -> dict[str, Any]:
    return {
        "error": {
            "message": "ARTSA containment: circuit breaker open.",
            "type": "artsa_circuit_breaker_open",
            "code": "artsa_circuit_breaker_open",
            "artsa": {"session_id": str(session_id), "category": "ASI08"},
        }
    }


async def _ensure_proxy_session(db: AsyncSession, tracker: Any, session_id: uuid.UUID, tenant_id: str) -> None:
    from src.core.models.sessions import Session
    from src.data import memory_store

    session = tracker.get_session(session_id) or memory_store.get_session(session_id)
    if session is None:
        session = Session(id=session_id, agent_id="artsa-proxy", tenant_id=tenant_id)
    tracker.active_sessions[str(session_id)] = session
    tracker.session_events.setdefault(str(session_id), [])
    if memory_store.get_session(session_id) is None:
        memory_store.store_session(session)

    repo = SessionRepository(db)
    if repo._use_memory:
        return
    result = await db.execute(select(SessionORM).where(SessionORM.id == str(session_id)))
    if result.scalar_one_or_none() is None:
        await repo.create_session(session, commit=False)


async def _queue_quarantine_approval(
    *,
    db: AsyncSession,
    tracker: Any,
    tenant_id: str,
    session_id: uuid.UUID,
    decision: RuntimeDecision,
    tool_name: str,
    arguments: dict[str, Any],
    requester: dict[str, Any],
) -> Any:
    approval = await create_request(
        db,
        tenant_id=tenant_id,
        session_id=session_id,
        tool_name=tool_name,
        arguments=arguments,
        findings=decision.findings,
        requester=requester,
    )
    await _ensure_proxy_session(db, tracker, session_id, tenant_id)
    tracker.apply_action(session_id, "PENDING_APPROVAL")
    await SessionRepository(db).apply_action(session_id, "PENDING_APPROVAL", commit=False)
    await db.commit()
    record_runtime_audit(get_runtime_gate().to_audit(decision, session_id=session_id))
    return approval


def _openai_approval_error(decision: RuntimeDecision, approval_id: str, session_id: uuid.UUID) -> dict[str, Any]:
    body = _openai_output_block_error(decision)
    body["error"]["artsa"]["approval_id"] = approval_id
    body["error"]["artsa"]["session_id"] = str(session_id)
    body["error"]["code"] = "approval_required"
    return body


def _anthropic_approval_error(decision: RuntimeDecision, approval_id: str, session_id: uuid.UUID) -> dict[str, Any]:
    body = _anthropic_output_block_error(decision)
    body["error"]["artsa"]["approval_id"] = approval_id
    body["error"]["artsa"]["session_id"] = str(session_id)
    body["error"]["code"] = "approval_required"
    return body


def _consume_proxy_retry(
    redis: Any,
    token: str | None,
    *,
    tenant_id: str,
    session_id: uuid.UUID,
    tool_name: str,
    arguments: dict[str, Any],
) -> bool:
    if not token:
        return False
    authorized = consume_retry_token(
        redis, token, tenant_id=tenant_id, session_id=session_id,
        tool_name=tool_name, arguments=arguments,
    )
    if not authorized:
        raise HTTPException(status_code=403, detail="Invalid or already used approval retry token")
    return True


async def _stream_quarantine_or_record(
    gate: Any,
    *,
    dialect: str,
    retry_authorized: bool,
    db: AsyncSession,
    tracker: Any,
    tenant_id: str,
    session_id: uuid.UUID,
    tool_name: str,
    arguments: dict[str, Any],
    requester: dict[str, Any],
) -> AsyncIterator[str]:
    decision = gate.final_decision
    if decision is None:
        return
    if decision.action == RuntimeAction.QUARANTINE and not retry_authorized:
        approval = await _queue_quarantine_approval(
            db=db,
            tracker=tracker,
            tenant_id=tenant_id,
            session_id=session_id,
            decision=decision,
            tool_name=tool_name,
            arguments=arguments,
            requester=requester,
        )
        if dialect == "openai":
            yield "data: " + json.dumps(_openai_approval_error(decision, approval.id, session_id)) + "\n\n"
            yield "data: [DONE]\n\n"
        else:
            yield _sse(_anthropic_approval_error(decision, approval.id, session_id), event="error")
        return
    await _record_output_decision(decision, session_id, db=db, tenant_id=tenant_id)


async def _handle_decision(
    request: Request,
    content: str,
    provider: str,
    model: str,
    stream: bool,
    db: AsyncSession,
    tenant_id: str,
) -> tuple[dict[str, Any] | None, ProxyAction]:
    """Evaluate prompt content. Returns (block dict or None, inbound action)."""
    proxy = get_llm_proxy()
    start = time.perf_counter()
    session_id = _request_session_id(request)
    action, scan = proxy.decide(content, session_id=session_id)

    proxy.publish_telemetry(
        action=action,
        scan=scan,
        provider=provider,
        model=model,
        stream=stream,
        latency_ms=(time.perf_counter() - start) * 1000,
        session_id=session_id,
    )

    if action == ProxyAction.BLOCK:
        proxy.record_blocked_alert(scan)
        # Inbound prompt containment is also a hard runtime decision.  Keep the
        # circuit-breaker evidence digest-only; the legacy response contract is
        # deliberately left unchanged for clients that render detector flags.
        body_sha256 = sha256_text(content)
        await _record_output_decision(
            RuntimeDecision(
                action=RuntimeAction.BLOCK,
                body_sha256=body_sha256,
                findings=[
                    RedactedFinding(
                        detector="LLMProxy",
                        category="INBOUND_PROMPT_BLOCK",
                        body_sha256=body_sha256,
                        action=RuntimeAction.BLOCK,
                    )
                ],
            ),
            session_id,
            db=db,
            tenant_id=tenant_id,
        )
        return scan.to_dict(), action
    return None, action


async def _enforce_openai_output(
    request: Request,
    payload_json: dict[str, Any],
    messages: list[dict[str, Any]],
    original_payload: dict[str, Any],
    db: AsyncSession,
    tenant_id: str,
    tracker: Any,
    retry_authorized: bool = False,
    extra_system: str | None = None,
) -> Response:
    session_id = _request_session_id(request)
    decision, gated = gate_openai_completion(
        payload_json,
        messages=messages,
        session_id=session_id,
        extra_system=extra_system,
    )
    if decision.action == RuntimeAction.QUARANTINE and not retry_authorized:
        approval = await _queue_quarantine_approval(
            db=db,
            tracker=tracker,
            tenant_id=tenant_id,
            session_id=session_id,
            decision=decision,
            tool_name=_OPENAI_PROXY_TOOL,
            arguments=original_payload,
            requester={"provider": "openai", "model": original_payload.get("model")},
        )
        return JSONResponse(
            status_code=403,
            content=_openai_approval_error(decision, approval.id, session_id),
            headers=_session_headers(session_id),
        )
    if decision.action == RuntimeAction.QUARANTINE and retry_authorized:
        return JSONResponse(content=payload_json, headers=_session_headers(session_id))
    await _record_output_decision(decision, session_id, db=db, tenant_id=tenant_id)
    if gated is None:
        return JSONResponse(
            status_code=403,
            content=_openai_output_block_error(decision),
            headers=_session_headers(session_id),
        )
    return JSONResponse(content=gated, headers=_session_headers(session_id))


async def _enforce_anthropic_output(
    request: Request,
    payload_json: dict[str, Any],
    messages: list[dict[str, Any]],
    original_payload: dict[str, Any],
    db: AsyncSession,
    tenant_id: str,
    tracker: Any,
    retry_authorized: bool = False,
    extra_system: str | None = None,
) -> Response:
    session_id = _request_session_id(request)
    decision, gated = gate_anthropic_completion(
        payload_json,
        messages=messages,
        session_id=session_id,
        extra_system=extra_system,
    )
    if decision.action == RuntimeAction.QUARANTINE and not retry_authorized:
        approval = await _queue_quarantine_approval(
            db=db,
            tracker=tracker,
            tenant_id=tenant_id,
            session_id=session_id,
            decision=decision,
            tool_name=_ANTHROPIC_PROXY_TOOL,
            arguments=original_payload,
            requester={"provider": "anthropic", "model": original_payload.get("model")},
        )
        return JSONResponse(
            status_code=403,
            content=_anthropic_approval_error(decision, approval.id, session_id),
            headers=_session_headers(session_id),
        )
    if decision.action == RuntimeAction.QUARANTINE and retry_authorized:
        return JSONResponse(content=payload_json, headers=_session_headers(session_id))
    await _record_output_decision(decision, session_id, db=db, tenant_id=tenant_id)
    if gated is None:
        return JSONResponse(
            status_code=403,
            content=_anthropic_output_block_error(decision),
            headers=_session_headers(session_id),
        )
    return JSONResponse(content=gated, headers=_session_headers(session_id))


async def _gate_anthropic_upstream(
    request: Request,
    upstream: Any,
    original_payload: dict[str, Any],
    db: AsyncSession,
    tenant_id: str,
    tracker: Any,
    retry_authorized: bool = False,
) -> Response:
    if upstream.status_code >= 400:
        return Response(
            content=upstream.content,
            status_code=upstream.status_code,
            media_type="application/json",
        )
    try:
        upstream_json = upstream.json()
    except Exception:
        from src.runtime.evidence import RedactedFinding, sha256_text

        session_id = _request_session_id(request)
        decision = RuntimeDecision(
            action=RuntimeAction.BLOCK,
            findings=[
                RedactedFinding(
                    detector="RuntimeGate",
                    category="SCANNER_UNAVAILABLE",
                    body_sha256=sha256_text(""),
                    action=RuntimeAction.BLOCK,
                )
            ],
            body_sha256=sha256_text(""),
        )
        await _record_output_decision(decision, session_id, db=db, tenant_id=tenant_id)
        return JSONResponse(
            status_code=403,
            content=_anthropic_output_block_error(decision),
            headers=_session_headers(session_id),
        )
    extra_system = original_payload.get("system") if isinstance(original_payload.get("system"), str) else None
    messages = original_payload.get("messages") or []
    return await _enforce_anthropic_output(
        request,
        upstream_json,
        messages,
        original_payload=original_payload,
        db=db,
        tenant_id=tenant_id,
        tracker=tracker,
        retry_authorized=retry_authorized,
        extra_system=extra_system,
    )


@router.get("/proxy/health")
async def proxy_health() -> dict[str, Any]:
    """Proxy status endpoint (also used by SDK health checks)."""
    from src.gateway.provider_catalog import PROVIDER_CATALOG

    return {
        "status": "ok",
        "enabled": settings.ARTSA_PROXY_ENABLED,
        "mode": settings.ARTSA_PROXY_MODE,
        "block_threshold": settings.ARTSA_PROXY_BLOCK_THRESHOLD,
        "default_provider": settings.ARTSA_PROXY_DEFAULT_PROVIDER,
        "target_base_url": settings.ARTSA_PROXY_TARGET_BASE_URL,
        "providers": sorted(PROVIDER_CATALOG.keys()),
        # Trust contract: how the guardrail behaves and its latency budget.
        "fail_mode": settings.ARTSA_PROXY_FAIL_MODE,
        "latency_slo_ms": settings.EDS_LATENCY_THRESHOLD_MS,
        "version": "1.0",
    }


@router.post("/proxy/chat/completions")
async def proxy_chat_completions_short(
    request: Request,
    payload: dict[str, Any] = Body(...),
    x_artsa_provider: str | None = Header(None, alias="X-ARTSA-Provider"),
    x_artsa_forward_to: str | None = Header(None, alias="X-ARTSA-Forward-To"),
    x_artsa_approval_retry_token: str | None = Header(None, alias="X-ARTSA-Approval-Retry-Token"),
    db: AsyncSession = Depends(get_db),
    redis=Depends(get_redis),
    tracker=Depends(get_session_tracker),
    tenant_id: str = Depends(get_current_tenant),
) -> Response:
    """Alias for ``/proxy/v1/chat/completions``.

    The OpenAI SDK appends ``/chat/completions`` to ``base_url``. Pointing a
    client at ``base_url=http://localhost:8000/v1/proxy`` therefore resolves
    here (``/v1/proxy/chat/completions``), making the documented drop-in
    integration work without a custom path suffix.
    """
    return await proxy_chat_completions(
        request, payload, x_artsa_provider, x_artsa_forward_to, x_artsa_approval_retry_token,
        db, redis, tracker, tenant_id,
    )


@router.post("/proxy/v1/chat/completions")
async def proxy_chat_completions(
    request: Request,
    payload: dict[str, Any] = Body(...),
    x_artsa_provider: str | None = Header(None, alias="X-ARTSA-Provider"),
    x_artsa_forward_to: str | None = Header(None, alias="X-ARTSA-Forward-To"),
    x_artsa_approval_retry_token: str | None = Header(None, alias="X-ARTSA-Approval-Retry-Token"),
    db: AsyncSession = Depends(get_db),
    redis=Depends(get_redis),
    tracker=Depends(get_session_tracker),
    tenant_id: str = Depends(get_current_tenant),
) -> Response:
    """OpenAI-compatible chat completions with detection-gated forwarding."""
    if not settings.ARTSA_PROXY_ENABLED:
        raise HTTPException(status_code=503, detail="ARTSA proxy gateway is disabled")

    proxy = get_llm_proxy()
    provider = x_artsa_provider or settings.ARTSA_PROXY_DEFAULT_PROVIDER or "openai"
    stream = bool(payload.get("stream", False))
    messages = payload.get("messages") or []
    session_id = _request_session_id(request)
    await _ensure_proxy_session(db, tracker, session_id, tenant_id)
    if await _circuit_breaker_open(db, tenant_id=tenant_id, session_id=session_id):
        return JSONResponse(status_code=403, content=_circuit_breaker_error(session_id), headers=_session_headers(session_id))
    retry_authorized = _consume_proxy_retry(
        redis, x_artsa_approval_retry_token, tenant_id=tenant_id, session_id=session_id,
        tool_name=_OPENAI_PROXY_TOOL, arguments=payload,
    )
    content = proxy.combined_prompt(messages)

    block, inbound_action = await _handle_decision(
        request, content, provider, str(payload.get("model") or "unknown"), stream, db=db, tenant_id=tenant_id
    )
    if block is not None:
        return JSONResponse(
            status_code=403,
            content=_openai_block_error(block),
            headers=_session_headers(session_id),
        )

    # Containment runs before provider resolution.  A broken scanner must
    # fail closed even when the caller also supplied an unknown provider;
    # configuration errors still make no upstream call for allowed traffic.
    try:
        base_url, api_key, extra_headers, model = await proxy.resolve_target_for_tenant(
            provider, tenant_id=tenant_id, model=payload.get("model"), forward_to=x_artsa_forward_to
        )
    except Exception as exc:
        raise HTTPException(status_code=422, detail="provider_not_configured") from exc

    if inbound_action == ProxyAction.SANITIZE:
        payload["messages"] = proxy.sanitize_messages(messages)

    if stream:
        url = f"{base_url}/chat/completions"
        session_id = _request_session_id(request)

        async def _stream_forward() -> AsyncIterator[str]:
            gate = OpenAIStreamGate(
                messages=messages, session_id=session_id, retry_authorized=retry_authorized,
            )
            try:
                async for chunk in proxy.stream_chat(url, payload, api_key, extra_headers):
                    for frame in gate.feed(chunk.decode("utf-8", errors="replace")):
                        yield frame
                    if gate.aborted:
                        break
                if not gate.aborted:
                    for frame in gate.finish():
                        yield frame
            except SSRFBlockedError as exc:
                error_body = {"error": {"message": str(exc), "type": "proxy_target_blocked", "code": "proxy_target_blocked"}}
                yield _sse(error_body)
                yield "data: [DONE]\n\n"
            except Exception as exc:
                error_body = {"error": {"message": str(exc), "type": "upstream_error", "code": "proxy_upstream_error"}}
                yield _sse(error_body)
                yield "data: [DONE]\n\n"
            else:
                async for frame in _stream_quarantine_or_record(
                    gate,
                    dialect="openai",
                    retry_authorized=retry_authorized,
                    db=db,
                    tracker=tracker,
                    tenant_id=tenant_id,
                    session_id=session_id,
                    tool_name=_OPENAI_PROXY_TOOL,
                    arguments=payload,
                    requester={"provider": provider, "model": model, "stream": True},
                ):
                    yield frame

        return StreamingResponse(
            _stream_forward(),
            media_type="text/event-stream",
            headers=_session_headers(session_id),
        )

    url = f"{base_url}/chat/completions"

    try:
        upstream = await proxy.forward_chat(url, payload, api_key, extra_headers)
    except SSRFBlockedError as exc:
        raise HTTPException(
            status_code=403,
            detail={"message": str(exc), "code": "proxy_target_blocked", "provider": provider},
        ) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail={"message": f"Upstream LLM unreachable: {exc}", "provider": provider},
        ) from exc

    if upstream.status_code >= 400:
        return Response(
            content=upstream.content,
            status_code=upstream.status_code,
            media_type="application/json",
        )
    try:
        upstream_json = upstream.json()
    except Exception:
        from src.runtime.evidence import RedactedFinding, sha256_text

        session_id = _request_session_id(request)
        decision = RuntimeDecision(
            action=RuntimeAction.BLOCK,
            findings=[
                RedactedFinding(
                    detector="RuntimeGate",
                    category="SCANNER_UNAVAILABLE",
                    body_sha256=sha256_text(""),
                    action=RuntimeAction.BLOCK,
                )
            ],
            body_sha256=sha256_text(""),
        )
        await _record_output_decision(decision, session_id, db=db, tenant_id=tenant_id)
        return JSONResponse(
            status_code=403,
            content=_openai_output_block_error(decision),
            headers=_session_headers(session_id),
        )

    return await _enforce_openai_output(
        request, upstream_json, messages, original_payload=payload, db=db,
        tenant_id=tenant_id, tracker=tracker, retry_authorized=retry_authorized,
    )


@router.post("/proxy/messages")
async def proxy_messages_short(
    request: Request,
    payload: dict[str, Any] = Body(...),
    x_artsa_provider: str | None = Header(None, alias="X-ARTSA-Provider"),
    x_artsa_forward_to: str | None = Header(None, alias="X-ARTSA-Forward-To"),
    x_artsa_approval_retry_token: str | None = Header(None, alias="X-ARTSA-Approval-Retry-Token"),
    db: AsyncSession = Depends(get_db),
    redis=Depends(get_redis),
    tracker=Depends(get_session_tracker),
    tenant_id: str = Depends(get_current_tenant),
) -> Response:
    """Alias for ``/proxy/v1/messages`` (Anthropic client compatibility)."""
    return await proxy_messages(
        request, payload, x_artsa_provider, x_artsa_forward_to, x_artsa_approval_retry_token,
        db, redis, tracker, tenant_id,
    )


@router.post("/proxy/v1/messages")
async def proxy_messages(
    request: Request,
    payload: dict[str, Any] = Body(...),
    x_artsa_provider: str | None = Header(None, alias="X-ARTSA-Provider"),
    x_artsa_forward_to: str | None = Header(None, alias="X-ARTSA-Forward-To"),
    x_artsa_approval_retry_token: str | None = Header(None, alias="X-ARTSA-Approval-Retry-Token"),
    db: AsyncSession = Depends(get_db),
    redis=Depends(get_redis),
    tracker=Depends(get_session_tracker),
    tenant_id: str = Depends(get_current_tenant),
) -> Response:
    """Anthropic-compatible /v1/messages with detection-gated forwarding.

    When the resolved provider is Anthropic the request is forwarded natively
    to ``{base}/messages``; otherwise it is translated to the OpenAI-compatible
    protocol and the response is translated back to the Anthropic shape.
    """
    if not settings.ARTSA_PROXY_ENABLED:
        raise HTTPException(status_code=503, detail="ARTSA proxy gateway is disabled")

    proxy = get_llm_proxy()
    provider = x_artsa_provider or settings.ARTSA_PROXY_DEFAULT_PROVIDER or "openai"
    stream = bool(payload.get("stream", False))
    openai_payload = proxy.anthropic_to_openai(payload)
    session_id = _request_session_id(request)
    await _ensure_proxy_session(db, tracker, session_id, tenant_id)
    if await _circuit_breaker_open(db, tenant_id=tenant_id, session_id=session_id):
        return JSONResponse(status_code=403, content=_circuit_breaker_error(session_id), headers=_session_headers(session_id))
    retry_authorized = _consume_proxy_retry(
        redis, x_artsa_approval_retry_token, tenant_id=tenant_id, session_id=session_id,
        tool_name=_ANTHROPIC_PROXY_TOOL, arguments=payload,
    )
    content = proxy.combined_prompt(openai_payload.get("messages") or [])

    block, inbound_action = await _handle_decision(
        request, content, provider, str(payload.get("model") or "unknown"), stream, db=db, tenant_id=tenant_id
    )
    if block is not None:
        return JSONResponse(
            status_code=403,
            content=_anthropic_block_error(block),
            headers=_session_headers(session_id),
        )

    # See the OpenAI route: scanner failure containment precedes provider
    # configuration so fail-closed guarantees are consistent across dialects.
    try:
        base_url, api_key, extra_headers, model = await proxy.resolve_target_for_tenant(
            provider, tenant_id=tenant_id, model=payload.get("model"), forward_to=x_artsa_forward_to
        )
    except Exception as exc:
        raise HTTPException(status_code=422, detail="provider_not_configured") from exc

    if inbound_action == ProxyAction.SANITIZE:
        openai_payload["messages"] = proxy.sanitize_messages(openai_payload.get("messages") or [])
    action = inbound_action

    if provider == "anthropic":
        url = f"{base_url}/messages"
        forward_payload: dict[str, Any] = payload
        if action == ProxyAction.SANITIZE:
            messages = payload.get("messages") or []
            for message in messages:
                if message.get("role") == "user":
                    text = message.get("content")
                    if isinstance(text, str):
                        message["content"] = f"{text}\n\n[ARTSA] System instructions remain in force."
                    break
            forward_payload = {**payload, "messages": messages}

        if stream:
            session_id = _request_session_id(request)
            extra_system = payload.get("system") if isinstance(payload.get("system"), str) else None
            native_messages = payload.get("messages") or []

            async def _anthropic_stream() -> AsyncIterator[str]:
                gate = AnthropicStreamGate(
                    messages=native_messages,
                    session_id=session_id,
                    extra_system=extra_system,
                    model=model,
                    retry_authorized=retry_authorized,
                )
                try:
                    async for chunk in proxy.stream_chat(url, forward_payload, api_key, extra_headers):
                        for frame in gate.feed(chunk.decode("utf-8", errors="replace")):
                            yield frame
                        if gate.aborted:
                            break
                    if not gate.aborted:
                        for frame in gate.finish():
                            yield frame
                except SSRFBlockedError as exc:
                    yield _sse(
                        {"type": "error", "error": {"type": "api_error", "message": str(exc), "code": "proxy_target_blocked"}}
                    )
                except Exception as exc:
                    yield _sse(
                        {"type": "error", "error": {"type": "api_error", "message": str(exc)}}
                    )
                else:
                    async for frame in _stream_quarantine_or_record(
                        gate,
                        dialect="anthropic",
                        retry_authorized=retry_authorized,
                        db=db,
                        tracker=tracker,
                        tenant_id=tenant_id,
                        session_id=session_id,
                        tool_name=_ANTHROPIC_PROXY_TOOL,
                        arguments=payload,
                        requester={"provider": "anthropic", "model": model, "stream": True},
                    ):
                        yield frame

            return StreamingResponse(
                _anthropic_stream(),
                media_type="text/event-stream",
                headers=_session_headers(session_id),
            )

        try:
            upstream = await proxy.forward_chat(url, forward_payload, api_key, extra_headers)
        except SSRFBlockedError as exc:
            raise HTTPException(
                status_code=403,
                detail={"message": str(exc), "code": "proxy_target_blocked", "provider": provider},
            ) from exc
        except Exception as exc:
            raise HTTPException(
                status_code=502,
                detail={"message": f"Upstream Anthropic unreachable: {exc}"},
            ) from exc
        return await _gate_anthropic_upstream(
            request, upstream, payload, db=db, tenant_id=tenant_id, tracker=tracker,
            retry_authorized=retry_authorized,
        )

    # Non-Anthropic upstream: OpenAI protocol.
    url = f"{base_url}/chat/completions"

    if stream:
        session_id = _request_session_id(request)
        extra_system = payload.get("system") if isinstance(payload.get("system"), str) else None
        openai_messages = openai_payload.get("messages") or []

        async def _converted_stream() -> AsyncIterator[str]:
            gate = OpenAIStreamGate(
                messages=openai_messages,
                session_id=session_id,
                extra_system=extra_system,
                retry_authorized=retry_authorized,
            )
            translator = OpenAIToAnthropicStreamTranslator(model=model)
            try:
                async for chunk in proxy.stream_chat(url, openai_payload, api_key, extra_headers):
                    for frame in gate.feed(chunk.decode("utf-8", errors="replace")):
                        for out in translator.consume(frame):
                            yield out
                    if gate.aborted:
                        break
                if not gate.aborted:
                    for frame in gate.finish():
                        for out in translator.consume(frame):
                            yield out
            except SSRFBlockedError as exc:
                yield _sse(
                    {"type": "error", "error": {"type": "api_error", "message": str(exc), "code": "proxy_target_blocked"}}
                )
            except Exception as exc:
                yield _sse({"type": "error", "error": {"type": "api_error", "message": str(exc)}})
            else:
                async for frame in _stream_quarantine_or_record(
                    gate,
                    dialect="anthropic",
                    retry_authorized=retry_authorized,
                    db=db,
                    tracker=tracker,
                    tenant_id=tenant_id,
                    session_id=session_id,
                    tool_name=_ANTHROPIC_PROXY_TOOL,
                    arguments=payload,
                    requester={"provider": provider, "model": model, "stream": True},
                ):
                    yield frame

        return StreamingResponse(
            _converted_stream(),
            media_type="text/event-stream",
            headers=_session_headers(session_id),
        )

    try:
        upstream = await proxy.forward_chat(url, openai_payload, api_key, extra_headers)
    except SSRFBlockedError as exc:
        raise HTTPException(
            status_code=403,
            detail={"message": str(exc), "code": "proxy_target_blocked", "provider": provider},
        ) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail={"message": f"Upstream LLM unreachable: {exc}", "provider": provider},
        ) from exc

    try:
        upstream_json = upstream.json()
    except Exception:
        from src.runtime.evidence import RedactedFinding, sha256_text

        session_id = _request_session_id(request)
        decision = RuntimeDecision(
            action=RuntimeAction.BLOCK,
            findings=[
                RedactedFinding(
                    detector="RuntimeGate",
                    category="SCANNER_UNAVAILABLE",
                    body_sha256=sha256_text(""),
                    action=RuntimeAction.BLOCK,
                )
            ],
            body_sha256=sha256_text(""),
        )
        await _record_output_decision(decision, session_id, db=db, tenant_id=tenant_id)
        return JSONResponse(
            status_code=403,
            content=_anthropic_output_block_error(decision),
            headers=_session_headers(session_id),
        )

    anthropic_json = proxy.openai_to_anthropic(payload, upstream_json)
    extra_system = payload.get("system") if isinstance(payload.get("system"), str) else None
    openai_messages = openai_payload.get("messages") or []
    return await _enforce_anthropic_output(
        request,
        anthropic_json,
        openai_messages,
        original_payload=payload,
        db=db,
        tenant_id=tenant_id,
        tracker=tracker,
        retry_authorized=retry_authorized,
        extra_system=extra_system,
    )
