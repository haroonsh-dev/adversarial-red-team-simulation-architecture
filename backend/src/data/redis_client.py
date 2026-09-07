"""Redis stream client with real Redis and in-memory fallback."""

from __future__ import annotations

import logging
import time
from typing import Any, Protocol

from src.core.config import settings

logger = logging.getLogger(__name__)


class RedisStreamProtocol(Protocol):
    def xadd(self, stream: str, fields: dict[str, Any]) -> str: ...
    def xadd_many(self, stream: str, entries: list[dict[str, Any]]) -> list[str]: ...
    def ping(self) -> bool: ...
    def set_nx(self, key: str, value: str, ttl_sec: int) -> bool: ...
    def set(self, key: str, value: str, ttl_sec: int | None = None) -> None: ...
    def get(self, key: str) -> str | None: ...
    def lpush(self, key: str, value: str) -> int: ...
    def brpop(self, key: str, timeout: float) -> str | None: ...


class InMemoryRedis:
    """In-memory Redis stream substitute when Redis is unavailable."""

    def __init__(self) -> None:
        self._streams: dict[str, list[dict[str, Any]]] = {}
        self._kv: dict[str, tuple[str, float]] = {}
        self._lists: dict[str, list[str]] = {}

    def xadd(self, stream: str, fields: dict[str, Any]) -> str:
        self._streams.setdefault(stream, []).append(fields)
        return str(len(self._streams[stream]))

    def xadd_many(self, stream: str, entries: list[dict[str, Any]]) -> list[str]:
        """Append multiple entries in one call (batched ingest hot path)."""
        if not entries:
            return []
        existing = self._streams.setdefault(stream, [])
        existing.extend(entries)
        start = len(existing) - len(entries)
        return [str(start + i + 1) for i in range(len(entries))]

    def ping(self) -> bool:
        return True

    def set_nx(self, key: str, value: str, ttl_sec: int) -> bool:
        """Atomic SET NX with TTL. True if the key was stored (first writer)."""
        now = time.time()
        expired = [k for k, (_, exp) in self._kv.items() if exp <= now]
        for k in expired:
            self._kv.pop(k, None)
        entry = self._kv.get(key)
        if entry is not None and entry[1] > now:
            return False
        self._kv[key] = (value, now + max(1, int(ttl_sec)))
        return True

    def set(self, key: str, value: str, ttl_sec: int | None = None) -> None:
        ttl = max(1, int(ttl_sec)) if ttl_sec else 86400
        self._kv[key] = (value, time.time() + ttl)

    def get(self, key: str) -> str | None:
        now = time.time()
        entry = self._kv.get(key)
        if entry is None or entry[1] <= now:
            self._kv.pop(key, None)
            return None
        return entry[0]

    def lpush(self, key: str, value: str) -> int:
        bucket = self._lists.setdefault(key, [])
        bucket.insert(0, value)
        return len(bucket)

    def brpop(self, key: str, timeout: float) -> str | None:
        deadline = time.time() + max(0.0, float(timeout))
        while True:
            bucket = self._lists.get(key) or []
            if bucket:
                return bucket.pop()
            if time.time() >= deadline:
                return None
            time.sleep(0.01)

    @property
    def is_live(self) -> bool:
        return False


class LiveRedisClient:
    """redis-py wrapper for stream publish."""

    def __init__(self, url: str) -> None:
        import redis

        self._url = url
        self._client = redis.from_url(
            url,
            decode_responses=True,
            socket_connect_timeout=1,
            socket_timeout=1,
        )
        self._client.ping()

    def xadd(self, stream: str, fields: dict[str, Any]) -> str:
        return self._client.xadd(stream, fields)  # type: ignore[return-value]

    def xadd_many(self, stream: str, entries: list[dict[str, Any]]) -> list[str]:
        """Batch multiple stream writes through one Redis pipeline round-trip."""
        if not entries:
            return []
        pipe = self._client.pipeline()  # type: ignore[attr-defined]
        for fields in entries:
            pipe.xadd(stream, fields)
        return [str(x) for x in pipe.execute()]

    def ping(self) -> bool:
        return bool(self._client.ping())

    def set_nx(self, key: str, value: str, ttl_sec: int) -> bool:
        """Atomic SET NX with TTL — shared across API processes."""
        result = self._client.set(key, value, nx=True, ex=max(1, int(ttl_sec)))
        return bool(result)

    def set(self, key: str, value: str, ttl_sec: int | None = None) -> None:
        if ttl_sec:
            self._client.set(key, value, ex=max(1, int(ttl_sec)))
        else:
            self._client.set(key, value)

    def get(self, key: str) -> str | None:
        val = self._client.get(key)
        return str(val) if val is not None else None

    def lpush(self, key: str, value: str) -> int:
        return int(self._client.lpush(key, value))

    def brpop(self, key: str, timeout: float) -> str | None:
        import redis

        wait = max(1, int(timeout))
        blocker = redis.from_url(
            self._url,
            decode_responses=True,
            socket_connect_timeout=1,
            socket_timeout=wait + 2,
        )
        try:
            result = blocker.brpop(key, timeout=wait)
        finally:
            blocker.close()
        if not result:
            return None
        return str(result[1])

    @property
    def is_live(self) -> bool:
        return True


_client: RedisStreamProtocol | None = None
_using_live = False


def _is_production() -> bool:
    return settings.ENVIRONMENT == "production" and not settings.is_testing


def get_redis_stream_client() -> RedisStreamProtocol:
    """Return shared Redis client (live or in-memory fallback).

    Production refuses the in-memory fallback so HMAC nonces and WebSocket
    tickets stay consistent across API processes.
    """
    global _client, _using_live
    if _client is not None:
        return _client

    production = _is_production()
    url = (settings.REDIS_URL or "").strip()
    memory_url = url.lower() in ("memory", "none", "")

    if settings.is_testing or (not production and memory_url):
        _client = InMemoryRedis()
        _using_live = False
        return _client

    if production and memory_url:
        raise RuntimeError("REDIS_URL is required in production (in-memory replay store forbidden)")

    try:
        _client = LiveRedisClient(url)
        _using_live = True
        logger.info("Connected to Redis at %s", url.split("@")[-1])
    except Exception as exc:
        if production:
            logger.error("Redis unavailable in production — refusing in-memory fallback: %s", exc)
            raise
        logger.warning("Redis unavailable (%s), using in-memory fallback", exc)
        _client = InMemoryRedis()
        _using_live = False
    return _client


def redis_is_live() -> bool:
    try:
        get_redis_stream_client()
    except Exception:
        return False
    return _using_live


def reset_redis_client() -> None:
    """Reset singleton (tests)."""
    global _client, _using_live
    _client = None
    _using_live = False


def probe_live_redis(url: str) -> LiveRedisClient:
    """Connect to a real Redis URL, bypassing the testing in-memory singleton."""
    return LiveRedisClient(url)


# Backward-compatible aliases
RedisClient = InMemoryRedis


def get_redis_client() -> RedisStreamProtocol:
    return get_redis_stream_client()
