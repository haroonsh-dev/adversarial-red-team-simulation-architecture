"""Target registry and discovery endpoints.

A target is the stable identity a campaign runs against, so two runs can be
attributed to the same system. Active probing requires the operator to have
marked the target authorized.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.dependencies import get_current_tenant
from src.core.attack_taxonomy import TAXONOMY, attack_categories_for
from src.core.models.targets import (
    Target,
    TargetCreate,
    TargetSurface,
    TargetUpdate,
)
from src.data import target_store
from src.data.db import get_async_session
from src.discovery import TargetNotAuthorizedError, discover_target

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Targets"])


@router.get("/targets", response_model=list[Target])
async def list_targets(
    session: AsyncSession = Depends(get_async_session),
    tenant_id: str = Depends(get_current_tenant),
) -> list[Target]:
    """List targets registered by this tenant."""
    return await target_store.list_targets(session, tenant_id=tenant_id)


@router.post("/targets", response_model=Target, status_code=status.HTTP_201_CREATED)
async def create_target(
    payload: TargetCreate,
    session: AsyncSession = Depends(get_async_session),
    tenant_id: str = Depends(get_current_tenant),
) -> Target:
    """Register a target."""
    if await target_store.name_exists(session, payload.name.strip(), tenant_id=tenant_id):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"A target named '{payload.name}' already exists.",
        )
    return await target_store.create_target(session, payload, tenant_id=tenant_id)


@router.get("/targets/{target_id}", response_model=Target)
async def get_target(
    target_id: str,
    session: AsyncSession = Depends(get_async_session),
    tenant_id: str = Depends(get_current_tenant),
) -> Target:
    target = await target_store.get_target(session, target_id, tenant_id=tenant_id)
    if target is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Target not found")
    return target


@router.patch("/targets/{target_id}", response_model=Target)
async def update_target(
    target_id: str,
    payload: TargetUpdate,
    session: AsyncSession = Depends(get_async_session),
    tenant_id: str = Depends(get_current_tenant),
) -> Target:
    if payload.name is not None and await target_store.name_exists(
        session, payload.name.strip(), tenant_id=tenant_id, exclude_id=target_id
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"A target named '{payload.name}' already exists.",
        )
    target = await target_store.update_target(session, target_id, payload, tenant_id=tenant_id)
    if target is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Target not found")
    return target


@router.delete("/targets/{target_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_target(
    target_id: str,
    session: AsyncSession = Depends(get_async_session),
    tenant_id: str = Depends(get_current_tenant),
) -> None:
    if not await target_store.delete_target(session, target_id, tenant_id=tenant_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Target not found")


@router.post("/targets/{target_id}/discover", response_model=Target)
async def run_discovery(
    target_id: str,
    session: AsyncSession = Depends(get_async_session),
    tenant_id: str = Depends(get_current_tenant),
) -> Target:
    """Probe the target and persist its discovered attack surface."""
    target = await target_store.get_target(session, target_id, tenant_id=tenant_id)
    if target is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Target not found")

    try:
        surface = await discover_target(target)
    except TargetNotAuthorizedError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc

    updated = await target_store.save_surface(session, target_id, surface, tenant_id=tenant_id)
    if updated is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Target not found")
    return updated


@router.get("/targets/{target_id}/surface", response_model=TargetSurface)
async def get_surface(
    target_id: str,
    session: AsyncSession = Depends(get_async_session),
    tenant_id: str = Depends(get_current_tenant),
) -> TargetSurface:
    """The latest discovery snapshot. Empty and unreachable until discovery runs."""
    target = await target_store.get_target(session, target_id, tenant_id=tenant_id)
    if target is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Target not found")
    return target.surface or TargetSurface()


@router.get("/targets/{target_id}/attack-plan")
async def get_attack_plan(
    target_id: str,
    session: AsyncSession = Depends(get_async_session),
    tenant_id: str = Depends(get_current_tenant),
) -> dict[str, object]:
    """Attack categories implied by this target's discovered surface.

    This is what makes discovery actionable: the campaign runs the categories
    the target's own capabilities opened, instead of a fixed profile.
    """
    target = await target_store.get_target(session, target_id, tenant_id=tenant_id)
    if target is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Target not found")

    taxonomy_ids = [item.taxonomy_id for item in (target.surface.surface if target.surface else [])]
    return {
        "target_id": target.id,
        "discovered": target.surface is not None and target.surface.reachable,
        "taxonomy_ids": taxonomy_ids,
        "categories": attack_categories_for(taxonomy_ids),
    }


@router.get("/attack-taxonomy")
async def get_attack_taxonomy() -> dict[str, object]:
    """The ARTSA attack taxonomy (AI-01 … AI-12) with framework mappings."""
    return {
        "taxonomy": [
            {
                "id": entry.id,
                "title": entry.title,
                "description": entry.description,
                "attack_categories": list(entry.attack_categories),
                "owasp_llm": entry.owasp_llm,
                "mitre_atlas": entry.mitre_atlas,
            }
            for entry in TAXONOMY
        ]
    }
