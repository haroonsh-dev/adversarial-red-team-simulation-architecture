"""Auth middleware tests."""

from fastapi.testclient import TestClient
from src.api.main import app
from src.api.middleware.auth import is_devtools_probe
from src.core.config import settings
from tests.conftest import unwrap_response


def test_health_public_without_key():
    client = TestClient(app)
    response = client.get("/api/v1/health")
    assert response.status_code == 200


def test_root_public_when_api_key_configured(monkeypatch):
    monkeypatch.setattr(settings, "ARTSA_API_KEY", "test-secret-key-12345")
    monkeypatch.setattr(settings, "ENVIRONMENT", "development")
    monkeypatch.setattr(settings, "ARTSA_REQUIRE_AUTH", False)

    client = TestClient(app)
    response = client.get("/")
    assert response.status_code == 200
    assert unwrap_response(response)["status"] == "ok"


def test_devtools_probe_paths():
    assert is_devtools_probe("/json/version") is True
    assert is_devtools_probe("/json") is True
    assert is_devtools_probe("/") is False
    assert is_devtools_probe("/api/v1/health") is False


def test_chrome_devtools_probe_is_not_401(monkeypatch):
    monkeypatch.setattr(settings, "ARTSA_API_KEY", "test-secret-key-12345")
    monkeypatch.setattr(settings, "ENVIRONMENT", "development")
    monkeypatch.setattr(settings, "ARTSA_REQUIRE_AUTH", False)

    client = TestClient(app)
    response = client.get("/json/version")
    assert response.status_code == 404
    assert response.status_code != 401


def test_config_requires_key_when_set(monkeypatch):
    monkeypatch.setattr(settings, "ARTSA_API_KEY", "test-secret-key-12345")
    monkeypatch.setattr(settings, "ENVIRONMENT", "development")
    monkeypatch.setattr(settings, "ARTSA_REQUIRE_AUTH", False)

    client = TestClient(app)
    response = client.get("/api/v1/config/keys")
    assert response.status_code == 401

    response = client.get("/api/v1/config/keys", headers={"X-API-Key": "test-secret-key-12345"})
    assert response.status_code == 200


def test_readonly_key_accepted_when_configured(monkeypatch):
    monkeypatch.setattr(settings, "ARTSA_API_KEY", "admin-secret-key-12345")
    monkeypatch.setattr(settings, "ARTSA_READONLY_API_KEY", "readonly-secret-key-12345")
    monkeypatch.setattr(settings, "ENVIRONMENT", "development")
    monkeypatch.setattr(settings, "ARTSA_REQUIRE_AUTH", False)

    client = TestClient(app)
    response = client.get(
        "/api/v1/config/me",
        headers={"X-API-Key": "readonly-secret-key-12345"},
    )
    assert response.status_code == 200
    assert unwrap_response(response)["role"] == "readonly"


def test_production_requires_api_key(monkeypatch):
    monkeypatch.setattr(settings, "ENVIRONMENT", "production")
    monkeypatch.setattr(settings, "ARTSA_API_KEY", None)
    monkeypatch.setattr(settings, "ARTSA_REQUIRE_AUTH", False)

    client = TestClient(app)
    response = client.get("/api/v1/sessions")
    assert response.status_code == 503


def test_cors_preflight_options_not_blocked_by_auth(monkeypatch):
    """Harness (browser) sends OPTIONS before POST; must not 401 without key."""
    monkeypatch.setattr(settings, "ARTSA_API_KEY", "test-secret-key-12345")
    monkeypatch.setattr(settings, "ENVIRONMENT", "development")
    monkeypatch.setattr(settings, "ARTSA_REQUIRE_AUTH", False)

    client = TestClient(app)
    response = client.options(
        "/api/v1/ingest",
        headers={
            "Origin": "http://localhost:3080",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type,x-api-key,authorization",
        },
    )
    assert response.status_code in (200, 204)
    assert response.status_code != 401
    # Starlette CORS should reflect allow headers for preflight
    allow_origin = response.headers.get("access-control-allow-origin")
    assert allow_origin in ("*", "http://localhost:3080")
