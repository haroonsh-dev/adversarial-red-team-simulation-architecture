"""Provider catalog + LLM factory registry.

The catalog lists every API ARTSA can talk to out of the box. Runtime
credentials are resolved by :mod:`src.services.provider_resolver`, which is
tenant-scoped and deliberately does not cache plaintext secrets.

This module is also the single home for the dynamic LLM *factory* registry
(``register_provider`` / ``get_available_providers`` / ``create_llm_instance``),
previously split across two ``provider_registry`` modules. Agents resolve their
LangChain models here and ``src.agents.provider_registry`` is now only a
backward-compatible re-export of these names.
"""

from __future__ import annotations

import logging
import os
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from langchain_core.language_models.chat_models import BaseChatModel

from src.gateway.provider_catalog import PROVIDER_CATALOG

logger = logging.getLogger(__name__)


@dataclass
class ProviderCredential:
    """Resolved credentials for a registered provider."""

    name: str
    provider_type: str
    api_key: str
    base_url: str | None = None
    default_model: str | None = None


class ProviderRegistry:
    """Deprecated compatibility facade.

    It intentionally retains no credentials.  New code must use
    ``ProviderResolver`` at the execution boundary.
    """

    def __init__(self) -> None:
        self._providers: dict[str, ProviderCredential] = {}

    def load(self, rows: list[dict[str, Any]]) -> None:
        """Compatibility no-op; never retain decrypted provider rows."""
        self._providers = {}

    def get(self, name: str | None) -> ProviderCredential | None:
        if not name:
            return None
        return self._providers.get(name.strip().lower())

    def names(self) -> list[str]:
        return sorted(self._providers.keys())

    async def refresh(self) -> None:
        """Compatibility no-op. Credentials are loaded lazily per tenant."""
        self.load([])


provider_registry = ProviderRegistry()


# ─────────────────────────────────────────────────────────────────────────────
# Dynamic LLM factory registry (create any LangChain model by provider name)
# ─────────────────────────────────────────────────────────────────────────────

# Type alias for provider factory functions
ProviderFactory = Callable[
    [str, float, int, str | None, str | None, dict[str, Any]], BaseChatModel
]

# Global factory registry
_PROVIDER_REGISTRY: dict[str, ProviderFactory] = {}


def _chat_openai(**kwargs: Any) -> BaseChatModel:
    from langchain_openai import ChatOpenAI

    return ChatOpenAI(**kwargs)


def register_provider(name: str):
    """Decorator to register a custom LLM provider factory dynamically.

    Example usage:
        @register_provider("cohere")
        def create_cohere_provider(model, temperature, max_retries, api_key, base_url, **kwargs):
            return ChatCohere(model=model, cohere_api_key=api_key)
    """
    def decorator(fn: ProviderFactory):
        _PROVIDER_REGISTRY[name.lower()] = fn
        logger.debug("Registered custom LLM provider: %s", name.lower())
        return fn
    return decorator


def get_available_providers() -> list[str]:
    """Return a list of all registered custom LLM factory names."""
    return sorted(_PROVIDER_REGISTRY.keys())


def create_llm_instance(
    provider: str,
    model: str = "gpt-4o",
    temperature: float = 0.7,
    max_retries: int = 3,
    api_key: str | None = None,
    base_url: str | None = None,
    **kwargs: Any,
) -> BaseChatModel:
    """Dynamically create a LangChain BaseChatModel instance for ANY provider.

    Supports registered factories, known OpenAI-compatible APIs, local servers,
    and dynamic endpoint discovery.
    """
    prov_clean = provider.lower().strip()

    if prov_clean in {"deterministic", "fake", "test"}:
        from langchain_core.language_models.fake_chat_models import FakeListChatModel

        from src.core.campaign_exec import DETERMINISTIC_RESPONSE, record_test_llm_call

        class _CountingFake(FakeListChatModel):
            def invoke(self, input, config=None, **kwargs):  # noqa: A002
                record_test_llm_call()
                return super().invoke(input, config=config, **kwargs)

        return _CountingFake(responses=[DETERMINISTIC_RESPONSE])

    # 1. Check registered custom provider factory
    if prov_clean in _PROVIDER_REGISTRY:
        return _PROVIDER_REGISTRY[prov_clean](
            model, temperature, max_retries, api_key, base_url, kwargs
        )

    # 2. Known standard cloud/local providers mapped via OpenAI protocol
    # (single source of truth: src.gateway.provider_catalog)
    from src.core.config import settings
    from src.gateway.provider_catalog import catalog_base_url

    if prov_clean in PROVIDER_CATALOG:
        meta = PROVIDER_CATALOG[prov_clean]
        default_url = catalog_base_url(prov_clean)
        default_m = meta.get("default_model") or "gpt-4o"
        # Base URL overrides from settings (e.g. OLLAMA_BASE_URL) come first.
        setting_field = f"{prov_clean.upper()}_BASE_URL"
        resolved_url = (
            base_url
            or (getattr(settings, setting_field, "") or "")
            or default_url
            or "https://api.openai.com/v1"
        )
        resolved_key = api_key or (
            settings.provider_key(prov_clean) if settings.ARTSA_ALLOW_ENV_PROVIDER_FALLBACK else None
        )
        if not resolved_key and prov_clean not in {"ollama", "local", "vllm", "lmstudio", "jan"}:
            raise ValueError("provider_not_configured")
        # OpenAI-compatible local servers often disable authentication, but
        # the client library requires a non-empty value.  This sentinel is
        # never used for a remote provider and is not a credential fallback.
        if not resolved_key:
            resolved_key = "local-no-auth"
        resolved_model = model if model not in ("gpt-4o", "gpt-5.6-terra", "", "default") else default_m

        return _chat_openai(
            model=resolved_model,
            temperature=temperature,
            max_retries=max_retries,
            api_key=resolved_key,
            base_url=resolved_url,
            **kwargs,
        )

    # 3. Dynamic Universal OpenAI-Compatible Discovery
    # If the user specifies any new/unknown provider (e.g. "my_new_provider"), check env vars or base_url
    env_url = os.environ.get(f"{prov_clean.upper()}_BASE_URL")
    env_key = os.environ.get(f"{prov_clean.upper()}_API_KEY")
    resolved_url = base_url or env_url
    resolved_key = api_key or (env_key if settings.ARTSA_ALLOW_ENV_PROVIDER_FALLBACK else None)

    if resolved_url:
        logger.info(
            "Dynamically connecting to custom provider '%s' at base_url: %s",
            provider,
            resolved_url,
        )
        return _chat_openai(
            model=model,
            temperature=temperature,
            max_retries=max_retries,
            api_key=resolved_key,
            base_url=resolved_url,
            **kwargs,
        )

    # 4. Standard OpenAI Default
    logger.info("Initializing OpenAI provider for '%s'", provider)
    resolved_key = api_key or (
        os.environ.get("OPENAI_API_KEY") if settings.ARTSA_ALLOW_ENV_PROVIDER_FALLBACK else None
    )
    if not resolved_key:
        raise ValueError("provider_not_configured")
    return _chat_openai(
        model=model,
        temperature=temperature,
        max_retries=max_retries,
        request_timeout=60,
        api_key=resolved_key,
        **kwargs,
    )
