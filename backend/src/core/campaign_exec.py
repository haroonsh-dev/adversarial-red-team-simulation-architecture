"""Safe campaign execution context for HMAC workers.

The orchestrator publishes a key-free snapshot keyed by campaign_id.
Workers load it after HMAC verify, then resolve ``secret_ref`` locally.
Never put API keys on the Redis hop queue.
"""

from __future__ import annotations

import json
import logging
import os
import re
from typing import Any, Literal

from pydantic import BaseModel, Field

from src.core.config import settings
from src.models import GuardrailConfig, RAGConfig, TargetConfig

logger = logging.getLogger(__name__)

EXEC_PREFIX = "artsa:hmac:exec:"
EXEC_TTL_SEC = 86400
DETERMINISTIC_RESPONSE = "CONFIGURED_TARGET_OK"
_SECRET_FIELD_NAMES = frozenset({"api_key", "password", "secret", "token", "authorization"})
_ENV_KEY_RE = re.compile(r"^[A-Z][A-Z0-9_]*_API_KEY$")


class TargetExecSpec(BaseModel):
    target_id: str | None = None
    target_version: str | None = None
    provider: str
    model: str
    base_url: str | None = None
    provider_ref: str | None = None
    system_prompt: str = ""
    guardrails: GuardrailConfig = Field(default_factory=GuardrailConfig)
    rag: RAGConfig = Field(default_factory=RAGConfig)

    @property
    def secret_ref(self) -> str:
        """Deprecated non-secret compatibility hint; never serialized."""
        return "test:deterministic" if self.provider in {"deterministic", "fake", "test"} else "settings:" + self.provider


class JudgeExecSpec(BaseModel):
    provider: str = "openai"
    model: str = "gpt-4o"
    use_llm: bool = False
    provider_ref: str | None = None
    temperature: float = 0.1


class CampaignExecContext(BaseModel):
    campaign_id: str
    tenant_id: str = "default_org"
    target: TargetExecSpec
    judge: JudgeExecSpec = Field(default_factory=JudgeExecSpec)


class CampaignExecRef(BaseModel):
    """Queued to workers — lookup key only, never credentials."""

    campaign_id: str
    role: Literal["target", "judge"]


def assert_no_secret_fields(payload: Any) -> None:
    if isinstance(payload, dict):
        for key, value in payload.items():
            if key.lower() in _SECRET_FIELD_NAMES and value not in (None, ""):
                raise ValueError(f"must not contain secret field {key}")
            assert_no_secret_fields(value)
    elif isinstance(payload, list):
        for item in payload:
            assert_no_secret_fields(item)


def secret_ref_for_provider(provider: str) -> str:
    """Legacy helper retained for older integrations; never used for DB keys."""
    name = (provider or "").strip().lower()
    if name in {"deterministic", "fake", "test"}:
        return "test:deterministic"
    return f"settings:{name}"


def context_from_campaign(config, app_config: dict[str, Any] | None = None) -> CampaignExecContext:
    target = config.target
    provider = (target.provider or "openai").lower()
    judge_cfg = ((app_config or {}).get("artsa") or {}).get("judge") or {}
    judge_provider = str(judge_cfg.get("provider") or provider).lower()
    return CampaignExecContext(
        campaign_id=config.id,
        tenant_id=target.tenant_id or settings.ARTSA_TENANT_ID,
        target=TargetExecSpec(
            target_id=getattr(target, "target_id", None),
            target_version=getattr(target, "target_version", None),
            provider=provider,
            model=target.model or "default",
            base_url=target.base_url,
            provider_ref=target.provider_ref,
            system_prompt=target.system_prompt or "",
            guardrails=target.guardrails,
            rag=target.rag,
        ),
        judge=JudgeExecSpec(
            provider=judge_provider,
            model=str(judge_cfg.get("model") or target.model),
            use_llm=bool(judge_cfg.get("use_llm", False)),
            provider_ref=target.provider_ref if judge_provider == provider else None,
            temperature=float(judge_cfg.get("temperature") or 0.1),
        ),
    )


def publish_exec_context(ctx: CampaignExecContext, *, ttl_sec: int = EXEC_TTL_SEC) -> None:
    payload = ctx.model_dump(mode="json")
    assert_no_secret_fields(payload)
    from src.data.redis_client import get_redis_stream_client

    client = get_redis_stream_client()
    client.set(f"{EXEC_PREFIX}{ctx.campaign_id}", json.dumps(payload), ttl_sec=ttl_sec)


def load_exec_context(campaign_id: str) -> CampaignExecContext | None:
    from src.data.redis_client import get_redis_stream_client

    raw = get_redis_stream_client().get(f"{EXEC_PREFIX}{campaign_id}")
    if not raw:
        return None
    data = json.loads(raw)
    assert_no_secret_fields(data)
    return CampaignExecContext.model_validate(data)


def resolve_secret_ref(ref: str | None) -> str | None:
    """Resolve an approved secret reference inside the worker. Never log the value."""
    if not ref or not str(ref).strip():
        return None
    scheme, _, name = str(ref).strip().partition(":")
    scheme = scheme.lower()
    if scheme == "settings":
        return settings.provider_key(name.lower())
    if scheme == "provider":
        # Name-only provider references were global and could cross tenant
        # boundaries.  Worker contexts now carry ``provider_ref`` plus tenant.
        raise ValueError("provider secret_ref is no longer supported")
    if scheme == "env":
        if not _ENV_KEY_RE.match(name):
            raise ValueError("env secret_ref must be a *_API_KEY name")
        return os.environ.get(name) or None
    if scheme == "test":
        if settings.ENVIRONMENT == "production":
            raise ValueError("test secret_ref is forbidden in production")
        if name != "deterministic":
            raise ValueError("unknown test secret_ref")
        return None
    raise ValueError(f"unsupported secret_ref scheme {scheme}")


def record_test_llm_call() -> None:
    path = os.environ.get("ARTSA_TEST_LLM_CALL_LOG")
    if not path:
        return
    with open(path, "a", encoding="utf-8") as handle:
        handle.write("invoke\n")


def target_config_from_spec(spec: TargetExecSpec, *, tenant_id: str | None = None) -> TargetConfig:
    return TargetConfig(
        provider=spec.provider,
        model=spec.model,
        base_url=spec.base_url,
        system_prompt=spec.system_prompt,
        guardrails=spec.guardrails,
        rag=spec.rag,
        target_id=spec.target_id,
        target_version=spec.target_version,
        provider_ref=spec.provider_ref,
        tenant_id=tenant_id,
    )


def build_target_agent(campaign_id: str):
    from src.agents.target_agent import TargetAgent

    ctx = load_exec_context(campaign_id)
    if ctx is None:
        return None
    return TargetAgent(target_config_from_spec(ctx.target, tenant_id=ctx.tenant_id))


def build_judge_agent(campaign_id: str):
    from src.agents.judge_agent import JudgeAgent

    ctx = load_exec_context(campaign_id)
    if ctx is None:
        return None
    spec = ctx.judge
    return JudgeAgent(
        {
            "provider": spec.provider,
            "model": spec.model,
            "temperature": spec.temperature,
            "use_llm": spec.use_llm,
            "tenant_id": ctx.tenant_id,
            "provider_ref": spec.provider_ref,
        }
    )
