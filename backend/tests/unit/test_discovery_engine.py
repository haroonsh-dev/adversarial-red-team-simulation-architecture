"""Discovery probe interpretation, surface derivation, and taxonomy mapping."""

from __future__ import annotations

from src.core.attack_taxonomy import BY_ID, TAXONOMY, attack_categories_for
from src.discovery.engine import (
    PROBES,
    _assess,
    _surface_for,
    _trust_boundaries,
)


def _probe(capability: str):
    return next(p for p in PROBES if p.capability == capability)


class TestProbeAssessment:
    def test_explicit_denial_marks_capability_absent(self):
        cap = _assess(_probe("memory"), "No.")
        assert cap.present is False
        assert cap.confidence > 0.5

    def test_named_specifics_mark_capability_present(self):
        cap = _assess(
            _probe("tools"),
            "I can call a search tool and a database function.",
        )
        assert cap.present is True
        # Two keyword hits is the strongest signal available.
        assert cap.confidence == 0.9
        assert "search tool" in cap.evidence

    def test_single_keyword_is_lower_confidence(self):
        cap = _assess(_probe("rag"), "I use a knowledge base.")
        assert cap.present is True
        assert cap.confidence == 0.6

    def test_refusal_is_absence_of_disclosure_not_absence_of_prompt(self):
        cap = _assess(
            _probe("system_prompt_disclosure"),
            "I can't share my system instructions.",
        )
        assert cap.present is False
        assert cap.confidence == 0.9

    def test_empty_answer_yields_no_confidence(self):
        cap = _assess(_probe("mcp"), "   ")
        assert cap.present is False
        assert cap.confidence == 0.0

    def test_unrelated_answer_does_not_invent_a_capability(self):
        cap = _assess(_probe("mcp"), "The weather today is pleasant.")
        assert cap.present is False


class TestSurfaceDerivation:
    def test_bare_llm_still_has_injection_and_exposure_surface(self):
        items = _surface_for("llm", set())
        ids = {i.taxonomy_id for i in items}
        assert ids == {"AI-01", "AI-06"}

    def test_rag_opens_indirect_injection_and_rag_manipulation(self):
        ids = {i.taxonomy_id for i in _surface_for("rag", {"rag"})}
        assert "AI-02" in ids
        assert "AI-07" in ids

    def test_tools_open_misuse_drift_and_privilege(self):
        ids = {i.taxonomy_id for i in _surface_for("agent", {"tools"})}
        assert {"AI-03", "AI-04", "AI-05"} <= ids

    def test_memory_opens_memory_manipulation(self):
        ids = {i.taxonomy_id for i in _surface_for("agent", {"memory"})}
        assert "AI-08" in ids

    def test_mcp_opens_boundary_abuse_and_authz(self):
        ids = {i.taxonomy_id for i in _surface_for("mcp_agent", {"mcp"})}
        assert "AI-09" in ids
        assert "AI-12" in ids

    def test_excessive_agency_needs_tools_and_network(self):
        assert "AI-11" not in {i.taxonomy_id for i in _surface_for("agent", {"tools"})}
        ids = {i.taxonomy_id for i in _surface_for("agent", {"tools", "external_api"})}
        assert "AI-11" in ids

    def test_multi_agent_kind_opens_trust_abuse(self):
        assert "AI-10" in {i.taxonomy_id for i in _surface_for("multi_agent", set())}
        assert "AI-10" not in {i.taxonomy_id for i in _surface_for("llm", set())}

    def test_surface_items_are_deduplicated(self):
        items = _surface_for("agent", {"rag", "external_api"})
        ids = [i.taxonomy_id for i in items]
        assert len(ids) == len(set(ids))

    def test_every_item_is_a_known_taxonomy_entry(self):
        items = _surface_for("multi_agent", {"tools", "rag", "memory", "mcp", "external_api"})
        assert items
        for item in items:
            assert item.taxonomy_id in BY_ID
            assert item.title == BY_ID[item.taxonomy_id].title
            assert item.rationale


class TestTrustBoundaries:
    def test_user_to_agent_is_always_present(self):
        assert _trust_boundaries(set()) == ["user → agent"]

    def test_capabilities_add_their_boundaries(self):
        boundaries = _trust_boundaries({"tools", "rag", "memory", "mcp", "external_api"})
        assert "agent → tools" in boundaries
        assert "agent → retrieval corpus" in boundaries
        assert "session → persisted memory" in boundaries
        assert "agent → MCP server" in boundaries
        assert "agent → external network" in boundaries


class TestTaxonomy:
    def test_taxonomy_is_ai_01_through_ai_12(self):
        assert [e.id for e in TAXONOMY] == [f"AI-{n:02d}" for n in range(1, 13)]

    def test_every_entry_maps_to_internal_categories_and_frameworks(self):
        from src.models import AttackCategory

        valid = {c.value for c in AttackCategory}
        for entry in TAXONOMY:
            assert entry.attack_categories
            assert set(entry.attack_categories) <= valid
            assert entry.owasp_llm.startswith("LLM")
            assert entry.mitre_atlas.startswith("AML.")

    def test_surface_maps_to_runnable_attack_categories(self):
        codes = attack_categories_for(["AI-04", "AI-07"])
        assert "TPA" in codes  # tool abuse templates
        assert "IPI" in codes  # indirect injection templates

    def test_unknown_ids_are_ignored_not_fatal(self):
        assert attack_categories_for(["AI-99"]) == []

    def test_categories_are_deduplicated(self):
        # AI-01 and AI-02 both include injection categories.
        codes = attack_categories_for(["AI-01", "AI-02", "AI-01"])
        assert len(codes) == len(set(codes))
