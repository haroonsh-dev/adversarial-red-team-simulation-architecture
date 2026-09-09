"""ARTSA Data Models — Pydantic v2 schemas for the entire system."""

from __future__ import annotations

import enum
import uuid
from datetime import UTC, datetime
from typing import Any

from pydantic import BaseModel, Field

# =============================================================================
# Enums
# =============================================================================


class AttackCategory(str, enum.Enum):
    """Attack taxonomy categories mapped to industry standards."""

    PROMPT_INJECTION = "DPI"  # Direct Prompt Injection
    INDIRECT_INJECTION = "IPI"  # Indirect Prompt Injection (RAG poisoning)
    JAILBREAK = "JBK"  # Jailbreak techniques
    SYSTEM_PROMPT_EXTRACTION = "SPE"  # System prompt leaking
    DATA_EXTRACTION = "DEX"  # Training data / RAG context extraction
    PRIVILEGE_ESCALATION = "PEX"  # Tool/permission abuse
    DENIAL_OF_SERVICE = "DOS"  # Resource exhaustion
    OUTPUT_MANIPULATION = "OPM"  # Forcing harmful/biased output
    SOCIAL_ENGINEERING = "MSE"  # Multi-turn social engineering
    TOOL_ABUSE = "TPA"  # Tool/plugin exploitation


class Severity(str, enum.Enum):
    """Attack severity levels."""

    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


class Verdict(str, enum.Enum):
    """Judge's verdict on an attack outcome."""

    SUCCESS = "SUCCESS"  # Attack fully achieved its objective
    PARTIAL = "PARTIAL"  # Attack partially succeeded
    BLOCKED = "BLOCKED"  # Attack was fully blocked by real defenses
    ERROR = "ERROR"  # Target unreachable / API failure — not a security result


class CampaignState(str, enum.Enum):
    """Campaign lifecycle states (FSM)."""

    INIT = "INIT"
    RUNNING = "RUNNING"
    PAUSED = "PAUSED"
    COMPLETED = "COMPLETED"
    REPORTED = "REPORTED"


class GuardrailLayer(str, enum.Enum):
    """Defense layers in the target's guardrail stack."""

    INPUT_FILTER = "INPUT_FILTER"
    SYSTEM_PROMPT = "SYSTEM_PROMPT"
    RAG_RETRIEVAL = "RAG_RETRIEVAL"
    LLM_GENERATION = "LLM_GENERATION"
    OUTPUT_FILTER = "OUTPUT_FILTER"


# =============================================================================
# Attack Models
# =============================================================================


def _generate_id() -> str:
    return str(uuid.uuid4())


class AttackMetadata(BaseModel):
    """Metadata for an attack template — severity, mappings, and historical stats."""

    severity: Severity = Severity.MEDIUM
    mitre_atlas: str = ""  # e.g., "AML.T0051.000"
    owasp_llm: str = ""  # e.g., "LLM01"
    success_rate: float = Field(default=0.0, ge=0.0, le=1.0)
    tags: list[str] = Field(default_factory=list)
    mutations_available: list[str] = Field(default_factory=list)


class AttackTemplate(BaseModel):
    """A reusable attack template with variable placeholders."""

    id: str = Field(default_factory=_generate_id)
    category: AttackCategory
    name: str
    description: str = ""
    template: str  # Attack prompt with {{variable}} placeholders
    variables: dict[str, str] = Field(default_factory=dict)
    metadata: AttackMetadata = Field(default_factory=AttackMetadata)


class AttackPayload(BaseModel):
    """A fully rendered attack ready to send to the target."""

    id: str = Field(default_factory=_generate_id)
    template_id: str = ""  # Source template reference
    category: AttackCategory
    name: str
    prompt: str  # Fully rendered attack prompt
    objective: str  # What this attack is trying to achieve
    mutations_applied: list[str] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)


# =============================================================================
# Guardrail & Target Response Models
# =============================================================================


class GuardrailResult(BaseModel):
    """Result from a single guardrail layer check."""

    layer: GuardrailLayer
    passed: bool  # True = content passed through (was NOT blocked)
    details: str = ""  # Why it was blocked or passed
    latency_ms: float = 0.0


class TargetResponse(BaseModel):
    """Complete response from the target agent including guardrail trace."""

    response: str  # The actual LLM response text (post-filtering)
    guardrail_trace: list[GuardrailResult] = Field(default_factory=list)
    bypass_depth: int = Field(default=0, ge=0, le=4)  # Layers penetrated
    blocked: bool = False
    blocked_by: str | None = None  # Which layer blocked it
    # Infrastructure failure (billing, auth, network) — NOT a defensive block.
    error: bool = False
    error_detail: str | None = None
    latency_ms: float = 0.0
    token_usage: dict[str, int] = Field(default_factory=dict)
    raw_response: str = ""  # Unfiltered response before output guardrails


