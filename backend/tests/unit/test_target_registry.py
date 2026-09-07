"""Target registry persistence, tenant scoping, and discovery derivation."""

from __future__ import annotations

import tempfile

import pytest

from src.core.models.targets import TargetCreate, TargetUpdate


@pytest.fixture
async def session():
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

    from src.data.db import Base
    from src.data.orm import TargetORM  # noqa: F401 — register the table

    # Fresh temp file: create_all does not alter pre-existing dev schemas.
    url = "sqlite+aiosqlite:///" + tempfile.mktemp(suffix="_targets_test.db")
    engine = create_async_engine(url, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as s:
        yield s

    await engine.dispose()


def _payload(name: str = "Support bot", **kwargs) -> TargetCreate:
    defaults = {
        "kind": "agent",
        "version": "v1",
        "provider": "openai",
        "model": "gpt-4o-mini",
    }
    defaults.update(kwargs)
    return TargetCreate(name=name, **defaults)


@pytest.mark.asyncio
async def test_create_and_get_target(session):
    from src.data import target_store

    created = await target_store.create_target(session, _payload(), tenant_id="acme")

    assert created.name == "Support bot"
    assert created.tenant_id == "acme"
    # Targets are unauthorized until an operator explicitly clears them.
    assert created.authorized is False
    assert created.surface is None

    fetched = await target_store.get_target(session, created.id, tenant_id="acme")
    assert fetched is not None
    assert fetched.id == created.id


@pytest.mark.asyncio
async def test_targets_are_tenant_scoped(session):
    from src.data import target_store

    mine = await target_store.create_target(session, _payload("Acme bot"), tenant_id="acme")

    # A different tenant can neither list nor fetch nor delete it.
    assert await target_store.list_targets(session, tenant_id="globex") == []
    assert await target_store.get_target(session, mine.id, tenant_id="globex") is None
    assert await target_store.delete_target(session, mine.id, tenant_id="globex") is False

    assert len(await target_store.list_targets(session, tenant_id="acme")) == 1


@pytest.mark.asyncio
async def test_same_name_allowed_across_tenants(session):
    from src.data import target_store

    await target_store.create_target(session, _payload("Shared name"), tenant_id="acme")

    assert await target_store.name_exists(session, "Shared name", tenant_id="acme") is True
    assert await target_store.name_exists(session, "Shared name", tenant_id="globex") is False

    # Uniqueness is per tenant, so this must not raise.
    other = await target_store.create_target(
        session, _payload("Shared name"), tenant_id="globex"
    )
    assert other.tenant_id == "globex"


@pytest.mark.asyncio
async def test_changing_target_config_invalidates_surface(session):
    from src.core.models.targets import Capability, TargetSurface
    from src.data import target_store

    target = await target_store.create_target(session, _payload(), tenant_id="acme")
    await target_store.save_surface(
        session,
        target.id,
        TargetSurface(
            reachable=True,
            probes_run=6,
            capabilities=[Capability(id="tools", present=True, confidence=0.9)],
        ),
        tenant_id="acme",
    )

    stored = await target_store.get_target(session, target.id, tenant_id="acme")
    assert stored is not None and stored.surface is not None
    assert stored.discovered_at is not None

    # Swapping the model means the old surface no longer describes this target.
    updated = await target_store.update_target(
        session, target.id, TargetUpdate(model="gpt-4o"), tenant_id="acme"
    )
    assert updated is not None
    assert updated.surface is None
    assert updated.discovered_at is None


@pytest.mark.asyncio
async def test_renaming_keeps_surface(session):
    from src.core.models.targets import TargetSurface
    from src.data import target_store

    target = await target_store.create_target(session, _payload(), tenant_id="acme")
    await target_store.save_surface(
        session, target.id, TargetSurface(reachable=True, probes_run=6), tenant_id="acme"
    )

    # A label change does not change what the system is.
    updated = await target_store.update_target(
        session, target.id, TargetUpdate(name="Renamed"), tenant_id="acme"
    )
    assert updated is not None
    assert updated.name == "Renamed"
    assert updated.surface is not None


@pytest.mark.asyncio
async def test_discovery_refuses_unauthorized_target(session):
    from src.data import target_store
    from src.discovery import TargetNotAuthorizedError, discover_target

    target = await target_store.create_target(session, _payload(), tenant_id="acme")
    assert target.authorized is False

    with pytest.raises(TargetNotAuthorizedError):
        await discover_target(target)


@pytest.mark.asyncio
async def test_unreachable_target_reports_unknown_not_empty(session, monkeypatch):
    """An unreachable target has an *unknown* surface, never a clean bill of health."""
    from src.data import target_store
    from src.discovery import discover_target

    target = await target_store.create_target(
        session, _payload(authorized=True), tenant_id="acme"
    )

    def _boom(_config):
        raise RuntimeError("no credentials configured")

    monkeypatch.setattr("src.agents.target_agent.TargetAgent", _boom)

    surface = await discover_target(target)
    assert surface.reachable is False
    assert "no credentials" in (surface.unreachable_reason or "")
    assert surface.capabilities == []
    assert surface.surface == []
