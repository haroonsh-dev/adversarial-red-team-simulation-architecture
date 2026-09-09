"""OWASP ASI01–ASI10 catalog with honest implementation status.

Do not emit a detection for a category whose detector does not exist.
ASI08 is supported by the durable session circuit breaker.
HMAC inter-agent handoff is a separate integrity family, not an ASI code.
Red Team → Target → Judge is signed and verified on the receiver (ADR-007).
"""

from __future__ import annotations

from enum import Enum
from typing import NamedTuple


class AsiStatus(str, Enum):
    SUPPORTED = "supported"
    PARTIAL = "partial"
    NOT_IMPLEMENTED = "not_implemented"


class AsiEntry(NamedTuple):
    code: str
    label: str
    status: AsiStatus
    detectors: tuple[str, ...]
    attack_categories: tuple[str, ...]
    note: str


ASI_CATALOG: tuple[AsiEntry, ...] = (
    AsiEntry(
        "ASI01",
        "Agent Goal Hijack",
        AsiStatus.SUPPORTED,
        ("PromptInjectionDetector", "GoalDriftDetector"),
        ("DPI", "IPI", "PROMPT_INJECTION"),
        "Prompt-injection and goal-drift detectors can classify this.",
    ),
    AsiEntry(
        "ASI02",
        "Tool Misuse & Exploitation",
        AsiStatus.SUPPORTED,
        ("McpDestructiveToolDetector", "ToolOutputScanner", "RuleBasedDetector"),
        ("TPA", "PEX"),
        "Destructive MCP / tool-output scanners cover a subset of tool misuse.",
    ),
    AsiEntry(
        "ASI03",
        "Identity & Privilege Abuse",
        AsiStatus.PARTIAL,
        (),
        ("PEX",),
        "Mapped from privilege-escalation attack templates; no dedicated detector.",
    ),
    AsiEntry(
        "ASI04",
        "Agentic Supply Chain Vulnerabilities",
        AsiStatus.NOT_IMPLEMENTED,
        (),
        (),
        "No detector or campaign classifier for supply-chain compromise.",
    ),
    AsiEntry(
        "ASI05",
        "Unexpected Code Execution",
        AsiStatus.PARTIAL,
        ("SqlInjectionDetector",),
        ("TPA",),
        "SQL-injection detector only — not a general code-execution sensor.",
    ),
    AsiEntry(
        "ASI06",
        "Memory & Context Poisoning",
        AsiStatus.PARTIAL,
        (),
        ("DEX", "IPI", "DATA_EXTRACTION"),
        "Campaign category mapping only; no dedicated memory-poison detector.",
    ),
    AsiEntry(
        "ASI07",
        "Insecure Inter-Agent Communication",
        AsiStatus.PARTIAL,
        (),
        (),
        "HMAC handoff verify is live on Red Team → Target → Judge. Research/Curator/Defender remain unwired.",
    ),
    AsiEntry(
        "ASI08",
        "Cascading Failures",
        AsiStatus.SUPPORTED,
        ("SessionCircuitBreaker",),
        (),
        "Repeated BLOCK decisions open a durable, session-scoped circuit breaker.",
    ),
    AsiEntry(
        "ASI09",
        "Human-Agent Trust Exploitation",
        AsiStatus.NOT_IMPLEMENTED,
        (),
        ("MSE",),
        "Social-engineering templates exist; no dedicated HITL detector.",
    ),
    AsiEntry(
        "ASI10",
        "Rogue Agents",
        AsiStatus.PARTIAL,
        (),
        ("JBK", "SPE", "JAILBREAK", "SYSTEM_PROMPT_EXTRACTION"),
        "Jailbreak / system-prompt categories only; no rogue-agent runtime sensor.",
    ),
)

ASI_BY_CODE: dict[str, AsiEntry] = {e.code: e for e in ASI_CATALOG}

# HMAC is recorded as a threat family, not an ASI code.
HMAC_THREAT_CODE = "HMAC"
HMAC_STATUS = AsiStatus.SUPPORTED

_DETECTOR_TO_ASI: dict[str, str] = {
    "promptinjectiondetector": "ASI01",
    "goaldriftdetector": "ASI01",
    "mcpdestructivetooldetector": "ASI02",
    "tooloutputscanner": "ASI02",
    "rulebaseddetector": "ASI02",
    "sqlinjectiondetector": "ASI05",
    "sessioncircuitbreaker": "ASI08",
}

_CATEGORY_TO_ASI: dict[str, str] = {}
for _entry in ASI_CATALOG:
    if _entry.status == AsiStatus.NOT_IMPLEMENTED:
        continue
    for _cat in _entry.attack_categories:
        _CATEGORY_TO_ASI.setdefault(_cat.upper(), _entry.code)


def asi_catalog() -> list[dict[str, object]]:
    return [
        {
            "code": e.code,
            "label": e.label,
            "status": e.status.value,
            "detectors": list(e.detectors),
            "attack_categories": list(e.attack_categories),
            "note": e.note,
        }
        for e in ASI_CATALOG
    ]


def classify_asi(
    *,
    detectors: list[str] | None = None,
    attack_category: str | None = None,
) -> tuple[str | None, AsiStatus | None]:
    """Return (asi_code, status) from real signals only.

    Returns (None, None) when nothing classifies.
    """
    for raw in detectors or []:
        code = _DETECTOR_TO_ASI.get(str(raw).lower().replace(" ", ""))
        entry = ASI_BY_CODE.get(code or "")
        if entry and entry.status != AsiStatus.NOT_IMPLEMENTED:
            return entry.code, entry.status

    if attack_category:
        key = str(attack_category).upper().replace(" ", "_")
        code = _CATEGORY_TO_ASI.get(key) or _CATEGORY_TO_ASI.get(key.replace("_", ""))
        if code:
            entry = ASI_BY_CODE[code]
            return entry.code, entry.status

    return None, None
