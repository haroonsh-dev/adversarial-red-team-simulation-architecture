"""Target Agent (Defender)."""

from __future__ import annotations

import logging
import time

from src.agents.base_agent import BaseAgent
from src.models import (
    GuardrailLayer,
    GuardrailResult,
    TargetConfig,
    TargetResponse,
)

logger = logging.getLogger(__name__)


class TargetAgent(BaseAgent):
    """The defending LLM that processes user inputs through guardrails."""

    def __init__(self, config: TargetConfig) -> None:
        super().__init__(
            name="TargetAgent",
            provider=config.provider,
            model=config.model,
            temperature=config.temperature,
            system_prompt=config.system_prompt,
            api_key=getattr(config, "api_key", None),
            base_url=getattr(config, "base_url", None),
        )
        self.config = config

    def _check_input_guardrails(self, text: str) -> tuple[bool, list[GuardrailResult]]:
        """Run pluggable input guardrail adapters."""
        from src.agents.guardrails.adapters import get_input_adapters

        results: list[GuardrailResult] = []
        blocked = False

        if not self.config.guardrails.input_content_filter and not self.config.guardrails.input_injection_detector:
            return True, results

        for adapter in get_input_adapters():
            if adapter.layer == GuardrailLayer.INPUT_FILTER and not self.config.guardrails.input_content_filter:
                continue
            if adapter.layer == GuardrailLayer.SYSTEM_PROMPT and not self.config.guardrails.input_injection_detector:
                continue
            from src.agents.guardrails.adapters import GuardrailContext

            result = adapter.check(GuardrailContext(text=text, direction="input"))
            results.append(result)
            if not result.passed:
                blocked = True
                break

        return not blocked, results

    def _check_output_guardrails(self, text: str) -> tuple[bool, list[GuardrailResult]]:
        """Run pluggable output guardrail adapters."""
        from src.agents.guardrails.adapters import GuardrailContext, get_output_adapters

        results: list[GuardrailResult] = []
        blocked = False

        if not self.config.guardrails.output_toxicity_filter:
            return True, results

        for adapter in get_output_adapters():
            result = adapter.check(GuardrailContext(text=text, direction="output"))
            results.append(result)
            if not result.passed:
                blocked = True
                break

        return not blocked, results

    def receive_signed(self, envelope):
        """HMAC-verify a Red Team envelope before any target processing."""
        from src.agents.handoff_worker import accept_envelope

        return accept_envelope("target", envelope)

    def process(self, attack_prompt: str) -> TargetResponse:
        """Process an attack through the entire defense pipeline."""
        start_time = time.time()
        trace = []
        bypass_depth = 0
        
        # 1. Input Guardrails
        input_passed, input_results = self._check_input_guardrails(attack_prompt)
        trace.extend(input_results)
        
        if not input_passed:
            blocked_by = next(r.layer.value for r in trace if not r.passed)
            return TargetResponse(
                response="[BLOCKED BY INPUT GUARDRAILS]",
                guardrail_trace=trace,
                bypass_depth=bypass_depth,
                blocked=True,
                blocked_by=blocked_by,
                latency_ms=(time.time() - start_time) * 1000,
                token_usage={"total_tokens": 0},
            )
            
        bypass_depth += len(input_results)

        # 2. RAG retrieval (embedding-based policy chunks)
        if self.config.rag.enabled:
            from src.agents.rag.retriever import RAGRetriever

            retriever = RAGRetriever(top_k=self.config.rag.retrieval_k)
            chunks = retriever.retrieve(attack_prompt)
            context = retriever.format_context(chunks)
            if context:
                attack_prompt = f"{context}\n\n[USER QUERY]\n{attack_prompt}"
            trace.append(
                GuardrailResult(
                    layer=GuardrailLayer.RAG_RETRIEVAL,
                    passed=True,
                    details=f"Retrieved {len(chunks)} policy chunks (top score={chunks[0].score if chunks else 0})",
                )
            )
            bypass_depth += 1

        # 3. LLM Generation
        try:
            llm_start = time.time()
            raw_response, usage = self.invoke(attack_prompt)
            trace.append(
                GuardrailResult(
                    layer=GuardrailLayer.LLM_GENERATION,
                    passed=True,
                    details=f"LLM generated response in {(time.time() - llm_start):.2f}s",
                )
            )
            bypass_depth += 1
        except Exception as e:
            logger.error("Target LLM generation failed: %s", e)
            trace.append(
                GuardrailResult(
                    layer=GuardrailLayer.LLM_GENERATION,
                    passed=False,
                    details=f"Generation failed: {e}",
                )
            )
            return TargetResponse(
                response="[GENERATION ERROR]",
                guardrail_trace=trace,
                bypass_depth=bypass_depth,
                blocked=False,
                blocked_by=None,
                error=True,
                error_detail=str(e),
                latency_ms=(time.time() - start_time) * 1000,
                token_usage={},
            )

        # 4. Output Guardrails
        output_passed, output_results = self._check_output_guardrails(raw_response)
        trace.extend(output_results)
        
        if not output_passed:
            blocked_by = next(r.layer.value for r in output_results if not r.passed)
            return TargetResponse(
                response="[BLOCKED BY OUTPUT GUARDRAILS]",
                guardrail_trace=trace,
                bypass_depth=bypass_depth,
                blocked=True,
                blocked_by=blocked_by,
                latency_ms=(time.time() - start_time) * 1000,
                token_usage=usage,
                raw_response=raw_response,
            )
            
        bypass_depth += len(output_results)

        return TargetResponse(
            response=raw_response,
            guardrail_trace=trace,
            bypass_depth=bypass_depth,
            blocked=False,
            blocked_by=None,
            latency_ms=(time.time() - start_time) * 1000,
            token_usage=usage,
            raw_response=raw_response,
        )

    def process_with_history(
        self,
        attack_prompt: str,
        history: list[dict[str, str]],
    ) -> TargetResponse:
        """Process an attack with conversation history for multi-turn chains.

        Same as process(), but passes previous turns to the LLM so the target
        sees the full conversation context (critical for social engineering).
        """
        start_time = time.time()
        trace = []
        bypass_depth = 0

        # 1. Input Guardrails (check current prompt only)
        input_passed, input_results = self._check_input_guardrails(attack_prompt)
        trace.extend(input_results)

        if not input_passed:
            blocked_by = next(r.layer.value for r in trace if not r.passed)
            return TargetResponse(
                response="[BLOCKED BY INPUT GUARDRAILS]",
                guardrail_trace=trace,
                bypass_depth=bypass_depth,
                blocked=True,
                blocked_by=blocked_by,
                latency_ms=(time.time() - start_time) * 1000,
                token_usage={"total_tokens": 0},
            )

        bypass_depth += len(input_results)

        # 2. LLM Generation with history
        try:
            llm_start = time.time()
            raw_response, usage = self.invoke_with_history(attack_prompt, history)
            trace.append(
                GuardrailResult(
                    layer=GuardrailLayer.LLM_GENERATION,
                    passed=True,
                    details=f"LLM generated response with {len(history)} history messages in {(time.time() - llm_start):.2f}s",
                )
            )
            bypass_depth += 1
        except Exception as e:
            logger.error("Target LLM generation (with history) failed: %s", e)
            trace.append(
                GuardrailResult(
                    layer=GuardrailLayer.LLM_GENERATION,
                    passed=False,
                    details=f"Generation failed: {e}",
                )
            )
            return TargetResponse(
                response="[GENERATION ERROR]",
                guardrail_trace=trace,
                bypass_depth=bypass_depth,
                blocked=False,
                blocked_by=None,
                error=True,
                error_detail=str(e),
                latency_ms=(time.time() - start_time) * 1000,
                token_usage={},
            )

        # 3. Output Guardrails
        output_passed, output_results = self._check_output_guardrails(raw_response)
        trace.extend(output_results)

        if not output_passed:
            blocked_by = next(r.layer.value for r in output_results if not r.passed)
            return TargetResponse(
                response="[BLOCKED BY OUTPUT GUARDRAILS]",
                guardrail_trace=trace,
                bypass_depth=bypass_depth,
                blocked=True,
                blocked_by=blocked_by,
                latency_ms=(time.time() - start_time) * 1000,
                token_usage=usage,
                raw_response=raw_response,
            )

        bypass_depth += len(output_results)

        return TargetResponse(
            response=raw_response,
            guardrail_trace=trace,
            bypass_depth=bypass_depth,
            blocked=False,
            blocked_by=None,
            latency_ms=(time.time() - start_time) * 1000,
            token_usage=usage,
            raw_response=raw_response,
        )

    # ─── Async Methods ───────────────────────────────────────────────

    async def aprocess(self, attack_prompt: str) -> TargetResponse:
        """Process an attack asynchronously — same as process() but awaits the LLM."""
        start_time = time.time()
        trace = []
        bypass_depth = 0

        # 1. Input Guardrails (sync — CPU-only, fast)
        input_passed, input_results = self._check_input_guardrails(attack_prompt)
        trace.extend(input_results)

        if not input_passed:
            blocked_by = next(r.layer.value for r in trace if not r.passed)
            return TargetResponse(
                response="[BLOCKED BY INPUT GUARDRAILS]",
                guardrail_trace=trace,
                bypass_depth=bypass_depth,
                blocked=True,
                blocked_by=blocked_by,
                latency_ms=(time.time() - start_time) * 1000,
                token_usage={"total_tokens": 0},
            )

        bypass_depth += len(input_results)

        # 2. LLM Generation (async — the expensive part)
        try:
            llm_start = time.time()
            raw_response, usage = await self.ainvoke(attack_prompt)
            trace.append(
                GuardrailResult(
                    layer=GuardrailLayer.LLM_GENERATION,
                    passed=True,
                    details=f"LLM generated response in {(time.time() - llm_start):.2f}s",
                )
            )
            bypass_depth += 1
        except Exception as e:
            logger.error("Target LLM generation failed: %s", e)
            trace.append(
                GuardrailResult(
                    layer=GuardrailLayer.LLM_GENERATION,
                    passed=False,
                    details=f"Generation failed: {e}",
                )
            )
            return TargetResponse(
                response="[GENERATION ERROR]",
                guardrail_trace=trace,
                bypass_depth=bypass_depth,
                blocked=False,
                blocked_by=None,
                error=True,
                error_detail=str(e),
                latency_ms=(time.time() - start_time) * 1000,
                token_usage={},
            )

        # 3. Output Guardrails (sync — CPU-only)
        output_passed, output_results = self._check_output_guardrails(raw_response)
        trace.extend(output_results)

        if not output_passed:
            blocked_by = next(r.layer.value for r in output_results if not r.passed)
            return TargetResponse(
                response="[BLOCKED BY OUTPUT GUARDRAILS]",
                guardrail_trace=trace,
                bypass_depth=bypass_depth,
                blocked=True,
                blocked_by=blocked_by,
                latency_ms=(time.time() - start_time) * 1000,
                token_usage=usage,
                raw_response=raw_response,
            )

        bypass_depth += len(output_results)

        return TargetResponse(
            response=raw_response,
            guardrail_trace=trace,
            bypass_depth=bypass_depth,
            blocked=False,
            blocked_by=None,
            latency_ms=(time.time() - start_time) * 1000,
            token_usage=usage,
            raw_response=raw_response,
        )
