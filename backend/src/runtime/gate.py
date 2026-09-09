"""Fail-closed runtime gate for model outputs and emitted tool_calls.

Independent of ContainmentEngine benign-content/prose exceptions. Secret and
prompt-disclosure findings are never downgraded.
"""

from __future__ import annotations

import logging
import uuid
from typing import Any

from pydantic import BaseModel, Field

from src.runtime.actions import RuntimeAction, strictest
from src.runtime.disclosure import (
    PromptFingerprint,
    scan_prompt_disclosure,
    scan_registered_canaries,
)
from src.runtime.evidence import RedactedFinding, RuntimeAuditRecord, sha256_text
from src.runtime.secrets import scan_output_secrets, scan_untrusted_tool_output_instructions
from src.runtime.tool_calls import score_tool_calls

logger = logging.getLogger(__name__)


class RuntimeDecision(BaseModel):
    action: RuntimeAction
    findings: list[RedactedFinding] = Field(default_factory=list)
    body_sha256: str
    stream: bool = False


class RuntimeGate:
    def evaluate(
        self,
        *,
        output_text: str,
        tool_calls: list[dict[str, Any]] | None = None,
        fingerprint: PromptFingerprint | None = None,
        registered_canaries: tuple[str, ...] = (),
        session_id: uuid.UUID | None = None,
        stream: bool = False,
        untrusted_tool_result: bool = False,
    ) -> RuntimeDecision:
        body = output_text or ""
        body_sha = sha256_text(body)
        try:
            findings: list[RedactedFinding] = []
            findings.extend(scan_output_secrets(body))
            if untrusted_tool_result:
                findings.extend(scan_untrusted_tool_output_instructions(body))
            leak = scan_prompt_disclosure(body, fingerprint)
            if leak is not None:
                findings.append(leak)
            findings.extend(scan_registered_canaries(body, registered_canaries))
            findings.extend(
                score_tool_calls(
                    tool_calls or [],
                    body=body,
                    session_id=session_id or uuid.uuid4(),
                )
            )
            action = strictest(*(f.action for f in findings)) if findings else RuntimeAction.ALLOW
            return RuntimeDecision(
                action=action,
                findings=findings,
                body_sha256=body_sha,
                stream=stream,
            )
        except Exception:
            logger.exception("Runtime output gate failed; fail-closed BLOCK")
            return RuntimeDecision(
                action=RuntimeAction.BLOCK,
                findings=[
                    RedactedFinding(
                        detector="RuntimeGate",
                        category="SCANNER_UNAVAILABLE",
                        body_sha256=body_sha,
                        action=RuntimeAction.BLOCK,
                    )
                ],
                body_sha256=body_sha,
                stream=stream,
            )

    def to_audit(
        self,
        decision: RuntimeDecision,
        *,
        session_id: uuid.UUID | str,
    ) -> RuntimeAuditRecord:
        return RuntimeAuditRecord(
            session_id=str(session_id),
            stream=decision.stream,
            action=decision.action,
            body_sha256=decision.body_sha256,
            findings=decision.findings,
        )


_gate: RuntimeGate | None = None


def get_runtime_gate() -> RuntimeGate:
    global _gate
    if _gate is None:
        _gate = RuntimeGate()
    return _gate
