"""Repository for tool-call event persistence."""

from __future__ import annotations

from collections.abc import Sequence
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.config import settings
from src.core.models.events import ToolCallEvent
from src.data import memory_store
from src.data.orm import ToolCallEventORM
from src.data.repositories.base import BaseRepository


class EventRepository(BaseRepository[ToolCallEventORM]):
    """Repository for tool-call event persistence."""

    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session, ToolCallEventORM)
        self._use_memory = settings.is_testing

    def _to_domain(self, row: ToolCallEventORM) -> ToolCallEvent:
        import uuid as _uuid
        return ToolCallEvent(
            id=_uuid.UUID(str(row.id)),
            session_id=_uuid.UUID(str(row.session_id)),
            agent_id=row.agent_id,
            tool_name=row.tool_name,
            arguments=dict(row.arguments or {}),
            timestamp=row.timestamp,
            trace_id=row.trace_id,
            response=dict(row.response) if row.response else None,
            post_exec_redacted=bool(row.post_exec_redacted),
            response_sha256=row.response_sha256,
            response_findings=list(row.response_findings or []),
            latency_ms=row.latency_ms,
        )

    def _to_orm(self, event: ToolCallEvent, tenant_id: str = "default_tenant") -> ToolCallEventORM:
        return ToolCallEventORM(
            id=str(event.id),
            session_id=str(event.session_id),
            agent_id=event.agent_id,
            tool_name=event.tool_name,
            arguments=event.arguments,
            timestamp=event.timestamp,
            trace_id=event.trace_id,
            response=event.response,
            post_exec_redacted=event.post_exec_redacted,
            response_sha256=event.response_sha256,
            response_findings=event.response_findings,
            latency_ms=event.latency_ms,
            tenant_id=tenant_id,
        )

    async def bulk_insert(
        self,
        events: Sequence[ToolCallEvent],
        tenant_id: str = "default_tenant",
    ) -> list[ToolCallEvent]:
        if not events:
            return []

        if self._use_memory:
            return [memory_store.store_event(event) for event in events]

        rows = [self._to_orm(event, tenant_id=tenant_id) for event in events]
        await self.bulk_create(rows)
        await self.session.commit()
        for event in events:
            memory_store.store_event(event)
        from src.services.mongo_sink import mongo_sink
        for event in events:
            mongo_sink.enqueue_tool_call(event)
        return list(events)

    async def get_by_session(self, session_id: UUID) -> list[ToolCallEvent]:
        if self._use_memory:
            return sorted(memory_store.get_events_by_session(session_id), key=lambda e: e.timestamp)

        result = await self.session.execute(
            select(ToolCallEventORM)
            .where(ToolCallEventORM.session_id == str(session_id))
            .order_by(ToolCallEventORM.timestamp)
        )
        events = [self._to_domain(row) for row in result.scalars().all()]
        if events:
            return events

        return sorted(memory_store.get_events_by_session(session_id), key=lambda e: e.timestamp)