# =============================================================================
# Judge Score Model
# =============================================================================


class JudgeScore(BaseModel):
    """Multi-dimensional evaluation score from the Judge agent."""

    verdict: Verdict
    attack_success_score: int = Field(ge=0, le=10)
    severity: Severity
    bypass_depth: int = Field(ge=0, le=4)
    information_leakage_score: int = Field(ge=0, le=10)
    defense_quality_score: int = Field(ge=0, le=10)
    compliance_violations: list[str] = Field(default_factory=list)
    mitre_atlas_mapping: str = ""
    owasp_llm_mapping: str = ""
    reasoning: str = ""  # Step-by-step analysis


# =============================================================================
# Round & Campaign Models
# =============================================================================


class HopLatencyMs(BaseModel):
    """Measured wall-clock latency for agents that actually ran this round.

    Missing / None means the hop was not timed (do not invent a number).
    Research, Curator, and Defender are not fields — they do not execute.
    """

    red_team: float | None = None
    target: float | None = None
    judge: float | None = None


class RoundResult(BaseModel):
    """Complete result of a single attack round."""

    round_number: int
    attack: AttackPayload
    response: TargetResponse
    score: JudgeScore
    timestamp: datetime = Field(default_factory=lambda: datetime.now(UTC))
    duration_ms: float = 0.0
    hop_latency_ms: HopLatencyMs = Field(default_factory=HopLatencyMs)
    hmac_handoffs: list[dict[str, Any]] = Field(default_factory=list)


class GuardrailConfig(BaseModel):
    """Toggle configuration for target guardrail layers."""

    input_content_filter: bool = True
    input_injection_detector: bool = True
    output_toxicity_filter: bool = True
    output_pii_redactor: bool = True


class RAGConfig(BaseModel):
    """Configuration for the target's RAG pipeline."""

    enabled: bool = False
    collection_name: str = "knowledge_base"
    embedding_model: str = "text-embedding-3-small"
    retrieval_k: int = 5


class TargetConfig(BaseModel):
    """Configuration for the target LLM agent."""

    provider: str = "openai"
    # None means "use the resolved provider default".  Provider selection is
    # never inferred from a model string.
    model: str | None = None
    temperature: float = 0.7

    system_prompt: str = ""
    base_url: str | None = None
    target_id: str | None = None
    target_version: str | None = None
    tenant_id: str | None = None
    # Immutable, tenant-bound identifier of an encrypted provider row.  This
    # is safe to serialize; credentials are resolved only at client creation.
    provider_ref: str | None = None
    guardrails: GuardrailConfig = Field(default_factory=GuardrailConfig)
    rag: RAGConfig = Field(default_factory=RAGConfig)


class AttackProfile(BaseModel):
    """Configuration for which attacks to run and how."""

    name: str = "comprehensive"
    categories: list[AttackCategory] = Field(
        default_factory=lambda: [
            AttackCategory.PROMPT_INJECTION,
            AttackCategory.JAILBREAK,
            AttackCategory.SYSTEM_PROMPT_EXTRACTION,
            AttackCategory.DATA_EXTRACTION,
        ]
    )

    category_weights: dict[str, float] = Field(default_factory=dict)
    mutations_enabled: bool = True
    max_mutations_per_attack: int = 3


class CampaignConfig(BaseModel):
    """Full configuration for an attack campaign."""

    id: str = Field(default_factory=_generate_id)
    name: str = "Untitled Campaign"
    target: TargetConfig = Field(default_factory=TargetConfig)
    attack_profile: AttackProfile = Field(default_factory=AttackProfile)
    max_rounds: int = 50
    max_tokens: int = 500_000
    max_cost_usd: float = 10.0
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class CampaignSummary(BaseModel):
    """Aggregated results summary for a completed campaign."""

    campaign_id: str
    name: str = ""
    state: CampaignState = CampaignState.COMPLETED
    total_rounds: int = 0
    completed_rounds: int = 0
    results_by_verdict: dict[str, int] = Field(default_factory=dict)
    results_by_severity: dict[str, int] = Field(default_factory=dict)
    results_by_category: dict[str, dict[str, Any]] = Field(default_factory=dict)
    avg_attack_success: float = 0.0
    avg_defense_quality: float = 0.0
    avg_bypass_depth: float = 0.0
    top_findings: list[RoundResult] = Field(default_factory=list)
    total_duration_ms: float = 0.0
    total_tokens: int = 0
    started_at: datetime | None = None
    completed_at: datetime | None = None
