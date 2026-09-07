"""Health and readiness endpoints."""

from fastapi import APIRouter, Response, status

from src.core.auth_credentials import any_static_api_key_configured
from src.core.config import settings
from src.core.readiness import (
    database_readiness_async,
    embeddings_readiness,
    redis_readiness,
    signing_key_readiness,
)
from src.data.redis_client import redis_is_live

router = APIRouter(tags=["Health"])


@router.get("/health")
async def get_health():
    """Liveness probe — process is up (does not fail on soft dependency issues)."""
    db_status = "ok"
    if not settings.is_testing:
        try:
            from src.data.db import get_engine

            get_engine()
        except Exception as exc:
            db_status = f"error: {exc}"

    rag_backend = "in_memory"
    if settings.USE_PINECONE_RAG and settings.is_key_configured("PINECONE_API_KEY"):
        rag_backend = "pinecone"
    elif settings.USE_CHROMA_RAG:
        rag_backend = "chroma"

    return {
        "status": "ok",
        "version": "0.3.0",
        "environment": settings.ENVIRONMENT,
        "subsystems": {
            "database": db_status,
            "redis": "live" if redis_is_live() else "fallback",
            "use_sqlite": settings.USE_SQLITE,
            "auth_required": settings.auth_required,
            "oidc_enabled": settings.ARTSA_OIDC_ENABLED,
            "auto_enforce": settings.ARTSA_AUTO_ENFORCE,
            "block_contained_sessions": settings.ARTSA_BLOCK_CONTAINED_SESSIONS,
            "rag_backend": rag_backend,
            "prometheus": "/api/v1/metrics/prometheus",
        },
        "api_gateway": {
            "status": "fully_connected",
            "mode": "unified",
            "standalone_required": False,
            "routes": [
                "ingest",
                "campaigns",
                "attack-library",
                "observatory",
                "topology",
                "sessions",
                "metrics",
                "mcp",
                "risks",
                *(["otel_experimental"] if settings.ARTSA_OTEL_ENABLED else []),
            ],
        },
    }


@router.get("/ready")
async def get_ready(response: Response):
    """Readiness probe — refuse traffic when production config is unsafe."""
    checks: dict[str, str] = {}
    ready = True

    db_ok, db_detail = await database_readiness_async()
    checks["database"] = db_detail
    if not db_ok:
        ready = False

    if settings.auth_required:
        if any_static_api_key_configured() or settings.ARTSA_OIDC_ENABLED:
            checks["auth"] = "ok"
        else:
            checks["auth"] = "missing_credentials"
            ready = False
    else:
        checks["auth"] = "optional"

    if settings.ENVIRONMENT == "production" and (settings.ARTSA_CORS_ORIGINS or "*").strip() == "*":
        checks["cors"] = "wildcard_forbidden"
        ready = False
    else:
        checks["cors"] = "ok"

    redis_ok, redis_detail = redis_readiness()
    checks["redis"] = redis_detail
    if not redis_ok:
        ready = False

    embed_ok, embed_detail = embeddings_readiness()
    checks["embeddings"] = embed_detail
    if not embed_ok:
        ready = False

    sign_ok, sign_detail = signing_key_readiness()
    checks["signing_key"] = sign_detail
    if not sign_ok:
        ready = False

    checks["auto_enforce"] = "on" if settings.ARTSA_AUTO_ENFORCE else "off"

    if not ready:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE

    return {
        "status": "ready" if ready else "not_ready",
        "environment": settings.ENVIRONMENT,
        "checks": checks,
    }
