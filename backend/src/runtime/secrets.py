"""Output secret/PII scan that never retains matched plaintext."""

from __future__ import annotations

import re

from src.containment.detectors.tool_output_scanner import OUTPUT_PATTERNS
from src.containment.detectors.prompt_injection import INJECTION_PATTERNS
from src.runtime.actions import RuntimeAction
from src.runtime.evidence import RedactedFinding, finding_from_span

_DETECTOR = "ToolOutputScanner"

# Output secrets/PII are fail-closed BLOCK — never QUARANTINE/redact-and-forward
# for credentials. PII of MEDIUM (internal IP) still blocks at the runtime gate.
_COMPILED = [(re.compile(pattern), event_type, severity) for pattern, event_type, severity, _score, _desc in OUTPUT_PATTERNS]
_INJECTION_COMPILED = [(re.compile(pattern), event_type) for pattern, event_type, _score, _desc in INJECTION_PATTERNS]


def scan_output_secrets(output: str) -> list[RedactedFinding]:
    if not output:
        return []
    findings: list[RedactedFinding] = []
    for compiled, event_type, _severity in _COMPILED:
        match = compiled.search(output)
        if not match:
            continue
        findings.append(
            finding_from_span(
                detector=_DETECTOR,
                category=event_type,
                body=output,
                start=match.start(),
                end=match.end(),
                action=RuntimeAction.BLOCK,
            )
        )
    return findings


def scan_untrusted_tool_output_instructions(output: str) -> list[RedactedFinding]:
    """Quarantine instructions embedded in a tool's returned content.

    Unlike a known secret, indirect prompt-injection content may require an
    operator to approve a narrowly bound retry.  The source text stays
    transient; evidence records only the digest and matched span metadata.
    """
    for compiled, category in _INJECTION_COMPILED:
        match = compiled.search(output)
        if match:
            return [finding_from_span(
                detector="ToolOutputPromptInjectionScanner",
                category=category,
                body=output,
                start=match.start(),
                end=match.end(),
                action=RuntimeAction.QUARANTINE,
            )]
    return []
