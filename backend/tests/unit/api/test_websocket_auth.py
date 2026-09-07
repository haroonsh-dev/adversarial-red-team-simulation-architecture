"""WebSocket authentication tests."""

import pytest
from fastapi import WebSocketDisconnect
from fastapi.testclient import TestClient
from src.api.main import app
from src.core.config import settings

client = TestClient(app)


def test_websocket_connects_in_testing():
    with client.websocket_connect("/api/v1/websocket") as ws:
        hello = ws.receive_json()
        assert hello["type"] == "hello"
        data = ws.receive_json()
        assert data["type"] == "history"


def test_websocket_client_close_is_not_an_unretrieved_task(caplog):
    """Browser tab close must not log asyncio 'Task exception was never retrieved'."""
    import logging

    with caplog.at_level(logging.ERROR):
        with client.websocket_connect("/api/v1/websocket") as ws:
            assert ws.receive_json()["type"] == "hello"
            assert ws.receive_json()["type"] == "history"
            ws.close()
    text = caplog.text
    assert "Task exception was never retrieved" not in text
    assert "WebSocketDisconnect" not in text


def test_websocket_rejects_without_key_when_required(monkeypatch):
    monkeypatch.setattr(settings, "ARTSA_API_KEY", "ws-test-secret-key-12345")
    monkeypatch.setattr(settings, "ENVIRONMENT", "development")
    monkeypatch.setattr(settings, "ARTSA_REQUIRE_AUTH", False)

    with pytest.raises(WebSocketDisconnect), client.websocket_connect("/api/v1/websocket"):
        pass


def test_websocket_accepts_query_api_key(monkeypatch):
    monkeypatch.setattr(settings, "ARTSA_API_KEY", "ws-test-secret-key-12345")
    monkeypatch.setattr(settings, "ENVIRONMENT", "development")

    with client.websocket_connect("/api/v1/websocket?api_key=ws-test-secret-key-12345") as ws:
        hello = ws.receive_json()
        assert hello["type"] == "hello"
        data = ws.receive_json()
        assert data["type"] == "history"


# ── WebSocket ticket flow (single-use HMAC ticket) ───────────────────────────

def _ticket_from_post(res) -> str:
    """Extract the ticket, unwrapping the response envelope when enabled."""
    body = res.json()
    return (body.get("data", body))["ticket"]


def test_websocket_ticket_endpoint_mints_ticket():
    res = client.post("/api/v1/websocket/ticket")
    assert res.status_code == 200
    ticket = _ticket_from_post(res)
    assert ticket and "." in ticket


def test_websocket_ticket_endpoint_is_post_only():
    # The frontend previously fetched this with GET (via fetchFromBackend, which
    # defaults to GET), got a silent 405, connected bare, and hit a 403 handshake.
    # Pin the contract: this endpoint only serves POST.
    res = client.get("/api/v1/websocket/ticket")
    assert res.status_code == 405


def test_websocket_connects_with_ticket():
    res = client.post("/api/v1/websocket/ticket")
    ticket = _ticket_from_post(res)

    with client.websocket_connect(f"/api/v1/websocket?ticket={ticket}") as ws:
        hello = ws.receive_json()
        assert hello["type"] == "hello"
        data = ws.receive_json()
        assert data["type"] == "history"


def test_websocket_ticket_is_single_use(monkeypatch):
    # Enforce auth so the WS endpoint actually rejects invalid/replayed tickets.
    monkeypatch.setattr(settings, "ARTSA_API_KEY", "ws-test-secret-key-12345")
    monkeypatch.setattr(settings, "ENVIRONMENT", "development")

    res = client.post(
        "/api/v1/websocket/ticket",
        headers={"X-API-Key": "ws-test-secret-key-12345"},
    )
    ticket = _ticket_from_post(res)

    with client.websocket_connect(f"/api/v1/websocket?ticket={ticket}") as ws:
        assert ws.receive_json()["type"] == "hello"
        ws.receive_json()

    # Reusing the same ticket must be rejected as a replay.
    with pytest.raises(WebSocketDisconnect), client.websocket_connect(
        f"/api/v1/websocket?ticket={ticket}"
    ):
        pass


def test_websocket_ticket_replay_is_stored_in_redis():
    from src.core.rbac import Role
    from src.core.ws_tickets import create_ws_ticket, verify_ws_ticket
    from src.data.redis_client import get_redis_stream_client, reset_redis_client

    reset_redis_client()
    ticket = create_ws_ticket(Role.ANALYST)
    assert verify_ws_ticket(ticket) is not None
    stored = getattr(get_redis_stream_client(), "_kv", {})
    assert any(k.startswith("artsa:ws:ticket:") for k in stored)
    assert verify_ws_ticket(ticket) is None


def test_websocket_rejects_tampered_ticket(monkeypatch):
    monkeypatch.setattr(settings, "ARTSA_API_KEY", "ws-test-secret-key-12345")
    monkeypatch.setattr(settings, "ENVIRONMENT", "development")

    with pytest.raises(WebSocketDisconnect), client.websocket_connect(
        "/api/v1/websocket?ticket=eyJyb2xlIjoiYWRtaW4ifQ.tampered"
    ):
        pass
