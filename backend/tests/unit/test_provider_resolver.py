"""Tenant-scoped provider resolution must never create a shared key cache."""

from __future__ import annotations

from sqlalchemy import create_engine

from src.core.config import settings
from src.data.db import Base
from src.data.orm import ProviderORM
from src.models import TargetConfig
from src.services.provider_resolver import ProviderConfigurationError, provider_resolver
from src.utils.crypto import encrypt_secret


def test_resolver_is_tenant_scoped_and_uses_provider_default(monkeypatch, tmp_path):
    database = tmp_path / "providers.sqlite"
    monkeypatch.setattr(settings, "SYNC_DATABASE_URL", f"sqlite:///{database}")
    monkeypatch.setattr(settings, "ARTSA_ALLOW_ENV_PROVIDER_FALLBACK", False)
    engine = create_engine(settings.SYNC_DATABASE_URL)
    Base.metadata.create_all(engine)
    secret_a, secret_b = "key-for-tenant-a", "key-for-tenant-b"
    with engine.begin() as connection:
        connection.execute(ProviderORM.__table__.insert(), [
            {"id": "provider-a", "tenant_id": "tenant-a", "name": "shared", "provider_type": "groq", "api_key": encrypt_secret(secret_a, settings.SECRET_KEY), "default_model": "a-model", "enabled": True},
            {"id": "provider-b", "tenant_id": "tenant-b", "name": "shared", "provider_type": "groq", "api_key": encrypt_secret(secret_b, settings.SECRET_KEY), "default_model": "b-model", "enabled": True},
        ])
    try:
        first = provider_resolver.resolve_sync(tenant_id="tenant-a", provider="shared")
        second = provider_resolver.resolve_sync(tenant_id="tenant-b", provider="shared")
        assert (first.provider_id, first.model, first.api_key) == ("provider-a", "a-model", secret_a)
        assert (second.provider_id, second.model, second.api_key) == ("provider-b", "b-model", secret_b)
        assert secret_a not in repr(TargetConfig(provider="groq", provider_ref=first.provider_id, tenant_id="tenant-a"))
    finally:
        engine.dispose()


def test_resolver_rejects_ambiguous_and_missing_tenant(monkeypatch, tmp_path):
    database = tmp_path / "providers.sqlite"
    monkeypatch.setattr(settings, "SYNC_DATABASE_URL", f"sqlite:///{database}")
    monkeypatch.setattr(settings, "ARTSA_ALLOW_ENV_PROVIDER_FALLBACK", False)
    engine = create_engine(settings.SYNC_DATABASE_URL)
    Base.metadata.create_all(engine)
    try:
        for tenant, name in (("tenant-a", "one"), ("tenant-a", "two")):
            with engine.begin() as connection:
                connection.execute(ProviderORM.__table__.insert(), {"id": f"{tenant}-{name}", "tenant_id": tenant, "name": name, "provider_type": "groq", "api_key": encrypt_secret("test-key", settings.SECRET_KEY), "enabled": True})
        try:
            provider_resolver.resolve_sync(tenant_id="tenant-a", provider="groq")
        except ProviderConfigurationError as exc:
            assert exc.code == "provider_ambiguous"
        else:
            raise AssertionError("ambiguous provider type must fail")
        try:
            provider_resolver.resolve_sync(tenant_id="", provider="groq")
        except ProviderConfigurationError as exc:
            assert exc.code == "tenant_context_required"
        else:
            raise AssertionError("missing tenant must fail")
    finally:
        engine.dispose()
