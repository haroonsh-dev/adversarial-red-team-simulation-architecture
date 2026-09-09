"""Event Processor Service with route to containment engine and session metrics updater."""

import logging
import uuid

from src.containment.monitor import RealtimeMonitor
from src.core.models.events import SecurityEvent, ToolCallEvent
from src.core.models.scores import ContainmentVerdict, RiskScore

logger = logging.getLogger(__name__)

# Live Harness chat checkpoints — prefer speed; skip LLM judge + heavy detectors.
_FAST_PATH_TOOLS = frozenset({"user_prompt", "model_output"})


class EventProcessor:
    """Processes tool call events and updates session containment metrics."""

    def __init__(self) -> None:
        self.monitor = RealtimeMonitor()
        self._judge = None  # lazy — WS-2.3 optional LLM judge

    def _judge_verifier(self):
        if self._judge is None:
            from src.services.judge import JudgeVerifier

            self._judge = JudgeVerifier()
        return self._judge

    def process_event(
        self,
        event: ToolCallEvent,
        *,
        fast: bool | None = None,
    ) -> tuple[RiskScore, ContainmentVerdict, list[SecurityEvent]]:
        """Route tool call event to containment evaluation engine.

        ``fast=True`` (default for user_prompt / model_output) uses the
        prompt-only detector set and skips the LLM judge so live Harness
        scans stay near the sub‑50ms SLO.
        """
        use_fast = event.tool_name in _FAST_PATH_TOOLS if fast is None else fast
        if use_fast:
            return self.monitor.process_event_fast(event)
        if event.post_exec_redacted:
            # SDK tool results are transient sensitive material. Keep their
            # detection in-process; do not route them through embeddings or the
            # optional LLM judge before persistence redaction.
            return self.monitor.process_post_exec(event)

        risk, verdict, sec_events = self.monitor.process_event(event)
        # WS-2.3: optional LLM confirmation of borderline verdicts (no-op when
        # ARTSA_JUDGE_ENABLED=false or the judge cannot confirm).
        risk, verdict, _ = self._judge_verifier().verify(event, risk, verdict)
        return risk, verdict, sec_events

    def process(
        self,
        event: ToolCallEvent,
        *,
        fast: bool | None = None,
    ) -> tuple[RiskScore, ContainmentVerdict, list[SecurityEvent]]:
        """Alias for process_event."""
        return self.process_event(event, fast=fast)

    def update_session_metrics(self, session_id: uuid.UUID, risk_score: float) -> None:
        """Update active session risk score metrics."""
        logger.info("Updated metrics for session %s with risk score %.1f", session_id, risk_score)
