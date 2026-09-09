"""Provider management API — add any LLM API key / base URL / model at runtime.

Endpoints (mounted under ``/v1`` and ``/api/v1``):

- ``GET    /providers/catalog``  — every API ARTSA supports out of the box
- ``GET    /providers``          — user-registered providers (keys masked)
- ``POST   /providers``          — add or update a provider (upsert by name)
- ``PATCH  /providers/{name}``   — partially update a provider (no key required)
- ``DELETE /providers/{name}``   — remove a provider
- ``POST   /providers/{name}/test`` — send a tiny request to verify the key

Registered providers are used by the containment proxy: send
``X-ARTSA-Provider: <name>`` with any ``model`` in the chat payload.
"""

from __future__ import annotations

import logging
from typing import Any

import httpx
from fastapi import APIRouter, Body, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.dependencies import get_provider_tenant
from src.data.db import get_async_session
from src.data.provider_store import delete_provider, get_provider, list_providers, upsert_provider
from src.gateway.provider_catalog import PROVIDER_CATALOG
from src.services.provider_resolver import ProviderConfigurationError, provider_resolver

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Providers"])


class ProviderPayload(BaseModel):
    name: str = Field(..., min_length=1, max_length=64, description="Slug used as X-ARTSA-Provider")
    api_key: str = Field(..., min_length=1, description="Provider API key (encrypted at rest)")
    provider_type: str = Field(default="custom", description="Catalog type, e.g. openai | deepseek | custom")
    base_url: str | None = Field(default=None, description="Custom OpenAI-compatible base URL")
    default_model: str | None = Field(default=None, description="Model used when the client omits one")
    enabled: bool = Field(default=True)


class ProviderPatch(BaseModel):
    """Partial update — any field may be omitted; the API key stays intact."""

    api_key: str | None = Field(default=None, min_length=1, description="Rotate the API key")
    provider_type: str | None = Field(default=None, description="Catalog type, e.g. openai | deepseek | custom")
    base_url: str | None = Field(default=None, description="Custom OpenAI-compatible base URL")
    default_model: str | None = Field(default=None, description="Model used when the client omits one")
    enabled: bool | None = Field(default=None)


@router.get("/providers/catalog")
async def providers_catalog() -> dict[str, Any]:
    """List every supported LLM API (all options), with key status."""
    statuses: dict[str, bool] = {}
    from src.core.config import settings

    for name, meta in PROVIDER_CATALOG.items():
        env_key = meta.get("env_key") or ""
        statuses[name] = bool(env_key and settings.is_key_configured(env_key))
    return {
        "catalog": PROVIDER_CATALOG,
        "env_key_configured": statuses,
        "note": "Any OpenAI-compatible endpoint can be registered with a custom base_url.",
    }


@router.get("/providers")
async def providers_list(
    session: AsyncSession = Depends(get_async_session), tenant_id: str = Depends(get_provider_tenant)
) -> dict[str, Any]:
    """List user-registered providers. API keys are never returned (masked)."""
    rows = await list_providers(session, tenant_id=tenant_id)
    return {"providers": rows, "count": len(rows)}


