"""ARTSA Core Settings — single source of truth for all environment variables."""

from __future__ import annotations

from pathlib import Path

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Resolve repo root (.env lives here) and backend dir
_BACKEND_DIR = Path(__file__).resolve().parent.parent.parent
_REPO_ROOT = _BACKEND_DIR.parent

_ENV_FILES = (
    str(_REPO_ROOT / ".env"),
    str(_BACKEND_DIR / ".env"),
    str(_REPO_ROOT / ".env.local"),
)


class Settings(BaseSettings):
    """Platform settings loaded from environment / .env files."""

    model_config = SettingsConfigDict(
        env_file=_ENV_FILES,
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @model_validator(mode="after")
    def _reject_insecure_defaults(self) -> Settings:
        """Fail fast on insecure production configuration."""
        if self.ENVIRONMENT != "production":
            return self

        if self.SECRET_KEY == "change-me-in-production" or len(self.SECRET_KEY) < 32:
            raise ValueError(
                "SECRET_KEY must be a strong random value (≥32 chars) in production. "
                'Generate one with: python -c "import secrets; print(secrets.token_urlsafe(64))"'
            )

        has_api_key = any(
            self.is_key_configured(name)
            for name in (
                "ARTSA_API_KEY",
                "ARTSA_ANALYST_API_KEY",
                "ARTSA_REDTEAM_API_KEY",
                "ARTSA_READONLY_API_KEY",
            )
        )
        if not has_api_key and not self.ARTSA_OIDC_ENABLED:
            raise ValueError(
                "Production requires ARTSA_API_KEY (or role keys) or ARTSA_OIDC_ENABLED=true"
            )

        if (self.ARTSA_CORS_ORIGINS or "*").strip() == "*":
            raise ValueError(
                "ARTSA_CORS_ORIGINS must be an explicit allow-list in production (not *)"
            )

        return self

    # ── Core ──────────────────────────────────────────────────────────────
    ENVIRONMENT: str = "development"
    ARTSA_LOG_LEVEL: str = "INFO"
    SECRET_KEY: str = Field(default="change-me-in-production", min_length=16)
    ARTSA_API_KEY: str | None = None
    ARTSA_TENANT_ID: str = "default_org"
    # Standalone SDK execution must opt into a tenant explicitly.  This is
    # deliberately separate from ARTSA_TENANT_ID, whose legacy default is used
    # by parts of the HTTP application.
    ARTSA_SDK_TENANT_ID: str | None = None
    # Environment provider credentials are a local-development escape hatch,
    # never an implicit production credential source.
    ARTSA_ALLOW_ENV_PROVIDER_FALLBACK: bool = False
    # Tenant isolation cannot be enabled in production while the migration's
    # temporary default_org assignment still represents real providers.
    ARTSA_PROVIDER_TENANT_ISOLATION_ENABLED: bool = True
    ARTSA_DATA_DIR: str = "./data"

    # ── Database ────────────────────────────────────────────────────────
    USE_SQLITE: bool = True
    DATABASE_URL: str = "sqlite+aiosqlite:///./data/artsa.db"
    SYNC_DATABASE_URL: str = "sqlite:///./data/artsa.db"
    REDIS_URL: str = "redis://localhost:6379/0"
    USE_CELERY: bool = False
    USE_REDIS_RATE_LIMIT: bool = True
    BENCHMARK_CACHE_TTL_SEC: int = 300
    ARTSA_REQUIRE_AUTH: bool = False
    ARTSA_ANALYST_API_KEY: str | None = None
    ARTSA_REDTEAM_API_KEY: str | None = None
    ARTSA_READONLY_API_KEY: str | None = None
    # Local email/password accounts: first registered user becomes admin, then
    # further registrations require an admin API key. Sessions are HS256 JWTs
    # signed with SECRET_KEY. API keys and OIDC remain supported.
    ARTSA_PASSWORD_AUTH_ENABLED: bool = True
    ARTSA_SESSION_TTL_SEC: int = 8 * 60 * 60  # 8 hours
    # Account store backend: "sqlite" | "mongo" | None (auto). Auto selects
    # mongo when ARTSA_MONGODB_URI is configured (outside testing), else sqlite.
    ARTSA_USER_STORE: str | None = None
    # When true, ingest auto-marks sessions BREACHED/QUARANTINED on KILL/QUARANTINE verdicts
    ARTSA_AUTO_ENFORCE: bool = True
    ARTSA_APPROVAL_TTL_SECONDS: int = 900
    # ASI08 session circuit breaker. Repeated hard containment decisions in a
    # short window indicate a cascading/looping agent and terminate its session.
    ARTSA_CIRCUIT_BREAKER_ENABLED: bool = True
    ARTSA_CIRCUIT_BREAKER_BLOCK_LIMIT: int = 3
    ARTSA_CIRCUIT_BREAKER_WINDOW_SECONDS: int = 60
    # MCP stdio wrapper protocol bounds.  Tool calls/results use the larger
    # frame cap; notifications are intentionally kept small and pass through.
    ARTSA_MCP_STDIO_MAX_LINE_BYTES: int = 1_048_576
    ARTSA_MCP_STDIO_MAX_NOTIFICATION_BYTES: int = 65_536
    # Reject further ingest for already contained sessions (fail closed at API)
    ARTSA_BLOCK_CONTAINED_SESSIONS: bool = True
    USE_CHROMA_RAG: bool = False
    USE_PINECONE_RAG: bool = False
    PINECONE_INDEX_NAME: str = "artsa-policy-kb"
    PINECONE_NAMESPACE: str = "policy"
    ARTSA_OIDC_ENABLED: bool = False
    ARTSA_OIDC_ISSUER: str | None = None
    ARTSA_OIDC_AUDIENCE: str | None = None
    ARTSA_OIDC_JWKS_URL: str | None = None
    ARTSA_OIDC_ROLE_CLAIM: str = "groups"
    ARTSA_OIDC_ADMIN_GROUPS: str = "artsa-admin"
    ARTSA_OIDC_ANALYST_GROUPS: str = "artsa-analyst"
    ARTSA_OIDC_REDTEAM_GROUPS: str = "artsa-redteam"
    ARTSA_OIDC_READONLY_GROUPS: str = "artsa-readonly"
    ARTSA_OIDC_DEFAULT_ROLE: str | None = None
    ARTSA_CORS_ORIGINS: str = "*"
    ARTSA_RATE_LIMIT_RPM: int = 600
    # Phase 6 — tighter buckets for expensive Situation / baseline APIs (0=off).
    SITUATION_EVAL_PER_MIN: int = 60
    SITUATION_LLM_PER_MIN: int = 10
    BASELINE_STARTS_PER_HOUR: int = 6
    # Short-lived, single-use WebSocket auth tickets. ARTSA_WS_TICKET_SECRET
    # signs the ticket; falls back to SECRET_KEY when unset.
    ARTSA_WS_TICKET_SECRET: str | None = None
    ARTSA_WS_TICKET_TTL_SEC: int = 30
    # Inter-agent HMAC handoffs (Red Team → Target → Judge). Distinct from WS tickets.
    ARTSA_HMAC_HANDOFF_SECRET: str | None = None
    ARTSA_HMAC_HANDOFF_TTL_SEC: int = 300
    ARTSA_HMAC_HANDOFF_MAX_SKEW_SEC: int = 60
    # When true, CampaignManager queues Target/Judge hops to independent
    # worker processes over Redis (BRPOP). Workers verify, process/score, and
    # (for Target) sign the next envelope. Default is in-process hops that still
    # verify-then-process on the receiver role — orchestrator never signs as Target.
    ARTSA_HMAC_RECEIVER_WORKERS: bool = False
    ARTSA_HMAC_WORKER_TIMEOUT_SEC: int = 15
    # Wrap all JSON responses in {"success","data","meta"}. DEFAULT OFF: the
    # frontend, SDKs and tests still consume the flat contract. Flip to true
    # only after api.ts / SDKs / tests are migrated (see docs/AGENT_CONTRACT.md).
    ARTSA_RESPONSE_ENVELOPE: bool = True
    WARM_BENCHMARK_ON_START: bool = False
    SEED_ATTACK_LIBRARY_ON_START: bool = False
    SCHEDULED_ABLATION_INTERVAL_SEC: int = 0  # 0=disabled; e.g. 3600 for hourly refresh
    # In-process baseline schedule checker (0=disabled). 3600 = hourly look for due weekly jobs.
    BASELINE_SCHEDULE_TICK_SEC: int = 3600

    # ── Supabase (optional managed Postgres) ────────────────────────────
    SUPABASE_URL: str | None = None
    SUPABASE_PUBLISHABLE_KEY: str | None = None
    SUPABASE_SERVICE_ROLE_KEY: str | None = None

    # ── Vector stores ───────────────────────────────────────────────────
    PINECONE_API_KEY: str | None = None
    PINECONE_ENVIRONMENT: str | None = None
    CHROMA_PERSIST_DIR: str = "./data/chroma"

    # ── MongoDB (optional document sink) ────────────────────────────────
    # When ARTSA_MONGODB_URI is set, alerts / telemetry events / evaluations
    # are written to the ARTSA_MONGODB_DB database (never to a shared one).
    ARTSA_MONGODB_URI: str | None = None
    ARTSA_MONGODB_DB: str = "artsa"

    # ── LLM providers (cloud) ───────────────────────────────────────────
    OPENAI_API_KEY: str | None = None
    OPENAI_BASE_URL: str | None = None
    ANTHROPIC_API_KEY: str | None = None
    GROQ_API_KEY: str | None = None
    MISTRAL_API_KEY: str | None = None
    DEEPSEEK_API_KEY: str | None = None
    OPENROUTER_API_KEY: str | None = None
    TOGETHER_API_KEY: str | None = None
    FIREWORKS_API_KEY: str | None = None
    HUGGINGFACE_API_KEY: str | None = None
    HF_TOKEN: str | None = None
    COHERE_API_KEY: str | None = None
    GOOGLE_API_KEY: str | None = None

    # ── Local / self-hosted LLM endpoints ───────────────────────────────
    OLLAMA_API_KEY: str | None = None
    OLLAMA_BASE_URL: str | None = "http://localhost:11434/v1"
    VLLM_API_KEY: str | None = None
    VLLM_BASE_URL: str | None = "http://localhost:8000/v1"
    LMSTUDIO_API_KEY: str | None = None
    LMSTUDIO_BASE_URL: str | None = "http://localhost:1234/v1"
    JAN_API_KEY: str | None = None
    JAN_BASE_URL: str | None = "http://localhost:1337/v1"
    LOCAL_API_KEY: str | None = None
    LOCAL_BASE_URL: str | None = None

    # ── Guardrail / safety stacks ───────────────────────────────────────
    LAKERA_API_KEY: str | None = None
    LAKERA_BASE_URL: str | None = "https://api.lakera.ai/v2"
    AZURE_CONTENT_SAFETY_KEY: str | None = None
    AZURE_CONTENT_SAFETY_ENDPOINT: str | None = None
    NVIDIA_API_KEY: str | None = None
    NEMO_GUARDRAILS_URL: str | None = None

    # ── LLM reverse proxy gateway (OpenAI/Anthropic compatible) ───────
    # Developers point their client base_url at http://localhost:8000/v1/proxy
    # and every prompt is scored by the containment engine before forwarding.
    ARTSA_PROXY_ENABLED: bool = True
    ARTSA_PROXY_DEFAULT_PROVIDER: str = "openai"
    ARTSA_PROXY_TARGET_BASE_URL: str | None = None
    ARTSA_PROXY_API_KEY: str | None = None
    # allow | sanitize | block — how SUSPICIOUS prompts are handled
    ARTSA_PROXY_MODE: str = "sanitize"
    # BREACHED verdicts always block; SUSPICIOUS blocks at/above this score
    ARTSA_PROXY_BLOCK_THRESHOLD: float = 60.0
    ARTSA_PROXY_TIMEOUT_SEC: float = 120.0
    # Behaviour when the containment scanner itself errors:
    #   fail_closed -> block the request (secure default, prioritises safety)
    #   fail_open   -> allow the request (prioritises availability)
    ARTSA_PROXY_FAIL_MODE: str = "fail_closed"
    # SSRF guard for proxied forwarding targets (base_url / X-ARTSA-Forward-To /
    # registered provider base URLs). Private, loopback and link-local hosts are
    # blocked unless explicitly allowed.
    #   true  -> always allow internal targets (needed for local LLMs / Ollama)
    #   false -> always block internal targets
    #   unset -> auto: blocked in production, allowed in dev/testing
    ARTSA_PROXY_ALLOW_INTERNAL_TARGETS: bool | None = None
    # Comma-separated output canaries (hashed at scan time; never persisted).
    ARTSA_OUTPUT_CANARIES: str = ""

    # ── SIEM / SOAR alert channels ───────────────────────────────────────
    # Environment-level integration creds. Per-tenant rules can be configured
    # through the alerts API with channel-specific config values instead.
    ARTSA_ALERT_RISK_THRESHOLD: float = 60.0
    # OTEL trace ingest is EXPERIMENTAL (keyword heuristic, in-memory, no vector
    # drift). Disabled by default; enable explicitly to expose the endpoint.
    ARTSA_OTEL_ENABLED: bool = False
    SLACK_WEBHOOK_URL: str | None = None
    PAGERDUTY_ROUTING_KEY: str | None = None
    PAGERDUTY_SERVICE_URL: str = "https://events.pagerduty.com/v2/enqueue"
    SPLUNK_HEC_URL: str | None = None
    SPLUNK_HEC_TOKEN: str | None = None
    DATADOG_API_KEY: str | None = None
    DATADOG_SITE: str = "datadoghq.com"
    SENTINEL_WORKSPACE_ID: str | None = None
    SENTINEL_WORKSPACE_KEY: str | None = None
    SENTINEL_LOG_TYPE: str = "ARTSA_Security"

    # ── Defaults ────────────────────────────────────────────────────────
    ARTSA_DEFAULT_PROVIDER: str = "openai"
    ARTSA_DEFAULT_MODEL: str = "gpt-4o"

    # ── Performance SLOs ────────────────────────────────────────────────
    EDS_LATENCY_THRESHOLD_MS: float = 50.0

    # ── Detection / embeddings ──────────────────────────────────────────
    ARTSA_EMBEDDING_MODEL: str = "auto"  # auto | hash-1024 | local-bge-small | local-bge-multilingual | local-minilm | text-embedding-3-small | text-embedding-3-large

    # WS-2.4: org-policy scoring. Deterministic YAML rules always apply; the RAG
    # semantic corroboration (adds a small boost when a violation clause is
    # retrieved) is opt-in because it costs an embedding query per call.
    ARTSA_POLICY_RAG_SCORING: bool = False
    # Override path to the org-policy YAML (default: configs/org_policies/default.yaml)
    ARTSA_ORG_POLICY_PATH: str = ""

    # ── WS-2.3: LLM-judge verifier (optional, OFF by default) ───────────
    # Confirms SUSPICIOUS (50-79) verdicts with a fast judge model; can only
    # escalate to KILL, never downgrade. Costs one LLM call per borderline
    # event within ARTSA_JUDGE_TIMEOUT_SEC.
    ARTSA_JUDGE_ENABLED: bool = False
    ARTSA_JUDGE_PROVIDER: str = ""
    ARTSA_JUDGE_MODEL: str = ""
    ARTSA_JUDGE_TIMEOUT_SEC: float = 0.6
    # Phase 4.6 power cap: the judge may add at most this many points to a
    # borderline engine score, and only when its persisted calibration record
    # shows agreement >= ARTSA_JUDGE_MIN_AGREEMENT.
    ARTSA_JUDGE_MAX_RAISE: float = 25.0
    ARTSA_JUDGE_MIN_AGREEMENT: float = 0.85

    def resolve_embedding_model(self) -> str:
        """Pick embedding backend: hash in tests by default; open-source local
        ONNX model (FastEmbed) when installed; explicit override otherwise.
        `auto` NEVER selects a vendor API (OpenAI embeddings are opt-in only).

        An explicit ``ARTSA_EMBEDDING_MODEL`` wins even in ``testing`` so the
        eval gates (canary / red-team / accuracy card) can measure the REAL
        semantic layer — previously ``testing`` hard-pinned hash-1024 and the
        published generalization numbers came from a dead embedding detector.
        """
        if self.ARTSA_EMBEDDING_MODEL != "auto":
            return self.ARTSA_EMBEDDING_MODEL
        if self.is_testing:
            return "hash-1024"
        from src.data.embedding_manager import fastembed_available

        if fastembed_available():
            # Open-source BAAI/bge-small-en-v1.5 — offline, no API key.
            return "local-bge-small"
        if self.ENVIRONMENT == "production":
            # Do not silently weaken to hash-1024; embed() will fail closed.
            return "local-bge-small"
        return "hash-1024"

    @property
    def is_testing(self) -> bool:
        return self.ENVIRONMENT == "testing"

    @property
    def proxy_allows_internal_targets(self) -> bool:
        """Resolve the SSRF-guard policy (explicit flag, else env-based default)."""
        if self.ARTSA_PROXY_ALLOW_INTERNAL_TARGETS is not None:
            return self.ARTSA_PROXY_ALLOW_INTERNAL_TARGETS
        # Auto: internal targets are the norm for local LLMs in dev; in
        # production a security proxy should not forward to internal hosts.
        return self.ENVIRONMENT != "production"

    @property
    def ws_ticket_secret(self) -> str:
        """Secret used to sign WebSocket auth tickets (falls back to SECRET_KEY)."""
        return self.ARTSA_WS_TICKET_SECRET or self.SECRET_KEY

    @property
    def auth_required(self) -> bool:
        """Require X-API-Key on all non-public routes."""
        if self.ARTSA_REQUIRE_AUTH:
            return True
        return self.ENVIRONMENT == "production"

    @property
    def cors_origins(self) -> list[str]:
        raw = (self.ARTSA_CORS_ORIGINS or "*").strip()
        if raw == "*":
            return ["*"]
        return [origin.strip() for origin in raw.split(",") if origin.strip()]

    @property
    def effective_database_url(self) -> str:
        if self.USE_SQLITE:
            return (
                self.DATABASE_URL
                if "sqlite" in self.DATABASE_URL
                else "sqlite+aiosqlite:///./data/artsa.db"
            )
        url = self.DATABASE_URL
        if url.startswith("postgresql://"):
            return url.replace("postgresql://", "postgresql+asyncpg://", 1)
        return url

    def provider_key(self, provider: str) -> str | None:
        """Resolve API key for a named provider."""
        mapping = {
            "openai": self.OPENAI_API_KEY,
            "anthropic": self.ANTHROPIC_API_KEY,
            "groq": self.GROQ_API_KEY,
            "mistral": self.MISTRAL_API_KEY,
            "deepseek": self.DEEPSEEK_API_KEY,
            "openrouter": self.OPENROUTER_API_KEY,
            "together": self.TOGETHER_API_KEY,
            "fireworks": self.FIREWORKS_API_KEY,
            "huggingface": self.HUGGINGFACE_API_KEY or self.HF_TOKEN,
            "ollama": self.OLLAMA_API_KEY,
            "vllm": self.VLLM_API_KEY,
            "lmstudio": self.LMSTUDIO_API_KEY,
            "jan": self.JAN_API_KEY,
            "local": self.LOCAL_API_KEY,
            "cohere": self.COHERE_API_KEY,
            "google": self.GOOGLE_API_KEY,
        }
        return mapping.get(provider.lower())

    def is_key_configured(self, key_name: str) -> bool:
        val = getattr(self, key_name, None)
        if val is None:
            return False
        return not (
            isinstance(val, str)
            and val.strip() in ("", "mock-key", "mock-key-for-testing", "change-me-in-production")
        )


settings = Settings()
