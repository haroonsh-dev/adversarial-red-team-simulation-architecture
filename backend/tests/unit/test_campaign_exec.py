"""Campaign exec context: no keys on the wire; secrets resolve in the worker."""

import json

import pytest
from src.core.campaign_exec import (
    CampaignExecContext,
    JudgeExecSpec,
    TargetExecSpec,
    assert_no_secret_fields,
    context_from_campaign,
    publish_exec_context,
    resolve_secret_ref,
    secret_ref_for_provider,
)
from src.core.hmac_handoff import HandoffIntegrityError, sign_handoff
from src.models import AttackCategory, CampaignConfig, GuardrailConfig, TargetConfig
from src.agents.handoff_worker import run_target_hop
from src.data.hmac_audit_store import clear_handoff_audits
from src.data.redis_client import reset_redis_client


@pytest.fixture(autouse=True)
def _reset():
    reset_redis_client()
    clear_handoff_audits()
    yield
    reset_redis_client()
    clear_handoff_audits()


def test_context_from_campaign_does_not_copy_api_key():
    cfg = CampaignConfig(
        id="camp-1",
        target=TargetConfig(
            provider="openai",
            model="gpt-4o",
            api_key="sk-live-secret",
            system_prompt="stay in role",
            target_id="tgt-9",
            target_version="v3",
        ),
    )
    ctx = context_from_campaign(
        cfg, {"artsa": {"judge": {"provider": "openai", "model": "gpt-4o", "use_llm": False}}}
    )
    dumped = ctx.model_dump(mode="json")
    assert_no_secret_fields(dumped)
    assert "sk-live-secret" not in json.dumps(dumped)
    assert ctx.target.secret_ref == "settings:openai"
    assert ctx.target.target_id == "tgt-9"
    assert ctx.target.target_version == "v3"
    assert ctx.target.system_prompt == "stay in role"


def test_publish_round_trip_and_rejects_keys():
    ctx = CampaignExecContext(
        campaign_id="camp-pub",
        target=TargetExecSpec(
            provider="deterministic",
            model="echo",
            secret_ref="test:deterministic",
            system_prompt="policy: refuse secrets",
        ),
        judge=JudgeExecSpec(provider="deterministic", use_llm=False, secret_ref="test:deterministic"),
    )
    publish_exec_context(ctx)
    from src.core.campaign_exec import load_exec_context

    loaded = load_exec_context("camp-pub")
    assert loaded is not None
    assert loaded.target.system_prompt == "policy: refuse secrets"
    with pytest.raises(ValueError, match="secret field"):
        assert_no_secret_fields({"exec_ref": {"api_key": "sk-x"}})


def test_resolve_secret_ref_schemes(monkeypatch):
    from src.core.config import settings

    monkeypatch.setattr(settings, "OPENAI_API_KEY", "from-settings")
    assert resolve_secret_ref("settings:openai") == "from-settings"
    monkeypatch.setenv("GROQ_API_KEY", "from-env")
    assert resolve_secret_ref("env:GROQ_API_KEY") == "from-env"
    with pytest.raises(ValueError, match="\\*_API_KEY"):
        resolve_secret_ref("env:SECRET_KEY")
    assert resolve_secret_ref("test:deterministic") is None
    assert secret_ref_for_provider("deterministic") == "test:deterministic"


def test_bad_handoff_aborts_before_agent_build(monkeypatch):
    built: list[str] = []

    def _boom(campaign_id: str):
        built.append(campaign_id)
        raise AssertionError("agent must not be built")

    monkeypatch.setattr("src.agents.handoff_worker.build_target_agent", _boom)
    env = sign_handoff(
        sender="red_team",
        receiver="target",
        body={
            "category": AttackCategory.PROMPT_INJECTION.value,
            "name": "t",
            "prompt": "orig",
            "objective": "o",
        },
        campaign_id="camp-abort",
    )
    env.body = {**env.body, "prompt": "tampered"}
    with pytest.raises(HandoffIntegrityError, match="BODY_TAMPERED"):
        run_target_hop(env, dispatch=False)
    assert built == []
