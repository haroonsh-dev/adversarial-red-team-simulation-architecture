"""Command Center ops contract endpoints."""

from fastapi.testclient import TestClient
from src.api.main import app
from tests.conftest import unwrap_response

client = TestClient(app)


def test_asi_taxonomy_marks_asi08_unimplemented():
    response = client.get("/api/v1/taxonomy/asi")
    assert response.status_code == 200
    data = unwrap_response(response)
    by_code = {row["code"]: row for row in data["catalog"]}
    assert by_code["ASI08"]["status"] == "supported"
    assert data["hmac"]["status"] == "supported"
    assert data["hmac"]["threat_code"] == "HMAC"


def test_ops_snapshot_is_disconnected_without_events():
    response = client.get("/api/v1/telemetry/ops", headers={"X-Tenant-ID": "empty-org"})
    assert response.status_code == 200
    data = unwrap_response(response)
    assert data["telemetry_mode"] in {"DISCONNECTED", "STALE", "LIVE"}
    if not data["events"]:
        assert data["telemetry_mode"] == "DISCONNECTED"
    assert data["hmac"]["hmac_state"] == "ok"
    assert data["metrics"]["precision"] is None
    agents = {a["agent_id"]: a for a in data["agents"]}
    assert agents["research"]["state"] == "not_wired"
    assert agents["defender"]["state"] == "not_wired"
    implemented = {a["action_id"]: a["implemented"] for a in data["operator_actions"]}
    assert implemented["KILL_SESSION"] is True
    assert implemented["BLOCK_TOOL"] is False
