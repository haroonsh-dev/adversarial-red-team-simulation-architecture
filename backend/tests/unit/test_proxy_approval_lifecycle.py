"""Durable proxy sessions + approval API approve → retry (sqlite-backed)."""

from __future__ import annotations

import json
import uuid
from types import SimpleNamespace

import httpx
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from src.api.dependencies import get_db, get_redis
from src.core.config import settings
from src.data.orm import Base, SessionORM
from src.data.redis_client import InMemoryRedis
from src.gateway.llm_proxy import LLMProxy
from src.services.prompt_scanner import PromptScanner

from tests.conftest import unwrap_response

SAFE_PROMPT = "Summarize the quarterly financial report and list the top risks."
QUARANTINE_COMMAND = "sudo ls /root"
PAYLOAD = {"model": "gpt-4o", "messages": [{"role": "user", "content": SAFE_PROMPT}]}


def _secret_upstream(_request: httpx.Request) -> httpx.Response:
    return httpx.Response(
        200,
        json={
            "id": "chatcmpl-secret",
            "object": "chat.completion",
            "model": "gpt-4o",
            "choices": [{"index": 0, "message": {"role": "assistant", "content": 'api_key: "sk-abcdefghijklmnopqrstuvwxyz0123"'}, "finish_reason": "stop"}],
        },
    )


def _quarantine_upstream(_request: httpx.Request) -> httpx.Response:
    return httpx.Response(
        200,
        json={
            "id": "chatcmpl-quarantine",
            "object": "chat.completion",
            "model": "gpt-4o",
            "choices": [
                {
                    "index": 0,
                    "message": {
                        "role": "assistant",
                        "content": None,
                        "tool_calls": [
                            {
                                "id": "call_q",
                                "type": "function",
                                "function": {
                                    "name": "exec_command",
                                    "arguments": json.dumps({"command": QUARANTINE_COMMAND}),
                                },
                            }
                        ],
                    },
                    "finish_reason": "tool_calls",
                }
            ],
        },
    )


def test_request_session_id_is_stable_within_one_request():
    from src.api.routes.proxy import _request_session_id

    request = SimpleNamespace(headers={}, state=SimpleNamespace())
    first = _request_session_id(request)
    second = _request_session_id(request)
    assert first == second
    assert first == request.state.artsa_session_id

    invalid = SimpleNamespace(headers={"X-ARTSA-Session-ID": "not-a-uuid"}, state=SimpleNamespace())
    minted = _request_session_id(invalid)
    assert minted == _request_session_id(invalid)


