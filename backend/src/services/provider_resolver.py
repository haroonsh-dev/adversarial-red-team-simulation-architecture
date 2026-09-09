"""Tenant-scoped, transient provider credential resolution.

This module is the only place that decrypts a provider record for runtime
use.  It deliberately has no plaintext cache: rotation, disablement and
deletion take effect on the next resolution.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from typing import Literal

from sqlalchemy import create_engine, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session

from src.core.config import settings
from src.data.orm import ProviderORM
from src.gateway.provider_catalog import catalog_base_url, catalog_default_model
from src.utils.crypto import decrypt_secret

logger = logging.getLogger(__name__)


class ProviderConfigurationError(RuntimeError):
    """Safe provider resolution error.  It never includes credentials."""

    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


@dataclass(frozen=True)
class ResolvedProvider:
    tenant_id: str
    provider_id: str | None
    provider_name: str
    provider_type: str
    api_key: str | None
    base_url: str | None
    model: str
    source: Literal["explicit", "database", "environment", "test"]


def _clean(value: str | None) -> str | None:
    return value.strip().lower() if value and value.strip() else None


def _resolve_rows(
    rows: list[ProviderORM], *, tenant_id: str, provider: str | None, api_key: str | None,
    model: str | None, base_url: str | None, provider_ref: str | None = None,
) -> ResolvedProvider:
    requested = _clean(provider)
    if requested in {"deterministic", "fake", "test"}:
        return ResolvedProvider(tenant_id, None, requested, requested, None, base_url, model or "echo", "test")

    exact = next((row for row in rows if provider_ref and row.id == provider_ref), None)
    exact = exact or next((row for row in rows if requested and row.name == requested), None)
    by_type = [row for row in rows if requested and row.provider_type == requested]
    selected = exact
    if selected is None and len(by_type) == 1:
        selected = by_type[0]
    elif selected is None and len(by_type) > 1:
        raise ProviderConfigurationError("provider_ambiguous")

    # An explicit key selects the caller's declared provider type/name but is
    # never written to a config object or storage.  A tenant record may still
    # supply its non-secret defaults.
    if api_key:
        provider_type = (selected.provider_type if selected else requested) or "openai"
        return ResolvedProvider(
            tenant_id, selected.id if selected else None, selected.name if selected else provider_type,
            provider_type, api_key, base_url or (selected.base_url if selected else None),
            model or (selected.default_model if selected else None) or catalog_default_model(provider_type) or "default",
            "explicit",
        )

    if selected is not None:
        if (
            settings.ENVIRONMENT == "production"
            and settings.ARTSA_PROVIDER_TENANT_ISOLATION_ENABLED
            and selected.tenant_id == "default_org"
        ):
            # default_org is migration quarantine, never a shared production
            # credential pool.
            raise ProviderConfigurationError("provider_not_configured")
        if not selected.enabled:
            raise ProviderConfigurationError("provider_disabled")
        try:
            key = decrypt_secret(selected.api_key, settings.SECRET_KEY)
        except Exception as exc:
            logger.warning("provider_resolution_unavailable tenant=%s provider_id=%s", tenant_id, selected.id)
            raise ProviderConfigurationError("provider_resolution_unavailable") from exc
        if not key:
            raise ProviderConfigurationError("provider_not_configured")
        return ResolvedProvider(
            tenant_id, selected.id, selected.name, selected.provider_type, key,
            base_url or selected.base_url or catalog_base_url(selected.provider_type),
            model or selected.default_model or catalog_default_model(selected.provider_type) or "default", "database",
        )

    if settings.ARTSA_ALLOW_ENV_PROVIDER_FALLBACK:
        provider_type = requested or "openai"
        key = settings.provider_key(provider_type)
        if key:
            return ResolvedProvider(
                tenant_id, None, provider_type, provider_type, key,
                base_url or catalog_base_url(provider_type),
                model or catalog_default_model(provider_type) or "default", "environment",
            )
    raise ProviderConfigurationError("provider_not_configured")


class ProviderResolver:
    async def resolve_async(
        self, session: AsyncSession, *, tenant_id: str, provider: str | None,
        model: str | None = None, base_url: str | None = None, api_key: str | None = None,
        provider_ref: str | None = None,
    ) -> ResolvedProvider:
        if not tenant_id:
            raise ProviderConfigurationError("tenant_context_required")
        started = time.monotonic()
        rows = list((await session.execute(
            select(ProviderORM).where(ProviderORM.tenant_id == tenant_id)
        )).scalars())
        resolved = _resolve_rows(rows, tenant_id=tenant_id, provider=provider, api_key=api_key, model=model, base_url=base_url, provider_ref=provider_ref)
        logger.info("provider_resolved tenant=%s provider_id=%s source=%s duration_ms=%d", tenant_id, resolved.provider_id, resolved.source, (time.monotonic() - started) * 1000)
        return resolved

    def resolve_sync(
        self, *, tenant_id: str, provider: str | None, model: str | None = None,
        base_url: str | None = None, api_key: str | None = None, provider_ref: str | None = None,
    ) -> ResolvedProvider:
        if not tenant_id:
            raise ProviderConfigurationError("tenant_context_required")
        # Test providers do not require a database connection.
        if _clean(provider) in {"deterministic", "fake", "test"}:
            return _resolve_rows([], tenant_id=tenant_id, provider=provider, api_key=api_key, model=model, base_url=base_url, provider_ref=provider_ref)
        engine = create_engine(settings.SYNC_DATABASE_URL)
        try:
            with Session(engine) as session:
                rows = list(session.scalars(select(ProviderORM).where(ProviderORM.tenant_id == tenant_id)))
                return _resolve_rows(rows, tenant_id=tenant_id, provider=provider, api_key=api_key, model=model, base_url=base_url, provider_ref=provider_ref)
        except ProviderConfigurationError:
            raise
        except Exception as exc:
            logger.warning("provider_resolution_unavailable tenant=%s", tenant_id)
            raise ProviderConfigurationError("provider_resolution_unavailable") from exc
        finally:
            engine.dispose()


provider_resolver = ProviderResolver()
