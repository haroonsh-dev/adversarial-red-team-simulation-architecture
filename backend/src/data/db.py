"""Async SQLAlchemy engine and session factory."""

from __future__ import annotations

from collections.abc import AsyncGenerator
from pathlib import Path

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from src.core.config import settings


class Base(DeclarativeBase):
    pass


_engine = None
_session_factory = None


def get_engine():
    global _engine
    if _engine is None:
        url = settings.effective_database_url
        if url.startswith("sqlite:///") and not url.startswith("sqlite+aiosqlite"):
            url = url.replace("sqlite:///", "sqlite+aiosqlite:///", 1)
        if "sqlite" in url:
            db_path = url.split("///")[-1]
            Path(db_path).parent.mkdir(parents=True, exist_ok=True)
        _engine = create_async_engine(url, echo=False)
    return _engine


def get_session_factory():
    global _session_factory
    if _session_factory is None:
        _session_factory = async_sessionmaker(get_engine(), expire_on_commit=False)
    return _session_factory


async def get_async_session() -> AsyncGenerator[AsyncSession, None]:
    factory = get_session_factory()
    async with factory() as session:
        yield session


async def init_db() -> None:
    from src.data.orm import (  # noqa: F401
        AlertORM,
        AlertRuleORM,
        CampaignJobORM,
        CustomIntegrationORM,
        EventEvaluationORM,
        HmacHandoffAuditORM,
        PartnerApiKeyORM,
        ProviderORM,
        SessionORM,
        TargetORM,
        ToolCallEventORM,
        UserORM,
    )

    engine = get_engine()
    async with engine.begin() as conn:
        # Lightweight dev upgrade: SQLite DBs created before newer columns
        # existed (create_all can't ALTER existing tables) get them added here.
        # Postgres installs should use `alembic upgrade head` instead.
        if "sqlite" in settings.effective_database_url:
            tables = [
                row[0]
                for row in await conn.execute(
                    text("SELECT name FROM sqlite_master WHERE type='table'")
                )
            ]
            if "alert_rules" in tables:
                alert_cols = [row[1] for row in await conn.execute(text("PRAGMA table_info(alert_rules)"))]
                if "config" not in alert_cols:
                    await conn.execute(text("ALTER TABLE alert_rules ADD COLUMN config JSON DEFAULT '{}'"))
                if "tenant_id" not in alert_cols:
                    await conn.execute(text("ALTER TABLE alert_rules ADD COLUMN tenant_id VARCHAR(255) NOT NULL DEFAULT 'default_tenant'"))
            if "users" in tables:
                cols = [row[1] for row in await conn.execute(text("PRAGMA table_info(users)"))]
                if "avatar" not in cols:
                    await conn.execute(text("ALTER TABLE users ADD COLUMN avatar TEXT"))
                # Profile fields added after the avatar column — SQLite ignores
                # VARCHAR length, so the original avatar VARCHAR(16) needs no ALTER.
                for col in ("phone", "location", "organization"):
                    if col not in cols:
                        await conn.execute(
                            text(f"ALTER TABLE users ADD COLUMN {col} VARCHAR(255)")
                        )
                if "tenant_id" not in cols:
                    # WS-3.1 hardening: identity -> tenant binding.
                    await conn.execute(text("ALTER TABLE users ADD COLUMN tenant_id VARCHAR(255) NOT NULL DEFAULT 'default_org'"))
            if "alerts" in tables:
                cols = [row[1] for row in await conn.execute(text("PRAGMA table_info(alerts)"))]
                if "risk_score" not in cols:
                    await conn.execute(text("ALTER TABLE alerts ADD COLUMN risk_score FLOAT NOT NULL DEFAULT 70.0"))
                if "tenant_id" not in cols:
                    await conn.execute(text("ALTER TABLE alerts ADD COLUMN tenant_id VARCHAR(255) NOT NULL DEFAULT 'default_tenant'"))
                if "status" not in cols:
                    # WS-3.3 incident workflow: NEW | ACKNOWLEDGED | RESOLVED.
                    await conn.execute(text("ALTER TABLE alerts ADD COLUMN status VARCHAR(16) NOT NULL DEFAULT 'NEW'"))

            if "hmac_handoff_audit" in tables:
                hmac_cols = [
                    row[1]
                    for row in await conn.execute(text("PRAGMA table_info(hmac_handoff_audit)"))
                ]
                if "nonce" in hmac_cols and "nonce_sha256" not in hmac_cols:
                    await conn.execute(
                        text(
                            "ALTER TABLE hmac_handoff_audit RENAME COLUMN nonce TO nonce_sha256"
                        )
                    )
                    hmac_cols = [
                        row[1]
                        for row in await conn.execute(text("PRAGMA table_info(hmac_handoff_audit)"))
                    ]
                if "event_id" not in hmac_cols:
                    await conn.execute(
                        text(
                            "ALTER TABLE hmac_handoff_audit ADD COLUMN event_id VARCHAR(64) NOT NULL DEFAULT ''"
                        )
                    )
                    await conn.execute(
                        text(
                            "UPDATE hmac_handoff_audit SET event_id = id WHERE event_id = '' OR event_id IS NULL"
                        )
                    )
            tenant_tables = (
                "event_evaluations",
                "custom_integrations",
                "campaign_jobs",
                "agent_baselines",
                "tool_call_events",
                "agent_sessions",
                "agents",
            )
            for tbl in tenant_tables:
                if tbl in tables:
                    cols = [row[1] for row in await conn.execute(text(f"PRAGMA table_info({tbl})"))]
                    if "tenant_id" not in cols:
                        await conn.execute(
                            text(f"ALTER TABLE {tbl} ADD COLUMN tenant_id VARCHAR(255) NOT NULL DEFAULT 'default_tenant'")
                        )
        await conn.run_sync(Base.metadata.create_all)
