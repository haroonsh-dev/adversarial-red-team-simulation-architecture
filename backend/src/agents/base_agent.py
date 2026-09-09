"""Abstract Base Agent for all ARTSA actors — with async support."""

from __future__ import annotations

import logging
from abc import ABC
from typing import Any, TypeVar

from langchain_core.language_models.chat_models import BaseChatModel
from pydantic import BaseModel

logger = logging.getLogger(__name__)

T = TypeVar("T", bound=BaseModel)


class BaseAgent(ABC):
    """Abstract base class for Red Team, Target, and Judge agents.

    Provides both sync (`invoke`) and async (`ainvoke`) methods for LLM calls.
    Async methods enable concurrent execution of the campaign loop for 5-10x
    throughput improvement.
    """

    def __init__(
        self,
        name: str,
        provider: str = "openai",
        model: str = "gpt-4o",
        temperature: float = 0.7,
        system_prompt: str = "",
        max_retries: int = 3,
        api_key: str | None = None,
        base_url: str | None = None,
        tenant_id: str | None = None,
        provider_ref: str | None = None,
    ) -> None:
        self.name = name
        self.provider = provider.lower()
        self.model = model
        self.temperature = temperature
        self.system_prompt = system_prompt
        self.max_retries = max_retries
        self.base_url = base_url
        self.tenant_id = tenant_id
        self.provider_ref = provider_ref
        # api_key is intentionally consumed during construction and never
        # retained on the agent object.
        self.llm = self._init_llm(api_key)

        self.total_tokens_used = 0
        self.prompt_tokens_used = 0
        self.completion_tokens_used = 0

    def _init_llm(self, explicit_api_key: str | None = None) -> BaseChatModel:
        """Initialize the LangChain LLM based on provider using the dynamic provider registry."""
        from src.services.provider_registry import create_llm_instance

        api_key = explicit_api_key
        model = self.model
        base_url = self.base_url
        if self.provider_ref:
            if not self.tenant_id:
                raise ValueError("tenant_context_required")
            from src.services.provider_resolver import provider_resolver

            resolved = provider_resolver.resolve_sync(
                tenant_id=self.tenant_id, provider=self.provider_ref, model=model, base_url=base_url,
                api_key=explicit_api_key, provider_ref=self.provider_ref,
            )
            api_key, model, base_url = resolved.api_key, resolved.model, resolved.base_url
            self.provider, self.model, self.base_url = resolved.provider_type, model, base_url
        return create_llm_instance(
            provider=self.provider,
            model=model,
            temperature=self.temperature,
            max_retries=self.max_retries,
            api_key=api_key,
            base_url=base_url,
        )

    def _build_messages(
        self,
        prompt: str,
        history: list[dict[str, str]] | None = None,
    ) -> list:
        """Build the message list for LLM invocation (shared by sync/async)."""
        from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

        messages = []
        if self.system_prompt:
            messages.append(SystemMessage(content=self.system_prompt))

        if history:
            for msg in history:
                if msg["role"] == "user":
                    messages.append(HumanMessage(content=msg["content"]))
                elif msg["role"] == "assistant":
                    messages.append(AIMessage(content=msg["content"]))

        messages.append(HumanMessage(content=prompt))
        return messages

    def _extract_response(self, response: Any) -> tuple[str, dict[str, int]]:
        """Extract text + usage from a LangChain response object."""
        self._update_token_usage(response.response_metadata)
        usage = response.response_metadata.get("token_usage", {})
        return str(response.content), usage

    def _update_token_usage(self, response_metadata: dict[str, Any]) -> None:
        """Update token usage counters from LLM response metadata."""
        if "token_usage" in response_metadata:
            usage = response_metadata["token_usage"]
            self.total_tokens_used += usage.get("total_tokens", 0)
            self.prompt_tokens_used += usage.get("prompt_tokens", 0)
            self.completion_tokens_used += usage.get("completion_tokens", 0)

    # ─── Synchronous Methods ─────────────────────────────────────────

    def invoke(self, prompt: str) -> tuple[str, dict[str, int]]:
        """Invoke the LLM synchronously with a simple text prompt.

        Returns:
            Tuple of (response_text, token_usage_dict)
        """
        messages = self._build_messages(prompt)
        response = self.llm.invoke(messages)
        return self._extract_response(response)

    def invoke_with_history(
        self,
        prompt: str,
        history: list[dict[str, str]],
    ) -> tuple[str, dict[str, int]]:
        """Invoke the LLM synchronously with conversation history."""
        messages = self._build_messages(prompt, history)
        response = self.llm.invoke(messages)
        return self._extract_response(response)

    def invoke_structured(
        self, prompt: str, schema: type[T]
    ) -> tuple[T, dict[str, int]]:
        """Invoke the LLM forcing structured JSON output matching a Pydantic schema."""
        messages = self._build_messages(prompt)
        llm_with_tools = self.llm.with_structured_output(schema)
        result = llm_with_tools.invoke(messages)
        return result, {"total_tokens": 0}

    # ─── Async Methods ───────────────────────────────────────────────

    async def ainvoke(self, prompt: str) -> tuple[str, dict[str, int]]:
        """Invoke the LLM asynchronously.

        Usage:
            text, usage = await agent.ainvoke("Hello")
        """
        messages = self._build_messages(prompt)
        response = await self.llm.ainvoke(messages)
        return self._extract_response(response)

    async def ainvoke_with_history(
        self,
        prompt: str,
        history: list[dict[str, str]],
    ) -> tuple[str, dict[str, int]]:
        """Invoke the LLM asynchronously with conversation history."""
        messages = self._build_messages(prompt, history)
        response = await self.llm.ainvoke(messages)
        return self._extract_response(response)