@router.post("/providers", status_code=201)
async def providers_upsert(
    payload: ProviderPayload,
    session: AsyncSession = Depends(get_async_session),
    tenant_id: str = Depends(get_provider_tenant),
) -> dict[str, Any]:
    """Add a new provider (or update an existing one by name)."""
    try:
        row = await upsert_provider(
            session,
            tenant_id=tenant_id,
            name=payload.name,
            api_key=payload.api_key,
            provider_type=payload.provider_type,
            base_url=payload.base_url,
            default_model=payload.default_model,
            enabled=payload.enabled,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return {"status": "ok", "provider": row}


@router.patch("/providers/{name}")
async def providers_patch(
    name: str,
    payload: ProviderPatch,
    session: AsyncSession = Depends(get_async_session),
    tenant_id: str = Depends(get_provider_tenant),
) -> dict[str, Any]:
    """Partially update a registered provider (404 if it does not exist).

    Unlike ``POST /providers`` (a full upsert), PATCH only touches the fields
    sent, so callers can e.g. point a provider at a new base URL without
    re-supplying (or overwriting) the stored API key.
    """
    existing = await get_provider(session, name.strip().lower(), tenant_id=tenant_id)
    if existing is None:
        raise HTTPException(status_code=404, detail=f"provider '{name}' not found")

    row = await upsert_provider(
        session,
        tenant_id=tenant_id,
        name=existing["name"],
        api_key=payload.api_key if payload.api_key is not None else existing.get("api_key") or "",
        provider_type=payload.provider_type or existing.get("provider_type") or "custom",
        base_url=payload.base_url if payload.base_url is not None else existing.get("base_url"),
        default_model=(
            payload.default_model if payload.default_model is not None else existing.get("default_model")
        ),
        enabled=payload.enabled if payload.enabled is not None else existing.get("enabled", True),
    )
    return {"status": "ok", "provider": row}


@router.delete("/providers/{name}")
async def providers_delete(
    name: str,
    session: AsyncSession = Depends(get_async_session),
    tenant_id: str = Depends(get_provider_tenant),
) -> dict[str, Any]:
    """Remove a registered provider."""
    removed = await delete_provider(session, name.strip().lower(), tenant_id=tenant_id)
    if not removed:
        raise HTTPException(status_code=404, detail=f"provider '{name}' not found")
    return {"status": "ok", "deleted": name.strip().lower()}


@router.post("/providers/{name}/test")
async def providers_test(
    name: str,
    payload: dict[str, Any] = Body(default={}),
    session: AsyncSession = Depends(get_async_session),
    tenant_id: str = Depends(get_provider_tenant),
) -> dict[str, Any]:
    """Send a tiny chat completion to verify the stored key / endpoint works."""
    stored = await get_provider(session, name.strip().lower(), tenant_id=tenant_id)
    if stored is None:
        raise HTTPException(status_code=404, detail=f"provider '{name}' not found")

    try:
        resolved = await provider_resolver.resolve_async(
            session, tenant_id=tenant_id, provider=stored["name"], model=payload.get("model")
        )
    except ProviderConfigurationError as exc:
        raise HTTPException(status_code=422, detail=exc.code) from exc
    api_key = resolved.api_key or ""
    base_url = resolved.base_url
    if not base_url:
        base_url = PROVIDER_CATALOG.get(stored["provider_type"], {}).get("base_url")
    if not base_url:
        raise HTTPException(status_code=422, detail="provider has no base_url (set one or use a known type)")

    model = resolved.model
    prompt = payload.get("prompt") or "Reply with the single word: ok"

    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json",
    }
    if stored["provider_type"] == "anthropic":
        headers["x-api-key"] = api_key
        headers["anthropic-version"] = "2023-06-01"
    else:
        headers["Authorization"] = f"Bearer {api_key}"

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            if stored["provider_type"] == "anthropic":
                body = {
                    "model": model,
                    "max_tokens": 16,
                    "messages": [{"role": "user", "content": prompt}],
                }
                response = await client.post(f"{base_url}/messages", json=body, headers=headers)
            else:
                body = {
                    "model": model,
                    "max_tokens": 16,
                    "messages": [{"role": "user", "content": prompt}],
                }
                response = await client.post(f"{base_url}/chat/completions", json=body, headers=headers)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"upstream unreachable: {exc}") from exc

    if response.status_code != 200:
        raise HTTPException(status_code=502, detail=f"upstream error {response.status_code}: {response.text[:300]}")

    try:
        data = response.json()
        if stored["provider_type"] == "anthropic":
            reply = (data.get("content") or [{}])[0].get("text", "")
        else:
            reply = (data.get("choices") or [{}])[0].get("message", {}).get("content", "")
    except Exception:
        reply = response.text[:200]
    return {"status": "ok", "provider": stored["name"], "model": model, "reply": reply}
