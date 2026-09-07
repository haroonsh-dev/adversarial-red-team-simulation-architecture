"""Unit tests for all session API routes."""

import uuid

from fastapi.testclient import TestClient
from src.api.main import app
from tests.conftest import unwrap_response

client = TestClient(app)


def test_list_sessions():
    response = client.get("/v1/sessions")
    assert response.status_code == 200
    assert isinstance(unwrap_response(response), list)


def test_get_session_details():
    # First create session or post event
    session_id = str(uuid.uuid4())
    event = {
        "id": str(uuid.uuid4()),
        "session_id": session_id,
        "agent_id": "test-agent-session",
        "tool_name": "read_file",
        "arguments": {"path": "/tmp/test.txt"},
        "trace_id": str(uuid.uuid4()),
    }
    client.post("/v1/ingest", json=event)

    # Fetch session timeline
    response = client.get(f"/v1/sessions/{session_id}/timeline")
    assert response.status_code == 200
    timeline = unwrap_response(response)
    assert len(timeline) >= 1
    assert timeline[0]["event"]["session_id"] == session_id
    assert "evaluation" in timeline[0]


def test_enforce_session_action():
    session_id = str(uuid.uuid4())
    # Start session first
    event = {
        "id": str(uuid.uuid4()),
        "session_id": session_id,
        "agent_id": "test-agent-action",
        "tool_name": "list_files",
        "arguments": {},
        "trace_id": str(uuid.uuid4()),
    }
    client.post("/v1/ingest", json=event)

    response = client.post(f"/v1/sessions/{session_id}/action", json={"action": "KILL"})
    assert response.status_code == 200
    data = unwrap_response(response)
    assert data["enforced_action"] == "KILL"
    assert data["status"] == "BREACHED"


def test_session_action_is_tenant_isolated():
    session_id = str(uuid.uuid4())
    event = {
        "id": str(uuid.uuid4()),
        "session_id": session_id,
        "agent_id": "tenant-agent",
        "tool_name": "list_files",
        "arguments": {},
        "trace_id": str(uuid.uuid4()),
    }
    created = client.post("/v1/ingest", json=event, headers={"X-Tenant-ID": "acme"})
    assert created.status_code in (200, 201)

    foreign = client.post(
        f"/v1/sessions/{session_id}/action",
        json={"action": "QUARANTINE"},
        headers={"X-Tenant-ID": "globex"},
    )
    assert foreign.status_code == 404

    hidden = client.get(f"/v1/sessions/{session_id}", headers={"X-Tenant-ID": "globex"})
    assert hidden.status_code == 404

    own = client.post(
        f"/v1/sessions/{session_id}/action",
        json={"action": "QUARANTINE"},
        headers={"X-Tenant-ID": "acme"},
    )
    assert own.status_code == 200
    assert unwrap_response(own)["status"] == "QUARANTINED"


def test_repeated_quarantine_is_idempotent():
    session_id = str(uuid.uuid4())
    event = {
        "id": str(uuid.uuid4()),
        "session_id": session_id,
        "agent_id": "idem-agent",
        "tool_name": "list_files",
        "arguments": {},
        "trace_id": str(uuid.uuid4()),
    }
    client.post("/v1/ingest", json=event, headers={"X-Tenant-ID": "acme"})
    first = client.post(
        f"/v1/sessions/{session_id}/action",
        json={"action": "QUARANTINE"},
        headers={"X-Tenant-ID": "acme"},
    )
    second = client.post(
        f"/v1/sessions/{session_id}/action",
        json={"action": "QUARANTINE"},
        headers={"X-Tenant-ID": "acme"},
    )
    assert first.status_code == 200
    assert second.status_code == 200
    data = unwrap_response(second)
    assert data["status"] == "QUARANTINED"
    assert data["idempotent"] is True