def _sqlite_client(monkeypatch, tmp_path, handler=_quarantine_upstream):
    db_path = tmp_path / "proxy_approval.db"
    monkeypatch.setattr(settings, "DATABASE_URL", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setattr(settings, "USE_SQLITE", True)
    monkeypatch.setattr("src.data.db._engine", None)
    monkeypatch.setattr("src.data.db._session_factory", None)

    sync_engine = create_engine(f"sqlite:///{db_path}")
    Base.metadata.create_all(sync_engine)

    redis = InMemoryRedis()
    proxy = LLMProxy(scanner=PromptScanner(), transport=httpx.MockTransport(handler))
    monkeypatch.setattr("src.api.routes.proxy.get_llm_proxy", lambda: proxy)

    from src.api.main import create_app
    from src.data.db import get_async_session

    app = create_app()

    async def _override_db():
        async for session in get_async_session():
            yield session

    app.dependency_overrides[get_db] = _override_db
    app.dependency_overrides[get_redis] = lambda: redis
    return TestClient(app), redis, db_path, sync_engine


def _session_row(sync_engine, session_id: str) -> SessionORM | None:
    factory = sessionmaker(bind=sync_engine, expire_on_commit=False)
    with factory() as session:
        return session.get(SessionORM, session_id)


def test_omitted_session_header_echoes_one_id_and_persists_sql(monkeypatch, tmp_path):
    client, _redis, _db_path, sync_engine = _sqlite_client(monkeypatch, tmp_path)
    res = client.post("/api/v1/proxy/v1/chat/completions", json=PAYLOAD)
    assert res.status_code == 403
    body = res.json()
    assert body["error"]["code"] == "approval_required"
    echoed = res.headers.get("X-ARTSA-Session-ID")
    assert echoed
    assert body["error"]["artsa"]["session_id"] == echoed
    approval_id = body["error"]["artsa"]["approval_id"]
    listed = unwrap_response(client.get("/api/v1/approvals"))
    assert any(row["id"] == approval_id and row["session_id"] == echoed for row in listed)
    row = _session_row(sync_engine, echoed)
    assert row is not None
    assert row.status == "PENDING_APPROVAL"
    assert row.agent_id == "artsa-proxy"


def test_third_output_block_opens_session_breaker_and_fourth_never_forwards(monkeypatch, tmp_path):
    client, _redis, _db_path, sync_engine = _sqlite_client(monkeypatch, tmp_path, handler=_secret_upstream)
    sid = str(uuid.uuid4())
    for _ in range(3):
        response = client.post(
            "/api/v1/proxy/v1/chat/completions",
            headers={"X-ARTSA-Session-ID": sid}, json=PAYLOAD,
        )
        assert response.status_code == 403
    assert _session_row(sync_engine, sid).status == "BREACHED"

    response = client.post(
        "/api/v1/proxy/v1/chat/completions",
        headers={"X-ARTSA-Session-ID": sid}, json=PAYLOAD,
    )
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "artsa_circuit_breaker_open"


def test_approve_then_retry_same_session_and_payload(monkeypatch, tmp_path):
    client, _redis, _db_path, sync_engine = _sqlite_client(monkeypatch, tmp_path)
    sid = str(uuid.uuid4())
    blocked = client.post(
        "/api/v1/proxy/v1/chat/completions",
        headers={"X-ARTSA-Session-ID": sid},
        json=PAYLOAD,
    )
    assert blocked.status_code == 403
    approval_id = blocked.json()["error"]["artsa"]["approval_id"]
    assert blocked.json()["error"]["artsa"]["session_id"] == sid
    assert _session_row(sync_engine, sid).status == "PENDING_APPROVAL"

    decision = unwrap_response(
        client.post(f"/api/v1/approvals/{approval_id}/decision", json={"decision": "APPROVE"})
    )
    assert decision["status"] == "APPROVED"
    token = decision["retry_token"]
    assert token
    assert _session_row(sync_engine, sid).status == "ACTIVE"

    retried = client.post(
        "/api/v1/proxy/v1/chat/completions",
        headers={
            "X-ARTSA-Session-ID": sid,
            "X-ARTSA-Approval-Retry-Token": token,
        },
        json=PAYLOAD,
    )
    assert retried.status_code == 200
    tools = retried.json()["choices"][0]["message"]["tool_calls"]
    assert tools[0]["function"]["name"] == "exec_command"
    assert retried.headers.get("X-ARTSA-Session-ID") == sid

    reused = client.post(
        "/api/v1/proxy/v1/chat/completions",
        headers={
            "X-ARTSA-Session-ID": sid,
            "X-ARTSA-Approval-Retry-Token": token,
        },
        json=PAYLOAD,
    )
    assert reused.status_code == 403


def test_omitted_header_retry_uses_echoed_session_id(monkeypatch, tmp_path):
    client, _redis, _db_path, _engine = _sqlite_client(monkeypatch, tmp_path)
    blocked = client.post("/api/v1/proxy/v1/chat/completions", json=PAYLOAD)
    body = blocked.json()
    session_id = body["error"]["artsa"]["session_id"]
    approval_id = body["error"]["artsa"]["approval_id"]
    token = unwrap_response(
        client.post(f"/api/v1/approvals/{approval_id}/decision", json={"decision": "APPROVE"})
    )["retry_token"]

    retried = client.post(
        "/api/v1/proxy/v1/chat/completions",
        headers={
            "X-ARTSA-Session-ID": session_id,
            "X-ARTSA-Approval-Retry-Token": token,
        },
        json=PAYLOAD,
    )
    assert retried.status_code == 200
    assert retried.json()["choices"][0]["message"]["tool_calls"]
