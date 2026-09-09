"""Durable ASI08 circuit breaker for repeated hard containment decisions."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.config import settings
from src.data.orm import SessionCircuitBreakerORM
from src.runtime.actions import RuntimeAction
from src.runtime.audit import record_runtime_audit
from src.runtime.evidence import RedactedFinding, RuntimeAuditRecord, sha256_text


class CircuitBreakerUnavailable(RuntimeError):
    """Persistence failed where production must fail closed."""


class SessionCircuitBreaker:
    async def is_open(self, db: AsyncSession, *, tenant_id: str, session_id: uuid.UUID) -> bool:
        if not settings.ARTSA_CIRCUIT_BREAKER_ENABLED:
            return False
        try:
            row = (await db.execute(
                select(SessionCircuitBreakerORM).where(
                    SessionCircuitBreakerORM.tenant_id == tenant_id,
                    SessionCircuitBreakerORM.session_id == str(session_id),
                )
            )).scalar_one_or_none()
            return bool(row and row.opened_at is not None)
        except Exception as exc:
            if settings.ENVIRONMENT == "production":
                # The protected operation must never proceed when its durable
                # guard cannot be consulted.  Treat an unavailable store as
                # open rather than leaking a backend exception to the caller.
                return True
            return False

    async def record_block(self, db: AsyncSession, *, tenant_id: str, session_id: uuid.UUID) -> bool:
        """Record one BLOCK and return whether this call opened the breaker."""
        if not settings.ARTSA_CIRCUIT_BREAKER_ENABLED:
            return False
        try:
            row = (await db.execute(
                select(SessionCircuitBreakerORM).where(
                    SessionCircuitBreakerORM.tenant_id == tenant_id,
                    SessionCircuitBreakerORM.session_id == str(session_id),
                )
            )).scalar_one_or_none()
            if row is None:
                row = SessionCircuitBreakerORM(tenant_id=tenant_id, session_id=str(session_id))
                db.add(row)
            if row.opened_at is not None:
                return True
            now = datetime.now(UTC)
            cutoff = now - timedelta(seconds=max(1, settings.ARTSA_CIRCUIT_BREAKER_WINDOW_SECONDS))
            timestamps: list[str] = []
            for value in row.block_timestamps or []:
                try:
                    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
                    if parsed >= cutoff:
                        timestamps.append(parsed.astimezone(UTC).isoformat())
                except (TypeError, ValueError):
                    continue
            timestamps.append(now.isoformat())
            row.block_timestamps = timestamps
            if len(timestamps) >= max(1, settings.ARTSA_CIRCUIT_BREAKER_BLOCK_LIMIT):
                row.opened_at = now
                return True
            return False
        except Exception as exc:
            if settings.ENVIRONMENT == "production":
                # A failing write cannot make a dangerous operation safe.
                # Callers handle this as an open breaker and withhold it.
                return True
            return False


circuit_breaker = SessionCircuitBreaker()


def record_breaker_trip(session_id: uuid.UUID) -> None:
    """Append digest-only ASI08 evidence; no operation body is retained."""
    digest = sha256_text("")
    record_runtime_audit(
        RuntimeAuditRecord(
            session_id=str(session_id),
            action=RuntimeAction.BLOCK,
            body_sha256=digest,
            findings=[
                RedactedFinding(
                    detector="SessionCircuitBreaker",
                    category="ASI08_CASCADING_FAILURES",
                    body_sha256=digest,
                    action=RuntimeAction.BLOCK,
                )
            ],
        )
    )
