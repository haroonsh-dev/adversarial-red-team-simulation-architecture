"""Readiness probes for embeddings, Redis, database, and signing key."""

import pytest
from src.core import readiness
from src.core.config import settings
from src.core.hmac_handoff import signing_key_available
from src.core.readiness import embeddings_readiness, redis_readiness, signing_key_readiness
from src.data.redis_client import get_redis_stream_client, reset_redis_client


def test_testing_environment_is_ready():
    ok, detail = embeddings_readiness()
    assert ok is True
    assert "hash-1024" in detail
    assert "dim=" in detail
    redis_ok, redis_detail = redis_readiness()
    assert redis_ok is True
    assert redis_detail in {"live", "fallback"}
    sign_ok, _ = signing_key_readiness()
    assert sign_ok is True


def test_production_rejects_hash_embeddings(monkeypatch):
    monkeypatch.setattr(settings, "ENVIRONMENT", "production")
    monkeypatch.setattr(settings, "ARTSA_EMBEDDING_MODEL", "hash-1024")
    ok, detail = embeddings_readiness()
    assert ok is False
    assert "hash-1024" in detail


def test_production_rejects_in_memory_redis(monkeypatch):
    monkeypatch.setattr(settings, "ENVIRONMENT", "production")
    monkeypatch.setattr(readiness, "redis_is_live", lambda: False)
    ok, detail = redis_readiness()
    assert ok is False
    assert detail == "fallback_forbidden"


def test_production_rejects_weak_signing_key(monkeypatch):
    monkeypatch.setattr(settings, "ENVIRONMENT", "production")
    monkeypatch.setattr(settings, "SECRET_KEY", "change-me-in-production")
    monkeypatch.setattr(settings, "ARTSA_HMAC_HANDOFF_SECRET", None)
    ok, _detail = signing_key_available()
    assert ok is False
    ready_ok, _ = signing_key_readiness()
    assert ready_ok is False


def test_production_redis_refuses_memory_url(monkeypatch):
    monkeypatch.setattr(settings, "ENVIRONMENT", "production")
    monkeypatch.setattr(settings, "REDIS_URL", "memory")
    reset_redis_client()
    with pytest.raises(RuntimeError, match="REDIS_URL"):
        get_redis_stream_client()
    reset_redis_client()


def test_embeddings_readiness_fails_closed_on_inference_error(monkeypatch):
    from src.data.embedding_manager import EmbeddingUnavailable

    readiness._embed_warmup_cache.clear()
    monkeypatch.setattr(settings, "ENVIRONMENT", "development")
    monkeypatch.setattr(settings, "ARTSA_EMBEDDING_MODEL", "local-bge-small")
    monkeypatch.setattr(readiness, "fastembed_available", lambda: True)

    def _boom(self, text: str):
        raise EmbeddingUnavailable("onnx missing")

    monkeypatch.setattr(
        "src.data.embedding_manager.HighAccuracy1024EmbeddingFunction.embed",
        _boom,
    )
    ok, detail = embeddings_readiness()
    assert ok is False
    assert "inference_failed" in detail
