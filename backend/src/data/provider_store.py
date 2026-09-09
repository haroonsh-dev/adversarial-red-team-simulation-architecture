"""DB-backed store for user-registered LLM providers.

API keys are encrypted at rest with the platform SECRET_KEY. The proxy and
campaign engines read provider credentials through
:mod:`src.services.provider_registry`, which caches the store contents in
memory; this module only handles persistence.
"""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.config import settings
from src.data.orm import ProviderORM
from src.utils.crypto import decrypt_secret, encrypt_secret


def _mask(key: str) -> str:
    """Return a masked key for API responses (never the real value)."""
    if not key:
        return ""
    if len(key) <= 8:
        return "****"
    return f"{key[:4]}...{key[-4:]}"


def _row_to_dict(row: ProviderORM, include_key: bool = False) -> dict[str, Any]:
    data = {
        "id": row.id,
        "tenant_id": row.tenant_id,
        "name": row.name,
        "provider_type": row.provider_type,
        "base_url": row.base_url,
        "default_model": row.default_model,
        "enabled": row.enabled,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }
    try:
        decrypted = decrypt_secret(row.api_key, settings.SECRET_KEY)
    except Exception:
        decrypted = ""
    data["api_key_masked"] = _mask(decrypted)
    if include_key:
        data["api_key"] = decrypted
    return data


async def list_providers(
    session: AsyncSession, *, tenant_id: str, include_key: bool = False
) -> list[dict[str, Any]]:
    rows = (await session.execute(
        select(ProviderORM).where(ProviderORM.tenant_id == tenant_id).order_by(ProviderORM.name)
    )).scalars().all()
    return [_row_to_dict(r, include_key=include_key) for r in rows]


async def get_provider(session: AsyncSession, name: str, *, tenant_id: str) -> dict[str, Any] | None:
    row = (
        await session.execute(select(ProviderORM).where(
            ProviderORM.tenant_id == tenant_id, ProviderORM.name == name
        ))
    ).scalar_one_or_none()
    return _row_to_dict(row, include_key=True) if row else None


async def upsert_provider(
    session: AsyncSession,
    *,
    tenant_id: str,
    name: str,
    api_key: str,
    provider_type: str = "custom",
    base_url: str | None = None,
    default_model: str | None = None,
    enabled: bool = True,
) -> dict[str, Any]:
    """Create or update a provider record. Returns the stored (masked) dict."""
    name = name.strip().lower().replace(" ", "-")
    if not name:
        raise ValueError("provider name is required")

    row = (
        await session.execute(select(ProviderORM).where(
            ProviderORM.tenant_id == tenant_id, ProviderORM.name == name
        ))
    ).scalar_one_or_none()
    encrypted = encrypt_secret(api_key, settings.SECRET_KEY)

    if row is None:
        row = ProviderORM(
            id=str(uuid.uuid4()),
            tenant_id=tenant_id,
            name=name,
            provider_type=provider_type.strip().lower() or "custom",
            api_key=encrypted,
            base_url=(base_url or "").strip() or None,
            default_model=(default_model or "").strip() or None,
            enabled=enabled,
        )
        session.add(row)
    else:
        row.api_key = encrypted
        row.provider_type = provider_type.strip().lower() or "custom"
        row.base_url = (base_url or "").strip() or None
        row.default_model = (default_model or "").strip() or None
        row.enabled = enabled

    await session.commit()
    await session.refresh(row)
    return _row_to_dict(row)


async def delete_provider(session: AsyncSession, name: str, *, tenant_id: str) -> bool:
    result = await session.execute(delete(ProviderORM).where(
        ProviderORM.tenant_id == tenant_id, ProviderORM.name == name
    ))
    await session.commit()
    return result.rowcount > 0
