"""Repository for agent session persistence."""

from __future__ import annotations

from datetime import UTC
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.models.sessions import Session
from src.data import memory_store
from src.data.orm import SessionORM
from src.data.repositories.base import BaseRepository


class SessionRepository(BaseRepository[SessionORM]):
    """Repository for agent session persistence."""

    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session, SessionORM)
        # Mock sessions used in unit tests have no SQL execute. A real
        # AsyncSession must persist even when ENVIRONMENT=testing so
        # proxy approval rows and session status stay durable together.
        self._use_memory = not hasattr(session, "execute")

    def _to_domain(self, row: SessionORM) -> Session:
        import uuid as _uuid
        return Session(
            id=_uuid.UUID(str(row.id)),
            agent_id=row.agent_id,
            tenant_id=row.tenant_id,
            status=row.status,
            started_at=row.started_at,
            ended_at=row.ended_at,
            tool_call_count=row.tool_call_count,
            max_risk_score=row.max_risk_score,
            containment_breaches=row.containment_breaches,
        )

    def _to_orm(self, session: Session) -> SessionORM:
        return SessionORM(
            id=str(session.id),
            agent_id=session.agent_id,
            tenant_id=session.tenant_id,
            status=session.status,
            started_at=session.started_at,
            ended_at=session.ended_at,
            tool_call_count=session.tool_call_count,
            max_risk_score=session.max_risk_score,
            containment_breaches=session.containment_breaches,
        )

    async def create_session(self, session: Session, *, commit: bool = True) -> Session:
        memory_store.store_session(session)
        if self._use_memory:
            return session
        self.session.add(self._to_orm(session))
        if commit:
            await self.session.commit()
        from src.services.mongo_sink import mongo_sink
        mongo_sink.enqueue_session(session, "created")
        return session

    async def get_session(self, session_id: UUID) -> Session | None:
        cached = memory_store.get_session(session_id)
        if cached:
            return cached
        if self._use_memory:
            return None
        result = await self.session.execute(
            select(SessionORM).where(SessionORM.id == str(session_id))
        )
        row = result.scalar_one_or_none()
        return self._to_domain(row) if row else None

    async def list_sessions(
        self,
        tenant_id: str | None = None,
        status: str | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> list[Session]:
        cached = memory_store.list_sessions(tenant_id=tenant_id, status=status, limit=limit, offset=offset)
        if cached or self._use_memory:
            return cached
        query = select(SessionORM)
        if tenant_id:
            query = query.where(SessionORM.tenant_id == tenant_id)
        if status:
            query = query.where(SessionORM.status == status)
        query = query.offset(offset).limit(limit)
        result = await self.session.execute(query)
        return [self._to_domain(row) for row in result.scalars().all()]

    async def update_risk_score(
        self, session_id: UUID, risk_score: float, breached: bool = False, *, commit: bool = True
    ) -> None:
        memory_store.update_session_risk(session_id, risk_score, breached=breached)
        if self._use_memory:
            return
        result = await self.session.execute(
            select(SessionORM).where(SessionORM.id == str(session_id))
        )
        row = result.scalar_one_or_none()
        if not row:
            return
        row.max_risk_score = max(row.max_risk_score, risk_score)
        if breached:
            row.containment_breaches += 1
            row.status = "BREACHED"
        if commit:
            await self.session.commit()
        from src.services.mongo_sink import mongo_sink
        mongo_sink.enqueue_session(row, "breach" if breached else "risk")

    async def apply_action(self, session_id: UUID, action: str, *, commit: bool = True) -> Session | None:
        """Persist KILL / QUARANTINE / THROTTLE / RELEASE / CLOSE to memory + DB."""
        from datetime import datetime

        action_u = action.upper()
        status_map = {
            "KILL": "BREACHED",
            "QUARANTINE": "QUARANTINED",
            "PENDING_APPROVAL": "PENDING_APPROVAL",
            "THROTTLE": None,
            "RELEASE": "ACTIVE",
            "CLOSE": "CLOSED",
        }
        if action_u not in status_map:
            return None

        cached = memory_store.get_session(session_id)
        ended = action_u in ("KILL", "CLOSE")
        new_status = status_map[action_u]
        if cached and new_status:
            memory_store.apply_session_status(session_id, new_status, ended=ended)
        elif cached and action_u == "THROTTLE":
            cached.max_risk_score = max(cached.max_risk_score, 50.0)

        if self._use_memory:
            return memory_store.get_session(session_id)

        result = await self.session.execute(select(SessionORM).where(SessionORM.id == str(session_id)))
        row = result.scalar_one_or_none()
        if not row:
            return memory_store.get_session(session_id)

        if new_status:
            row.status = new_status
            if new_status == "ACTIVE":
                # Incident release: resume normal operation.
                row.ended_at = None
            if ended:
                row.ended_at = datetime.now(UTC)
                row.containment_breaches = (row.containment_breaches or 0) + 1
        elif action_u == "THROTTLE":
            row.max_risk_score = max(row.max_risk_score or 0.0, 50.0)
        if commit:
            await self.session.commit()
        from src.services.mongo_sink import mongo_sink
        mongo_sink.enqueue_session(row, "action")
        return self._to_domain(row)

    async def increment_breach_count(self, session_id: UUID) -> None:
        await self.update_risk_score(session_id, 100.0, breached=True)
