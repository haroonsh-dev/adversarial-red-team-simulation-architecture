"""Production readiness probes: database, Redis, embeddings, signing key."""

from __future__ import annotations

import time

from src.core.config import settings
from src.core.hmac_handoff import signing_key_available
from src.data.embedding_manager import EmbeddingUnavailable, fastembed_available
from src.data.redis_client import redis_is_live

_EMBED_WARMUP_TEXT = "artsa-readiness-warmup"
_EMBED_WARMUP_TTL_SEC = 60.0
_embed_warmup_cache: dict[str, tuple[float, bool, str]] = {}


def database_readiness() -> tuple[bool, str]:
    if settings.is_testing:
        return True, "ok"
    try:
        from src.data.db import get_engine

        get_engine()
        return True, "ok"
    except Exception as exc:
        return False, f"error:{exc}"


async def database_readiness_async() -> tuple[bool, str]:
    if settings.is_testing:
        return True, "ok"
    try:
        from sqlalchemy import text

        from src.data.db import get_engine

        engine = get_engine()
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        return True, "ok"
    except Exception as exc:
        return False, f"error:{exc}"


def redis_readiness() -> tuple[bool, str]:
    live = redis_is_live()
    if live:
        return True, "live"
    if settings.ENVIRONMENT == "production":
        return False, "fallback_forbidden"
    return True, "fallback"


def _warmup_embedding(model: str) -> tuple[bool, str]:
    """Load the configured model and run one inference. Cached briefly for probes."""
    now = time.time()
    cached = _embed_warmup_cache.get(model)
    if cached and cached[0] > now:
        return cached[1], cached[2]

    from src.data.embedding_manager import HighAccuracy1024EmbeddingFunction

    try:
        vec = HighAccuracy1024EmbeddingFunction(model_name=model).embed(_EMBED_WARMUP_TEXT)
    except EmbeddingUnavailable as exc:
        detail = f"inference_failed:{exc}"
        _embed_warmup_cache[model] = (now + 5.0, False, detail)
        return False, detail
    except Exception as exc:
        detail = f"inference_failed:{exc}"
        _embed_warmup_cache[model] = (now + 5.0, False, detail)
        return False, detail
    if not vec:
        detail = "empty_embedding"
        _embed_warmup_cache[model] = (now + 5.0, False, detail)
        return False, detail
    detail = f"ok:{model}:dim={len(vec)}"
    _embed_warmup_cache[model] = (now + _EMBED_WARMUP_TTL_SEC, True, detail)
    return True, detail


def embeddings_readiness() -> tuple[bool, str]:
    model = settings.resolve_embedding_model()
    if model == "hash-1024" and settings.ENVIRONMENT == "production":
        return False, "hash-1024_forbidden_in_production"
    if model.startswith("local-") and not fastembed_available():
        return False, "fastembed_missing"
    if model.startswith("text-embedding") and not settings.is_key_configured("OPENAI_API_KEY"):
        return False, "openai_key_missing"
    if model not in {"hash-1024"} and not model.startswith("local-") and not model.startswith("text-embedding"):
        return False, f"unknown_model:{model}"
    return _warmup_embedding(model)


def signing_key_readiness() -> tuple[bool, str]:
    ok, detail = signing_key_available()
    if settings.ENVIRONMENT == "production" and not ok:
        return False, detail
    if settings.is_testing:
        return True, detail
    return ok, detail
