"""Tests for ARTSA Pydantic data models."""

import uuid

import pytest
from pydantic import ValidationError
from src.models import (
    AttackCategory,
    AttackPayload,
    CampaignConfig,
    CampaignState,
    CampaignSummary,
    GuardrailLayer,
    GuardrailResult,
    JudgeScore,
    Severity,
    TargetResponse,
    Verdict,
)

# ── AttackPayload ──────────────────────────────────────────────────────

class TestAttackPayload:
    def test_creation_with_defaults(self):
        """AttackPayload can be created with only required fields."""
        payload = AttackPayload(
            category=AttackCategory.PROMPT_INJECTION,
            name="Test",
            prompt="Hello",
            objective="Test objective",
        )
        assert payload.name == "Test"
        assert payload.mutations_applied == []
        assert payload.metadata == {}

    def test_auto_generates_uuid_id(self):
        """AttackPayload auto-generates a UUID id."""
        payload = AttackPayload(
            category=AttackCategory.JAILBREAK,
            name="JBK Test",
            prompt="test prompt",
            objective="test",
        )
        # Should be a valid UUID
        parsed = uuid.UUID(payload.id)
        assert str(parsed) == payload.id


# ── AttackCategory ─────────────────────────────────────────────────────

class TestAttackCategory:
    def test_enum_values(self):
        """All AttackCategory enum values are accessible."""
        assert AttackCategory.PROMPT_INJECTION.value == "DPI"
        assert AttackCategory.INDIRECT_INJECTION.value == "IPI"
        assert AttackCategory.JAILBREAK.value == "JBK"
        assert AttackCategory.SYSTEM_PROMPT_EXTRACTION.value == "SPE"
        assert AttackCategory.DATA_EXTRACTION.value == "DEX"
        assert AttackCategory.PRIVILEGE_ESCALATION.value == "PEX"
        assert AttackCategory.DENIAL_OF_SERVICE.value == "DOS"
        assert AttackCategory.OUTPUT_MANIPULATION.value == "OPM"
        assert AttackCategory.SOCIAL_ENGINEERING.value == "MSE"
        assert AttackCategory.TOOL_ABUSE.value == "TPA"

    def test_total_categories(self):
        """There are exactly 10 attack categories."""
        assert len(AttackCategory) == 10


# ── JudgeScore ─────────────────────────────────────────────────────────

class TestJudgeScore:
    def test_valid_score_range(self):
        """JudgeScore accepts valid score values 0-10."""
        score = JudgeScore(
            verdict=Verdict.PARTIAL,
            attack_success_score=5,
            severity=Severity.MEDIUM,
            bypass_depth=2,
            information_leakage_score=3,
            defense_quality_score=7,
        )
        assert score.attack_success_score == 5

    def test_rejects_score_above_10(self):
        """JudgeScore rejects attack_success_score > 10."""
        with pytest.raises(ValidationError):
            JudgeScore(
                verdict=Verdict.SUCCESS,
                attack_success_score=11,
                severity=Severity.HIGH,
                bypass_depth=2,
                information_leakage_score=5,
                defense_quality_score=5,
            )

    def test_rejects_score_below_0(self):
        """JudgeScore rejects attack_success_score < 0."""
        with pytest.raises(ValidationError):
            JudgeScore(
                verdict=Verdict.BLOCKED,
                attack_success_score=-1,
                severity=Severity.LOW,
                bypass_depth=0,
                information_leakage_score=0,
                defense_quality_score=10,
            )

    def test_rejects_bypass_depth_above_4(self):
        """JudgeScore rejects bypass_depth > 4."""
        with pytest.raises(ValidationError):
            JudgeScore(
                verdict=Verdict.SUCCESS,
                attack_success_score=8,
                severity=Severity.CRITICAL,
                bypass_depth=5,
                information_leakage_score=8,
                defense_quality_score=2,
            )


# ── RoundResult ────────────────────────────────────────────────────────

class TestRoundResult:
    def test_contains_all_fields(self, sample_round_result):
        """RoundResult contains attack, response, and score."""
        rr = sample_round_result
        assert rr.round_number == 1
        assert rr.attack is not None
        assert rr.response is not None
        assert rr.score is not None
        assert rr.timestamp is not None
        assert rr.hop_latency_ms.red_team is None
        assert rr.hop_latency_ms.target is None
        assert rr.hop_latency_ms.judge is None


# ── CampaignConfig ─────────────────────────────────────────────────────

class TestCampaignConfig:
    def test_defaults(self):
        """CampaignConfig has sensible defaults."""
        config = CampaignConfig()
        assert config.name == "Untitled Campaign"
        assert config.max_rounds == 50
        assert config.max_tokens == 500_000
        assert config.max_cost_usd == 10.0
        assert config.id is not None


# ── CampaignSummary ────────────────────────────────────────────────────

class TestCampaignSummary:
    def test_defaults(self):
        """CampaignSummary defaults are correct."""
        summary = CampaignSummary(campaign_id="test-id")
        assert summary.total_rounds == 0
        assert summary.completed_rounds == 0
        assert summary.avg_attack_success == 0.0
        assert summary.state == CampaignState.COMPLETED


# ── TargetResponse ─────────────────────────────────────────────────────

class TestTargetResponse:
    def test_defaults(self):
        """TargetResponse defaults are correct."""
        resp = TargetResponse(response="Hello there")
        assert resp.blocked is False
        assert resp.bypass_depth == 0
        assert resp.blocked_by is None
        assert resp.guardrail_trace == []


# ── GuardrailResult ────────────────────────────────────────────────────

class TestGuardrailResult:
    def test_creation(self):
        """GuardrailResult can be created with required fields."""
        result = GuardrailResult(
            layer=GuardrailLayer.INPUT_FILTER,
            passed=True,
            details="Content passed input filter check.",
        )
        assert result.layer == GuardrailLayer.INPUT_FILTER
        assert result.passed is True
        assert result.latency_ms == 0.0


# ── CampaignState ─────────────────────────────────────────────────────

class TestCampaignState:
    def test_enum_values(self):
        """CampaignState has correct values."""
        assert CampaignState.INIT.value == "INIT"
        assert CampaignState.RUNNING.value == "RUNNING"
        assert CampaignState.PAUSED.value == "PAUSED"
        assert CampaignState.COMPLETED.value == "COMPLETED"
        assert CampaignState.REPORTED.value == "REPORTED"
