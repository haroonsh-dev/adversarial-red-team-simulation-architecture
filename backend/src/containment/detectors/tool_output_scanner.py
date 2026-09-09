"""Tool Output Scanner — detects sensitive data exposure in tool responses.

Scans tool call responses for:
  - Credential leaks (API keys, passwords, tokens)
  - PII exposure (emails, SSNs, credit card numbers)
  - Internal IP / network topology disclosure
  - System file path leaks
  - Private key / certificate material

This detector complements the prompt_injection detector by examining the
*output* side: what the agent retrieves or generates, not just what it's
instructed to do.
"""

from __future__ import annotations

import re

from src.containment.detectors.base import BaseDetector
from src.core.models.events import SecurityEvent, ToolCallEvent

# (regex, event_type, severity, risk_score, description)
OUTPUT_PATTERNS: list[tuple[str, str, str, float, str]] = [
    # ── Credential leaks ──
    (
        r'(?i)(?:api[_-]?key|apikey|secret[_-]?key|access[_-]?key)\s*[:=]\s*["\x27]?[a-zA-Z0-9_\-+/=]{20,}["\x27]?',
        "SENSITIVE_DATA_EXPOSED",
        "CRITICAL",
        92.0,
        "API key or secret key exposed in tool output",
    ),
    (
        r'(?i)(?:password|passwd|pwd)\s*[:=]\s*["\x27][^"\x27]+["\x27]',
        "SENSITIVE_DATA_EXPOSED",
        "CRITICAL",
        95.0,
        "Plaintext password exposed in tool output",
    ),
    (
        r"(?i)Bearer\s+[a-zA-Z0-9_\-\.]{20,}",
        "SENSITIVE_DATA_EXPOSED",
        "HIGH",
        85.0,
        "Bearer token exposed in tool output",
    ),
    (
        r"(?i)-----BEGIN\s+(?:RSA|EC|DSA|OPENSSH|PGP)\s+PRIVATE\s+KEY-----",
        "SENSITIVE_DATA_EXPOSED",
        "CRITICAL",
        98.0,
        "Private key material exposed in tool output",
    ),
    # ── PII exposure ──
    (
        r"\b\d{3}-\d{2}-\d{4}\b",
        "SENSITIVE_DATA_EXPOSED",
        "HIGH",
        78.0,
        "SSN pattern (XXX-XX-XXXX) detected in output",
    ),
    (
        r"\b(?:\d{4}[ -]?){3}\d{4,6}\b",
        "SENSITIVE_DATA_EXPOSED",
        "MEDIUM",
        65.0,
        "Credit card number pattern detected in output",
    ),
    # ── Internal network disclosure ──
    (
        r"\b(?:10\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])|192\.168)\.\d{1,3}\.\d{1,3}\b",
        "SENSITIVE_DATA_EXPOSED",
        "MEDIUM",
        55.0,
        "Internal/private IP address exposed in output",
    ),
    (
        r"(?i)(?:internal|private|corporate)\s+(?:network|subnet|vlan|vpc)",
        "SENSITIVE_DATA_EXPOSED",
        "MEDIUM",
        50.0,
        "Internal network topology referenced in output",
    ),
    # ── System paths ──
    # Benign system files (/etc/hosts, /etc/ssl, /proc/..., /sys/...) are NOT
    # sensitive — WORKPACKAGE B (B2). Only credential-adjacent system files flag.
    (
        r"(?:/etc/(?:passwd|shadow)|C:\Windows\System32|/var/log/(?:auth|secure|syslog))",
        "SENSITIVE_DATA_EXPOSED",
        "HIGH",
        72.0,
        "Sensitive system file path exposed in output",
    ),
    (
        r"(?i)(?:\.aws/credentials|\.ssh/id_|\.kube/config|\.gcp/credentials)",
        "SENSITIVE_DATA_EXPOSED",
        "HIGH",
        82.0,
        "Cloud/SSH credential path exposed in output",
    ),
    # ── Database connection strings ──
    (
        r"(?i)(?:postgres(?:ql)?|mysql|mongodb|redis)://[^@\s]+:[^@\s]+@",
        "SENSITIVE_DATA_EXPOSED",
        "CRITICAL",
        94.0,
        "Database connection string with embedded credentials in output",
    ),
    # ── JWT / session tokens ──
    (
        r"eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}",
        "SENSITIVE_DATA_EXPOSED",
        "HIGH",
        80.0,
        "JWT token exposed in tool output",
    ),
]


class ToolOutputScanner(BaseDetector):
    """Scans tool call *responses* for sensitive data exposure.

    Pre-execution ingest (no ``event.response``) must not use this detector —
    argument scanning belongs to rule/injection detectors so a KILL can happen
    before the tool runs. Concatenating arguments into the output scan is
    forbidden: it would treat intended inputs as leaked secrets.
    """

    def __init__(self) -> None:
        super().__init__(name="ToolOutputScanner")
        self.PATTERNS = OUTPUT_PATTERNS

    def detect(self, event: ToolCallEvent) -> SecurityEvent | None:
        if not event.response:
            return None

        scan_text = str(event.response)
        for pattern, event_type, severity, risk_score, desc in self.PATTERNS:
            match = re.search(pattern, scan_text)
            if match:
                return SecurityEvent(
                    session_id=event.session_id,
                    agent_id=event.agent_id,
                    event_type=event_type,  # type: ignore[arg-type]
                    severity=severity,  # type: ignore[arg-type]
                    risk_score=risk_score,
                    description=desc,
                    evidence={
                        "matched_pattern": desc,
                        "tool": event.tool_name,
                        "span": [match.start(), match.end()],
                        "match_length": match.end() - match.start(),
                        "source": "tool_response",
                        "fail_closed": True,
                    },
                    detector=self.name,
                )
        return None
