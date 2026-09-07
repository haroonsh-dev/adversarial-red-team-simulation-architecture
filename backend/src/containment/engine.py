"""Containment Engine — Coordinates detectors, composite risk scoring, and verdict generation."""

import json
import re
from typing import Any

from src.containment.detectors.canary_token import CanaryTokenDetector
from src.containment.detectors.goal_drift import GoalDriftDetector
from src.containment.detectors.mcp_destructive import McpDestructiveToolDetector
from src.containment.detectors.policy import PolicyDetector
from src.containment.detectors.prompt_injection import PromptInjectionDetector
from src.containment.detectors.rule_based import RuleBasedDetector
from src.containment.detectors.semantic import SemanticDetector
from src.containment.detectors.sql_injection import SqlInjectionDetector
from src.containment.detectors.statistical import StatisticalDetector
from src.containment.detectors.tool_output_scanner import ToolOutputScanner
from src.containment.detectors.trajectory import TrajectoryDetector
from src.containment.scoring.composite import CompositeScorer
from src.core.models.events import SecurityEvent, ToolCallEvent
from src.core.models.scores import ContainmentVerdict, RiskScore
from src.core.severity import CRITICAL_RISK_THRESHOLD, SUSPICIOUS_RISK_THRESHOLD


def _command_text(arguments: dict[str, Any]) -> str:
    """Return the command / script text of a tool call, preferring structured fields."""
    if isinstance(arguments, dict):
        for key in (
            "command",
            "cmd",
            "input",
            "code",
            "script",
            "payload",
            "shell_command",
            "sql",
            "query",
            "statement",
        ):
            val = arguments.get(key)
            if isinstance(val, str):
                return val
        return str(arguments)
    return str(arguments)


# Tools that are command / path executors (detectors treat their args as commands).
_COMMAND_TOOLS_ENGINE = frozenset(
    {
        "exec_command",
        "execute_command",
        "run_command",
        "shell",
        "bash",
        "run_terminal",
        "run_code",
        "exec",
        "eval",
        "read_file",
        "write_file",
        "append_file",
        "http_request",
        "mcp_call",
    }
)

# Tools whose arguments are prose / data (a dangerous substring is quoted text).
_CONTENT_TOOLS_ENGINE = frozenset(
    {
        "send_email",
        "send_message",
        "write_markdown",
        "create_document",
        "update_document",
        "translate",
        "summarize",
        "create_ticket",
        # NOTE: search_documents / query_vector_db are intentionally NOT here:
        # their *query* is a retrieval command, and an injection embedded in a
        # search query is a real tool-input attack, not quoted prose.
        # NOTE: inject_prompt is also deliberately NOT here — it is the injection
        # surface itself, so genuine payloads passed to it must never be
        # downgraded as "quoted prose".
    }
)


