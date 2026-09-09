"""Tenant-scoped operator approval queue."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.dependencies import get_current_tenant, get_db, get_redis, get_session_tracker
from src.data.orm import ApprovalRequestORM
from src.data.repositories.sessions import SessionRepository
from src.services.approval_service import approval_view, as_utc, expire_request, get_request, issue_retry_token
import uuid

router = APIRouter(tags=["Approvals"])


class DecisionBody(BaseModel):
    decision: Literal["APPROVE", "DENY"]


@router.get("/approvals")
async def list_approvals(
    db: AsyncSession = Depends(get_db), tracker=Depends(get_session_tracker), tenant_id: str = Depends(get_current_tenant),
):
    rows = (await db.execute(select(ApprovalRequestORM).where(
        ApprovalRequestORM.tenant_id == tenant_id
    ).order_by(ApprovalRequestORM.created_at.desc()))).scalars().all()
    repo = SessionRepository(db)
    changed = False
    for row in rows:
        if await expire_request(db, row):
            tracker.apply_action(uuid.UUID(row.session_id), "QUARANTINE")
            await repo.apply_action(uuid.UUID(row.session_id), "QUARANTINE", commit=False)
            changed = True
    if changed:
        await db.commit()
    return [approval_view(row) for row in rows]


@router.get("/approvals/{approval_id}")
async def get_approval(approval_id: str, db: AsyncSession = Depends(get_db), tenant_id: str = Depends(get_current_tenant)):
    row = await get_request(db, approval_id, tenant_id)
    if not row:
        raise HTTPException(404, "Approval request not found")
    if await expire_request(db, row):
        tracker = get_session_tracker()
        tracker.apply_action(uuid.UUID(row.session_id), "QUARANTINE")
        await SessionRepository(db).apply_action(uuid.UUID(row.session_id), "QUARANTINE", commit=False)
        await db.commit()
    return approval_view(row)


@router.post("/approvals/{approval_id}/decision")
async def decide_approval(
    approval_id: str, payload: DecisionBody, db: AsyncSession = Depends(get_db), redis=Depends(get_redis),
    tracker=Depends(get_session_tracker), tenant_id: str = Depends(get_current_tenant),
):
    row = await get_request(db, approval_id, tenant_id)
    if not row:
        raise HTTPException(404, "Approval request not found")
    now = datetime.now(UTC)
    if row.status != "PENDING":
        raise HTTPException(409, f"Approval request is {row.status}")
    repo = SessionRepository(db)
    if as_utc(row.expires_at) <= now:
        row.status, row.decision_at, row.approver = "EXPIRED", now, tenant_id
        tracker.apply_action(uuid.UUID(row.session_id), "QUARANTINE")
        await repo.apply_action(uuid.UUID(row.session_id), "QUARANTINE", commit=False)
        await db.commit()
        return {**approval_view(row), "retry_token": None}
    row.approver, row.decision_at = tenant_id, now
    if payload.decision == "DENY":
        row.status = "DENIED"
        tracker.apply_action(uuid.UUID(row.session_id), "QUARANTINE")
        await repo.apply_action(uuid.UUID(row.session_id), "QUARANTINE", commit=False)
        await db.commit()
        return {**approval_view(row), "retry_token": None}
    row.status = "APPROVED"
    token = issue_retry_token(redis, row)
    tracker.apply_action(uuid.UUID(row.session_id), "RELEASE")
    await repo.apply_action(uuid.UUID(row.session_id), "RELEASE", commit=False)
    await db.commit()
    return {**approval_view(row), "retry_token": token}
