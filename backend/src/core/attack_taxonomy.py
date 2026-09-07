"""The ARTSA attack taxonomy (AI-01 … AI-12).

One source of truth for the product-level attack categories, mapped onto the
existing internal :class:`~src.models.AttackCategory` codes (which drive
template selection) and the external frameworks findings are reported against.

The internal codes stay as they are — this is the outward-facing taxonomy that
discovery, the attack surface, and findings are described in.
"""

from __future__ import annotations

from typing import NamedTuple


class TaxonomyEntry(NamedTuple):
    id: str
    title: str
    description: str
    # Internal AttackCategory codes that exercise this class of weakness.
    attack_categories: tuple[str, ...]
    owasp_llm: str
    mitre_atlas: str


TAXONOMY: tuple[TaxonomyEntry, ...] = (
    TaxonomyEntry(
        "AI-01",
        "Prompt Injection",
        "Attacker-supplied text overrides the operator's instructions.",
        ("DPI", "JBK"),
        "LLM01",
        "AML.T0051",
    ),
    TaxonomyEntry(
        "AI-02",
        "Indirect Injection",
        "Instructions reach the model through retrieved or fetched content.",
        ("IPI",),
        "LLM01",
        "AML.T0051.001",
    ),
    TaxonomyEntry(
        "AI-03",
        "Goal Drift",
        "The agent's objective is steered away from its assigned task.",
        ("MSE",),
        "LLM09",
        "AML.T0054",
    ),
    TaxonomyEntry(
        "AI-04",
        "Tool Misuse",
        "A legitimate tool is invoked for an illegitimate purpose.",
        ("TPA",),
        "LLM07",
        "AML.T0053",
    ),
    TaxonomyEntry(
        "AI-05",
        "Privilege Boundary Violation",
        "The agent acts beyond the permissions it was granted.",
        ("PEX",),
        "LLM08",
        "AML.T0053",
    ),
    TaxonomyEntry(
        "AI-06",
        "Data Exposure",
        "Confidential context, credentials, or user data leave the boundary.",
        ("DEX", "SPE"),
        "LLM06",
        "AML.T0057",
    ),
    TaxonomyEntry(
        "AI-07",
        "RAG Manipulation",
        "The retrieval corpus is poisoned or steered to change answers.",
        ("IPI",),
        "LLM03",
        "AML.T0070",
    ),
    TaxonomyEntry(
        "AI-08",
        "Memory Manipulation",
        "Persisted state is written to influence later sessions.",
        ("IPI", "MSE"),
        "LLM03",
        "AML.T0070",
    ),
    TaxonomyEntry(
        "AI-09",
        "MCP / Tool Boundary Abuse",
        "A connected server or plugin is used to cross a trust boundary.",
        ("TPA", "PEX"),
        "LLM07",
        "AML.T0053",
    ),
    TaxonomyEntry(
        "AI-10",
        "Multi-Agent Trust Abuse",
        "One agent is used to compromise another it is trusted by.",
        ("MSE", "PEX"),
        "LLM09",
        "AML.T0054",
    ),
    TaxonomyEntry(
        "AI-11",
        "Excessive Agency",
        "The agent can take consequential action without a human in the loop.",
        ("PEX", "TPA"),
        "LLM08",
        "AML.T0053",
    ),
    TaxonomyEntry(
        "AI-12",
        "Authentication / Authorization Failure",
        "Identity or authorization is not enforced on an agent-reachable path.",
        ("PEX", "DEX"),
        "LLM08",
        "AML.T0012",
    ),
)

BY_ID: dict[str, TaxonomyEntry] = {entry.id: entry for entry in TAXONOMY}


def get(taxonomy_id: str) -> TaxonomyEntry | None:
    return BY_ID.get(taxonomy_id.upper())


def attack_categories_for(taxonomy_ids: list[str]) -> list[str]:
    """Internal AttackCategory codes covering the given taxonomy ids.

    Used to turn a discovered attack surface into the campaign categories that
    actually exercise it, de-duplicated and in taxonomy order.
    """
    codes: list[str] = []
    for tid in taxonomy_ids:
        entry = get(tid)
        if entry is None:
            continue
        for code in entry.attack_categories:
            if code not in codes:
                codes.append(code)
    return codes
