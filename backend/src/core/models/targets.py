"""Pydantic v2 models for the target registry and discovered attack surface."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

TargetKind = Literal[
    "llm",
    "chatbot",
    "rag",
    "agent",
    "multi_agent",
    "mcp_agent",
    "api_app",
    "workflow",
]

# Capabilities discovery looks for. Each one that is present widens the attack
# surface, so the surface report is derived from this set.
CapabilityId = Literal[
    "tools",
    "memory",
    "rag",
    "mcp",
    "external_api",
    "system_prompt_disclosure",
    "input_guardrail",
    "output_guardrail",
]


class Capability(BaseModel):
    """One discovered capability, with the evidence that led to the call."""

    id: CapabilityId
    present: bool
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    # Verbatim excerpt from the probe response that supports `present`.
    evidence: str = ""


class SurfaceItem(BaseModel):
    """An attack-surface entry implied by the discovered capabilities."""

    # ARTSA attack taxonomy id, e.g. "AI-01".
    taxonomy_id: str
    title: str
    rationale: str
    # Capability ids that opened this surface.
    from_capabilities: list[str] = Field(default_factory=list)


class TargetSurface(BaseModel):
    """Result of a discovery run against one target.

    ``reachable`` is false when the target could not be probed at all (no
    credentials, network failure). In that case capabilities stay empty rather
    than being guessed — an unreachable target has an *unknown* surface, not an
    empty one.
    """

    reachable: bool = False
    unreachable_reason: str | None = None
    probes_run: int = 0
    # Model identity as self-reported by the target, when it discloses one.
    reported_model: str | None = None
    capabilities: list[Capability] = Field(default_factory=list)
    surface: list[SurfaceItem] = Field(default_factory=list)
    trust_boundaries: list[str] = Field(default_factory=list)
    discovered_at: datetime | None = None


class TargetCreate(BaseModel):
    """Request body for registering a target."""

    name: str = Field(min_length=1, max_length=255)
    kind: TargetKind = "llm"
    version: str = Field(default="v1", max_length=64)
    description: str | None = Field(default=None, max_length=1024)
    provider: str = Field(default="", max_length=64)
    model: str = Field(default="", max_length=128)
    base_url: str | None = Field(default=None, max_length=1024)
    system_prompt: str | None = None
    authorized: bool = False
    tags: list[str] = Field(default_factory=list)
    config: dict[str, Any] = Field(default_factory=dict)


class TargetUpdate(BaseModel):
    """Partial update. Omitted fields are left untouched."""

    name: str | None = Field(default=None, min_length=1, max_length=255)
    kind: TargetKind | None = None
    version: str | None = Field(default=None, max_length=64)
    description: str | None = Field(default=None, max_length=1024)
    provider: str | None = Field(default=None, max_length=64)
    model: str | None = Field(default=None, max_length=128)
    base_url: str | None = Field(default=None, max_length=1024)
    system_prompt: str | None = None
    authorized: bool | None = None
    tags: list[str] | None = None
    config: dict[str, Any] | None = None


class Target(BaseModel):
    """A registered AI system under test."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    tenant_id: str
    name: str
    kind: str = "llm"
    version: str = "v1"
    description: str | None = None
    provider: str = ""
    model: str = ""
    base_url: str | None = None
    system_prompt: str | None = None
    authorized: bool = False
    tags: list[str] = Field(default_factory=list)
    config: dict[str, Any] = Field(default_factory=dict)
    surface: TargetSurface | None = None
    discovered_at: datetime | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None
