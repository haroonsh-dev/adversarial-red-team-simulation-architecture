from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from src.core.config import settings
from src.data.db import Base
from src.data.orm import SessionCircuitBreakerORM
from src.runtime.circuit_breaker import circuit_breaker


@pytest.mark.asyncio
async def test_breaker_opens_on_third_block_and_is_tenant_isolated(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "ARTSA_CIRCUIT_BREAKER_ENABLED", True)
    monkeypatch.setattr(settings, "ARTSA_CIRCUIT_BREAKER_BLOCK_LIMIT", 3)
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'breaker.db'}")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    session_id = uuid.uuid4()
    async with factory() as db:
        assert not await circuit_breaker.record_block(db, tenant_id="tenant-a", session_id=session_id)
        assert not await circuit_breaker.record_block(db, tenant_id="tenant-a", session_id=session_id)
        assert not await circuit_breaker.is_open(db, tenant_id="tenant-a", session_id=session_id)
        assert await circuit_breaker.record_block(db, tenant_id="tenant-a", session_id=session_id)
        assert await circuit_breaker.is_open(db, tenant_id="tenant-a", session_id=session_id)
        assert not await circuit_breaker.is_open(db, tenant_id="tenant-b", session_id=session_id)
        await db.commit()
    await engine.dispose()


@pytest.mark.asyncio
async def test_expired_blocks_do_not_count_toward_trip(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "ARTSA_CIRCUIT_BREAKER_ENABLED", True)
    monkeypatch.setattr(settings, "ARTSA_CIRCUIT_BREAKER_BLOCK_LIMIT", 3)
    monkeypatch.setattr(settings, "ARTSA_CIRCUIT_BREAKER_WINDOW_SECONDS", 60)
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'breaker-expiry.db'}")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    session_id = uuid.uuid4()
    async with factory() as db:
        db.add(SessionCircuitBreakerORM(
            tenant_id="tenant-a", session_id=str(session_id),
            block_timestamps=[(datetime.now(UTC) - timedelta(seconds=61)).isoformat()] * 2,
        ))
        await db.commit()
        assert not await circuit_breaker.record_block(db, tenant_id="tenant-a", session_id=session_id)
        row = (await db.execute(select(SessionCircuitBreakerORM))).scalar_one()
        assert len(row.block_timestamps) == 1
    await engine.dispose()


@pytest.mark.asyncio
async def test_production_store_failure_is_treated_as_open(monkeypatch):
    class BrokenDatabase:
        async def execute(self, *_args, **_kwargs):
            raise OSError("database unavailable")

    monkeypatch.setattr(settings, "ENVIRONMENT", "production")
    monkeypatch.setattr(settings, "ARTSA_CIRCUIT_BREAKER_ENABLED", True)
    session_id = uuid.uuid4()
    assert await circuit_breaker.is_open(BrokenDatabase(), tenant_id="tenant-a", session_id=session_id)
    assert await circuit_breaker.record_block(BrokenDatabase(), tenant_id="tenant-a", session_id=session_id)
