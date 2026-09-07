"""Persist HMAC handoff audit evidence (memory + SQLite/Postgres)."""

from __future__ import annotations

import logging
from collections import deque
from datetime import UTC, datetime
from typing import Any

from src.core.config import settings
from src.core.hmac_handoff import HandoffAuditRecord

logger = logging.getLogger(__name__)

_memory: deque[dict[str, Any]] = deque(maxlen=2000)


def record_handoff_audit(record: HandoffAuditRecord) -> dict[str, Any]:
    row = record.model_dump(mode="json")
    row["recorded_at"] = datetime.now(UTC).isoformat()
    _memory.appendleft(row)

    try:
        from src.services.telemetry_bus import telemetry_bus

        telemetry_bus.publish(
            {
                "type": "hmac_handoff",
                "event_id": record.event_id,
                "trace_id": record.event_id,
                "campaign_id": record.campaign_id,
                "round_id": record.round_id,
                "source_agent": record.sender,
                "target_agent": record.receiver,
                "hmac_state": record.hmac_state.value,
                "hmac_verified": record.hmac_state.value == "ok",
                "signature_status": record.signature_status,
                "verification_result": record.verification_result,
                "replay_detected": record.replay_detected,
                "containment_result": record.containment_result,
                "tenant_id": record.tenant_id,
                "severity": "CRITICAL" if record.hmac_state.value == "fail" else "INFO",
                "verdict": record.verification_result,
            }
        )
    except Exception as exc:  # pragma: no cover - audit must not break the hop
        logger.warning("HMAC audit telemetry publish skipped: %s", exc)

    if settings.is_testing:
        return row

    try:
        _persist_sync(row)
    except Exception as exc:
        if settings.ENVIRONMENT == "production":
            logger.error("HMAC audit DB persist failed in production: %s", exc)
            raise
        logger.warning("HMAC audit DB persist skipped: %s", exc)
    return row


def recent_handoff_audits(limit: int = 50) -> list[dict[str, Any]]:
    return list(_memory)[:limit]


def clear_handoff_audits() -> None:
    _memory.clear()


def _persist_sync(row: dict[str, Any]) -> None:
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker

    from src.data.orm import HmacHandoffAuditORM

    url = settings.SYNC_DATABASE_URL
    if settings.USE_SQLITE and "sqlite" not in url:
        url = "sqlite:///./data/artsa.db"
    engine = create_engine(url, echo=False)
    HmacHandoffAuditORM.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    with factory() as session:
        session.add(
            HmacHandoffAuditORM(
                id=row.get("id") or row["event_id"],
                event_id=row["event_id"],
                sender=row["sender"],
                receiver=row["receiver"],
                campaign_id=row["campaign_id"],
                round_id=row.get("round_id"),
                nonce_sha256=row["nonce_sha256"],
                body_sha256=row["body_sha256"],
                hmac_state=row["hmac_state"],
                signature_status=row["signature_status"],
                verification_result=row["verification_result"],
                replay_detected=bool(row["replay_detected"]),
                containment_result=row.get("containment_result"),
                tenant_id=row.get("tenant_id") or "default_org",
                created_at=datetime.now(UTC),
            )
        )
        session.commit()
