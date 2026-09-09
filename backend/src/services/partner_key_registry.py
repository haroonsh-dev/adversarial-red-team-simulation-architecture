"""In-memory registry of partner API key hashes → role.

Auth middleware is sync, so we resolve partner keys from this cache.
The store refreshes the cache on create / revoke / startup load.

If the cache is empty after a hot-reload race (uvicorn reload before async
startup finishes), we fall back to a sync SQLite read so Harness ingest
does not suddenly 401.
"""

from __future__ import annotations

import hashlib
import logging
import sqlite3
import threading
import time
from pathlib import Path
from typing import Any

from src.core.rbac import Role

logger = logging.getLogger(__name__)

_lock = threading.Lock()
# key_hash -> {id, name, role, tenant_id, enabled}
_HASH_INDEX: dict[str, dict[str, Any]] = {}
_LAST_SYNC_LOAD = 0.0
_SYNC_LOAD_COOLDOWN_SEC = 2.0


def hash_api_key(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def clear() -> None:
    with _lock:
        _HASH_INDEX.clear()


def replace_all(entries: list[dict[str, Any]]) -> None:
    """Replace the whole index (used on startup / full reload)."""
    with _lock:
        _HASH_INDEX.clear()
        for e in entries:
            if not e.get("enabled", True):
                continue
            h = e.get("key_hash")
            if not h:
                continue
            _HASH_INDEX[str(h)] = {
                "id": e.get("id"),
                "name": e.get("name"),
                "role": e.get("role") or "analyst",
                "tenant_id": e.get("tenant_id") or "default_org",
                "enabled": True,
            }


def upsert(entry: dict[str, Any]) -> None:
    h = entry.get("key_hash")
    if not h:
        return
    with _lock:
        if not entry.get("enabled", True):
            _HASH_INDEX.pop(str(h), None)
            return
        _HASH_INDEX[str(h)] = {
            "id": entry.get("id"),
            "name": entry.get("name"),
            "role": entry.get("role") or "analyst",
            "tenant_id": entry.get("tenant_id") or "default_org",
            "enabled": True,
        }


def remove_by_hash(key_hash: str) -> None:
    with _lock:
        _HASH_INDEX.pop(key_hash, None)


def has_any() -> bool:
    with _lock:
        return bool(_HASH_INDEX)


def _sqlite_candidates() -> list[Path]:
    paths: list[Path] = []
    try:
        from src.core.config import settings

        for url in (settings.SYNC_DATABASE_URL, settings.DATABASE_URL):
            raw = (url or "").strip()
            if "sqlite" not in raw:
                continue
            # sqlite:///./data/artsa.db  or  sqlite+aiosqlite:///./data/artsa.db
            if ":///" in raw:
                rel = raw.split(":///", 1)[-1]
            elif "://" in raw:
                rel = raw.split("://", 1)[-1]
            else:
                continue
            p = Path(rel)
            paths.append(p if p.is_absolute() else Path.cwd() / p)
    except Exception:
        pass
    # Common locations when cwd is repo root vs backend/
    paths.extend(
        [
            Path.cwd() / "data" / "artsa.db",
            Path.cwd() / "backend" / "data" / "artsa.db",
            Path(__file__).resolve().parents[2] / "data" / "artsa.db",
        ]
    )
    # Dedupe while preserving order
    seen: set[str] = set()
    out: list[Path] = []
    for p in paths:
        key = str(p.resolve()) if p.exists() else str(p)
        if key in seen:
            continue
        seen.add(key)
        out.append(p)
    return out


def _sync_reload_from_sqlite() -> None:
    """Best-effort sync hydrate after reload races empty the in-memory index."""
    global _LAST_SYNC_LOAD

    now = time.monotonic()
    if now - _LAST_SYNC_LOAD < _SYNC_LOAD_COOLDOWN_SEC:
        return
    _LAST_SYNC_LOAD = now

    rows: list[tuple[Any, ...]] = []
    for path in _sqlite_candidates():
        if not path.exists():
            continue
        try:
            con = sqlite3.connect(f"file:{path}?mode=ro", uri=True, timeout=1.0)
            try:
                rows = con.execute(
                    "SELECT id, name, key_hash, role, tenant_id, enabled "
                    "FROM partner_api_keys WHERE enabled = 1"
                ).fetchall()
            finally:
                con.close()
            if rows:
                break
        except Exception as exc:
            logger.debug("Partner key sync reload skipped for %s: %s", path, exc)

    if not rows:
        return

    entries = [
        {
            "id": r[0],
            "name": r[1],
            "key_hash": r[2],
            "role": r[3] or "analyst",
            "tenant_id": r[4] or "default_org",
            "enabled": bool(r[5]),
        }
        for r in rows
    ]
    replace_all(entries)
    logger.info("Partner API keys sync-reloaded from SQLite: %s", len(entries))


def resolve(raw_api_key: str | None) -> Role | None:
    """Return the Role for a partner key, or None if unknown."""
    if not raw_api_key:
        return None
    h = hash_api_key(raw_api_key)
    with _lock:
        meta = _HASH_INDEX.get(h)
    if meta is None and raw_api_key.startswith("artsa_live_"):
        _sync_reload_from_sqlite()
        with _lock:
            meta = _HASH_INDEX.get(h)
    if not meta or not meta.get("enabled"):
        return None
    try:
        return Role(str(meta["role"]))
    except ValueError:
        return Role.ANALYST


def resolve_metadata(raw_api_key: str | None) -> dict[str, Any] | None:
    """Return the non-secret tenant binding for a validated partner key."""
    if resolve(raw_api_key) is None or not raw_api_key:
        return None
    with _lock:
        meta = _HASH_INDEX.get(hash_api_key(raw_api_key))
        return dict(meta) if meta else None
