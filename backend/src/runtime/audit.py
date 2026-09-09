"""Append-only runtime enforcement audit (digest-only, never prompt or secrets)."""

from __future__ import annotations

import json
import logging
from collections import deque
from datetime import UTC, datetime
from typing import Any

from src.core.config import settings
from src.runtime.evidence import RuntimeAuditRecord

logger = logging.getLogger(__name__)

_memory: deque[dict[str, Any]] = deque(maxlen=2000)


def record_runtime_audit(record: RuntimeAuditRecord) -> dict[str, Any]:
    row = record.model_dump(mode="json")
    row["recorded_at"] = record.recorded_at.isoformat()
    _assert_no_forbidden_payload(row)
    _memory.appendleft(row)

    try:
        from src.services.telemetry_bus import telemetry_bus

        telemetry_bus.publish(
            {
                "type": "runtime_enforcement",
                "event_id": record.id,
                "session_id": record.session_id,
                "action": record.action.value,
                "stream": record.stream,
                "body_sha256": record.body_sha256,
                "finding_count": len(record.findings),
                "categories": [f.category for f in record.findings],
                "severity": "CRITICAL" if record.action.value == "BLOCK" else "HIGH",
            }
        )
    except Exception as exc:  # pragma: no cover
        logger.debug("Runtime audit telemetry skipped: %s", exc)

    if settings.is_testing:
        return row

    try:
        _persist_sync(row)
    except Exception as exc:
        if settings.ENVIRONMENT == "production":
            logger.error("Runtime audit DB persist failed in production: %s", exc)
            raise
        logger.warning("Runtime audit DB persist skipped: %s", exc)
    return row


def recent_runtime_audits(limit: int = 50) -> list[dict[str, Any]]:
    return list(_memory)[:limit]


def clear_runtime_audits() -> None:
    _memory.clear()


def _assert_no_forbidden_payload(row: dict[str, Any]) -> None:
    blob = json.dumps(row, default=str)
    if "matched_text" in blob:
        raise ValueError("runtime audit must not contain matched_text")
    if "-----BEGIN" in blob:
        raise ValueError("runtime audit must not contain private-key material")


def _persist_sync(row: dict[str, Any]) -> None:
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker

    from src.data.orm import RuntimeEnforcementAuditORM

    url = settings.SYNC_DATABASE_URL
    if settings.USE_SQLITE and "sqlite" not in url:
        url = "sqlite:///./data/artsa.db"
    engine = create_engine(url, echo=False)
    RuntimeEnforcementAuditORM.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    with factory() as session:
        session.add(
            RuntimeEnforcementAuditORM(
                id=row["id"],
                session_id=row["session_id"],
                stream=bool(row.get("stream")),
                action=row["action"],
                body_sha256=row["body_sha256"],
                findings=row.get("findings") or [],
                created_at=datetime.now(UTC),
            )
        )
        session.commit()
