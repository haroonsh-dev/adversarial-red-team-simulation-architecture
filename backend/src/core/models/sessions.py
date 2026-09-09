"""Pydantic v2 Session Models."""

import uuid
from datetime import UTC, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class Session(BaseModel):
    """Model representing an active or completed AI agent execution session."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID = Field(default_factory=uuid.uuid4)
    agent_id: str
    tenant_id: str = "default_tenant"
    status: Literal["ACTIVE", "CLOSED", "BREACHED", "QUARANTINED", "PENDING_APPROVAL"] = "ACTIVE"
    started_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    ended_at: datetime | None = None
    tool_call_count: int = 0
    max_risk_score: float = 0.0
    containment_breaches: int = 0
    circuit_breaker_open: bool = False