class ContainmentEngine:
    """Core containment evaluation engine."""

    DETECTOR_NAMES = (
        "RuleBasedDetector",
        "StatisticalDetector",
        "SemanticDetector",
        "GoalDriftDetector",
        "TrajectoryDetector",
        "CanaryTokenDetector",
        "ToolOutputScanner",
        "PromptInjectionDetector",
        "SqlInjectionDetector",
        "McpDestructiveToolDetector",
        "PolicyDetector",
    )

    def __init__(self, disabled_detectors: list[str] | None = None) -> None:
        disabled = set(disabled_detectors or [])
        all_detectors = [
            RuleBasedDetector(),
            StatisticalDetector(),
            SemanticDetector(),
            GoalDriftDetector(),
            TrajectoryDetector(),
            CanaryTokenDetector(),
            ToolOutputScanner(),
            PromptInjectionDetector(tool_scope=True),
            SqlInjectionDetector(),
            McpDestructiveToolDetector(),
            PolicyDetector(),
        ]
        self.detectors = [d for d in all_detectors if d.name not in disabled]
        self.scorer = CompositeScorer()
        self.disabled_detectors = list(disabled)

    def _calibrate_confidence(
        self, risk_score: RiskScore, security_events: list[SecurityEvent]
    ) -> float:
        """Derive confidence from the strongest signal magnitude and detector agreement.

        WORKPACKAGE B (B5): confidence now tracks the strongest detector's score
        (not the blended overall) so a lone critical hit reports high confidence
        even when corroborating detectors are quiet. SAFE (no signals) reports
        high confidence in safety.
        """
        if not security_events:
            return 0.95
        detector_count = len({e.detector for e in security_events})
        top_score = max(e.risk_score for e in security_events)
        score_factor = top_score / 100.0
        agreement_boost = min(0.15, detector_count * 0.03)
        confidence = min(0.99, max(0.50, score_factor * 0.8 + agreement_boost + 0.12))
        return round(confidence, 3)

    def evaluate_event(
        self, event: ToolCallEvent
    ) -> tuple[RiskScore, ContainmentVerdict, list[SecurityEvent]]:
        """Evaluate incoming tool call event across all detectors and produce score and verdict."""
        risk_score, verdict, security_events, _ = self.evaluate_with_attribution(event)
        return risk_score, verdict, security_events

    def _is_benign_content_mention(self, event: ToolCallEvent) -> tuple[bool, str]:
        """Detect when a tool call is genuinely benign "content" that merely
        *contains* a dangerous-looking substring, rather than an operational
        action the guardrail must neutralize.

        Applies to doc searches, quoted incident text, documentation writes,
        LIKE-based SQL searches, and references to example/documentation domains.
        Returns ``(is_benign, reason)``.
        """
        tool = event.tool_name.lower()
        args_text = _command_text(event.arguments)

        # Documentation / example-domain references are never an action — but
        # ONLY when the reserved domain is the host itself (RFC 2606: the
        # example.com/net/org apex and the .test/.invalid/.example TLDs).
        # Subdomains such as attacker.example.com are NOT reserved and must
        # never suppress a real signal (a reverse shell to *.example.com used
        # to be downgraded to the review band here). URL form (//host) is
        # matched too, so `curl -I https://example.com` is recognized.
        if re.search(
            r"(?:^|[/\s'\"(])(?:www\.)?example\.(?:com|org|net)(?:[/\s'\"?)]|$)"
            r"|\w+\.(?:test|invalid|example)(?:[/\s'\"?)]|$)",
            args_text,
            re.IGNORECASE,
        ):
            # For command executors, a doc-domain reference is only benign when
            # the command is a pure read — upload/exfil constructs make the
            # reserved domain the *target of an action*, never a reference.
            if tool in _COMMAND_TOOLS_ENGINE and re.search(
                r"(?i)-F\s|-d\s|--data|-X\s+POST|base64\s+-d|/dev/tcp/|nc\s+-e|bash\s+-i|rm\s+-rf|curl\s+.*\s+@",
                args_text,
            ):
                return False, ""
            return True, "reference to RFC-reserved documentation domain"

        # SQL LIKE-search wrapping a dangerous string is a search, not injection.
        if re.search(
            r"\blike\s+'%"  # LIKE '<value>
            r"[\s\S]*?"  # ... lazy up to the keyword ...
            r"(?:drop\s+table|delete\s+from|insert\s+into|update\s+\w+\s+set"
            r"|select\s+.*\bunion\b|or\s+1\s*=\s*1)"  # keyword under test
            r"[^'\"]*['\"]",  # rest of literal + closing quote
            args_text,
            re.IGNORECASE,
        ):
            return True, "dangerous token appears only inside a SQL LIKE search literal"

        # Execution pipelines are never "references": a wrapper word followed by
        # a decode-and-run construct (base64 -d | sh, /dev/tcp, nc -e) is an
        # executed attack, not quoted prose — checked before the wrapper rule.
        if re.search(
            r"(?i)base64\s+-d|base64\s+--decode|\|\s*(ba|s)?sh\b|/dev/tcp/|nc\s+-e",
            args_text,
        ):
            return False, ""

        # Command executors prefixed by a benign *inspection* wrapper. NOTE: cat/
        # tail/head/less read real files, so `cat /etc/shadow` is an actual
        # sensitive-file read and must NOT be downgraded. The wrapper must
        # *precede* the dangerous token in close proximity — a bare `grep`
        # anywhere in the string is not enough (`env | grep AWS_ACCESS_KEY`
        # reads secrets; `echo '<base64>' | base64 -d | sh` executes).
        if tool in _COMMAND_TOOLS_ENGINE and re.search(
            r"\b(grep|rg|egrep|man|vim|echo)\b.{0,40}"
            r"['\"]?\s*(rm\s+-rf|/etc/(?:passwd|shadow|sudoers)|\.aws|\.ssh|id_rsa"
            r"|base64\s+-d|drop\s+table|delete\s+from|AWS_|--delete)",
            args_text,
            re.IGNORECASE,
        ):
            return True, "dangerous token appears after a benign inspection wrapper"

        # File writers: the *content* field is prose (docs/notes); only the path
        # is a real system target for credential/privilege patterns. A match on
        # content is a benign mention unless writing to a sensitive/system path.
        if tool in ("write_file", "append_file", "write", "append", "update_file"):
            path = ""
            if isinstance(event.arguments, dict):
                path = str(event.arguments.get("path", ""))
            sensitive_path = re.search(
                r"(?:/etc/|/proc/|/var/(?:spool|lib)/|(?:^|\b)var/[^/\s]*/|/opt/|/usr/|/etc/+|\.aws|\.ssh|/root/|(?:^|/)\.env\b)",
                path,
                re.IGNORECASE,
            )
            if not sensitive_path:
                return (
                    True,
                    "file-write to a non-system path — content is prose, not an executable target",
                )

        # Content / prose tools quoting an attack (incident emails/reports/docs).
        if tool in _CONTENT_TOOLS_ENGINE:
            return True, "content tool — argument is quoted prose, not an executable command"

        return False, ""

    def evaluate_with_attribution(
        self, event: ToolCallEvent
    ) -> tuple[RiskScore, ContainmentVerdict, list[SecurityEvent], dict[str, bool]]:
        security_events: list[SecurityEvent] = []
        fired: dict[str, bool] = {name: False for name in self.DETECTOR_NAMES}

        is_benign, benign_reason = self._is_benign_content_mention(event)

        for detector in self.detectors:
            if detector.name == "ToolOutputScanner" and event.response is None:
                continue
            sec_evt = detector.detect(event)
            if sec_evt:
                fail_closed = bool((sec_evt.evidence or {}).get("fail_closed"))
                if is_benign and not fail_closed:
                    # Downgrade every signal from a benign content mention to
                    # below the enforcement threshold (QUARANTINE >= 50), so
                    # legitimate work is surfaced in events/alerts but never
                    # neutralized: the event still records, the verdict stays
                    # SAFE. Previously capped at 55 which still quarantined
                    # benign LIKE-searches, prose mentions, and doc fetches.
                    sec_evt = sec_evt.model_copy(
                        update={
                            "risk_score": min(sec_evt.risk_score, 45.0),
                            "severity": "HIGH"
                            if sec_evt.severity == "CRITICAL"
                            else sec_evt.severity,
                            "evidence": {
                                **(sec_evt.evidence or {}),
                                "benign_context_reason": benign_reason,
                            },
                        }
                    )
                security_events.append(sec_evt)
                fired[detector.name] = True

        risk_score = self.scorer.calculate_score(security_events)
        risk_score.session_id = event.session_id
        verdict = self._build_verdict(event, risk_score, security_events)
        return risk_score, verdict, security_events, fired

    def _build_verdict(
        self, event: ToolCallEvent, risk_score: RiskScore, security_events: list[SecurityEvent]
    ) -> ContainmentVerdict:
        # WORKPACKAGE B (B5): name the deciding detector and surface its matched
        # evidence so operators see *why* a verdict was reached, not just a score.
        deciding = max(security_events, key=lambda e: e.risk_score) if security_events else None
        if deciding is not None:
            try:
                evidence_str = json.dumps(deciding.evidence, default=str)[:400]
            except (TypeError, ValueError):
                evidence_str = str(deciding.evidence)[:400]
            evidence_detail = (
                f"Deciding detector: {deciding.detector} "
                f"({deciding.event_type}, severity={deciding.severity}, score={deciding.risk_score:.1f}). "
                f"{deciding.description} Evidence: {evidence_str}."
            )
        else:
            evidence_detail = "No security signals detected."

        if risk_score.overall_score >= CRITICAL_RISK_THRESHOLD:
            verdict_type = "BREACHED"
            action = "KILL"
            reasoning = (
                f"Critical containment breach detected (Risk Score: {risk_score.overall_score:.1f}). "
                f"{evidence_detail} Flags: {risk_score.flags}"
            )
        elif risk_score.overall_score >= SUSPICIOUS_RISK_THRESHOLD:
            verdict_type = "SUSPICIOUS"
            action = "QUARANTINE"
            reasoning = (
                f"Suspicious activity detected (Risk Score: {risk_score.overall_score:.1f}). "
                f"{evidence_detail} Flags: {risk_score.flags}"
            )
        else:
            verdict_type = "SAFE"
            action = "NONE"
            reasoning = (
                "Tool execution evaluated within safe containment parameters "
                f"(Risk Score: {risk_score.overall_score:.1f}). {evidence_detail}"
            )

        return ContainmentVerdict(
            session_id=event.session_id,
            verdict=verdict_type,
            confidence=self._calibrate_confidence(risk_score, security_events),
            reasoning=reasoning,
            recommended_action=action,
        )
