"""Persistence for the target registry.

Every query is tenant-scoped: a target is only ever visible to, and mutable
by, the tenant that registered it.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.models.targets import Target, TargetCreate, TargetSurface, TargetUpdate
from src.data.orm import TargetORM


def _to_model(row: TargetORM) -> Target:
    surface = TargetSurface.model_validate(row.surface) if row.surface else None
    return Target(
        id=row.id,
        tenant_id=row.tenant_id,
        name=row.name,
        kind=row.kind,
        version=row.version,
        description=row.description,
        provider=row.provider,
        model=row.model,
        base_url=row.base_url,
        system_prompt=row.system_prompt,
        authorized=row.authorized,
        tags=list(row.tags or []),
        config=dict(row.config or {}),
        surface=surface,
        discovered_at=row.discovered_at,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


async def list_targets(session: AsyncSession, *, tenant_id: str) -> list[Target]:
    stmt = (
        select(TargetORM)
        .where(TargetORM.tenant_id == tenant_id)
        .order_by(TargetORM.created_at.desc())
    )
    rows = (await session.execute(stmt)).scalars().all()
    return [_to_model(r) for r in rows]


async def get_target(session: AsyncSession, target_id: str, *, tenant_id: str) -> Target | None:
    row = await _get_row(session, target_id, tenant_id=tenant_id)
    return _to_model(row) if row is not None else None


async def _get_row(
    session: AsyncSession, target_id: str, *, tenant_id: str
) -> TargetORM | None:
    stmt = select(TargetORM).where(
        TargetORM.id == target_id, TargetORM.tenant_id == tenant_id
    )
    return (await session.execute(stmt)).scalar_one_or_none()


async def name_exists(
    session: AsyncSession, name: str, *, tenant_id: str, exclude_id: str | None = None
) -> bool:
    stmt = select(TargetORM.id).where(
        TargetORM.tenant_id == tenant_id, TargetORM.name == name
    )
    if exclude_id:
        stmt = stmt.where(TargetORM.id != exclude_id)
    return (await session.execute(stmt)).first() is not None


async def create_target(
    session: AsyncSession, payload: TargetCreate, *, tenant_id: str
) -> Target:
    row = TargetORM(
        id=str(uuid.uuid4()),
        tenant_id=tenant_id,
        name=payload.name.strip(),
        kind=payload.kind,
        version=payload.version.strip() or "v1",
        description=payload.description,
        provider=payload.provider,
        model=payload.model,
        base_url=payload.base_url,
        system_prompt=payload.system_prompt,
        authorized=payload.authorized,
        tags=list(payload.tags),
        config=dict(payload.config),
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )
    session.add(row)
    await session.commit()
    await session.refresh(row)
    return _to_model(row)


async def update_target(
    session: AsyncSession, target_id: str, payload: TargetUpdate, *, tenant_id: str
) -> Target | None:
    row = await _get_row(session, target_id, tenant_id=tenant_id)
    if row is None:
        return None

    fields = payload.model_dump(exclude_unset=True)
    for key, value in fields.items():
        if key == "name" and isinstance(value, str):
            value = value.strip()
        setattr(row, key, value)

    # Changing what the target *is* invalidates the discovered surface.
    if {"provider", "model", "base_url", "system_prompt", "kind", "version"} & fields.keys():
        row.surface = None
        row.discovered_at = None

    await session.commit()
    await session.refresh(row)
    return _to_model(row)


async def delete_target(session: AsyncSession, target_id: str, *, tenant_id: str) -> bool:
    row = await _get_row(session, target_id, tenant_id=tenant_id)
    if row is None:
        return False
    await session.delete(row)
    await session.commit()
    return True


async def save_surface(
    session: AsyncSession, target_id: str, surface: TargetSurface, *, tenant_id: str
) -> Target | None:
    row = await _get_row(session, target_id, tenant_id=tenant_id)
    if row is None:
        return None
    row.surface = surface.model_dump(mode="json")
    row.discovered_at = surface.discovered_at or datetime.now(UTC)
    await session.commit()
    await session.refresh(row)
    return _to_model(row)
