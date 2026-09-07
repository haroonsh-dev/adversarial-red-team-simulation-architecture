"""HMAC-signed agent handoffs: verify, replay, tamper, audit."""

import time

import pytest
from src.agents.handoff_worker import run_judge_hop, run_target_hop
from src.agents.judge_agent import JudgeAgent
from src.agents.target_agent import TargetAgent
from src.core.hmac_handoff import (
    NONCE_PREFIX,
    HandoffIntegrityError,
    nonce_digest,
    receive_handoff,
    sign_handoff,
    verify_handoff,
)
from src.core.models.hops import HmacState
from src.data.hmac_audit_store import clear_handoff_audits, recent_handoff_audits
from src.data.redis_client import get_redis_stream_client, reset_redis_client
from src.models import AttackCategory, AttackPayload, CampaignConfig
from src.orchestrator.campaign_manager import CampaignManager


def _attack_body(**overrides) -> dict:
    body = {
        "category": AttackCategory.PROMPT_INJECTION.value,
        "name": "hmac-probe",
        "prompt": "hello target",
        "objective": "prove signed hop",
    }
    body.update(overrides)
    return body


@pytest.fixture(autouse=True)
def _reset_replay_store():
    reset_redis_client()
    clear_handoff_audits()
    yield
    reset_redis_client()
    clear_handoff_audits()


def test_sign_and_verify_round_trip():
    env = sign_handoff(
        sender="red_team",
        receiver="target",
        body={"prompt": "hello", "id": "a1"},
        campaign_id="c1",
        round_id=3,
    )
    opened = verify_handoff(env, expected_sender="red_team", expected_receiver="target")
    assert opened.body["prompt"] == "hello"
    assert opened.nonce
    assert opened.signature


def test_tampered_body_is_rejected():
    env = sign_handoff(
        sender="red_team",
        receiver="target",
        body={"prompt": "original"},
        campaign_id="c1",
    )
    env.body = {"prompt": "tampered"}
    with pytest.raises(HandoffIntegrityError, match="BODY_TAMPERED"):
        verify_handoff(env, expected_sender="red_team", expected_receiver="target")


def test_invalid_signature_is_rejected():
    env = sign_handoff(
        sender="red_team",
        receiver="target",
        body={"prompt": "x"},
        campaign_id="c1",
    )
    env.signature = "00" * 32
    with pytest.raises(HandoffIntegrityError, match="INVALID_SIGNATURE"):
        verify_handoff(env, expected_sender="red_team", expected_receiver="target")


def test_replayed_nonce_is_rejected():
    env = sign_handoff(
        sender="target",
        receiver="judge",
        body={"verdict": "BLOCKED"},
        campaign_id="c1",
        round_id=2,
    )
    verify_handoff(env, expected_sender="target", expected_receiver="judge")
    client = get_redis_stream_client()
    digest_key = f"{NONCE_PREFIX}{nonce_digest(env.nonce)}"
    assert digest_key in getattr(client, "_kv", {})
    assert env.nonce not in getattr(client, "_kv", {})
    with pytest.raises(HandoffIntegrityError, match="REPLAYED_HANDOFF"):
        verify_handoff(env, expected_sender="target", expected_receiver="judge")


def test_expired_handoff_is_rejected(monkeypatch):
    real_now = time.time()
    monkeypatch.setattr("src.core.hmac_handoff.time.time", lambda: real_now - 10_000)
    env = sign_handoff(
        sender="red_team",
        receiver="target",
        body={"prompt": "stale"},
        campaign_id="c1",
    )
    monkeypatch.setattr("src.core.hmac_handoff.time.time", lambda: real_now)
    with pytest.raises(HandoffIntegrityError, match="EXPIRED"):
        verify_handoff(env, expected_sender="red_team", expected_receiver="target")


def test_wrong_peer_is_rejected():
    env = sign_handoff(
        sender="red_team",
        receiver="target",
        body={"prompt": "x"},
        campaign_id="c1",
    )
    with pytest.raises(HandoffIntegrityError, match="WRONG_PEER"):
        verify_handoff(env, expected_sender="red_team", expected_receiver="judge")


def test_campaign_open_handoff_persists_ok_audit():
    mgr = object.__new__(CampaignManager)
    mgr.config = CampaignConfig(id="camp-audit", name="hmac")
    body, meta = mgr._open_handoff(
        sender="red_team",
        receiver="target",
        body={"prompt": "signed", "id": "p1"},
        round_idx=1,
    )
    assert body["prompt"] == "signed"
    assert meta["hmac_state"] == HmacState.OK.value
    assert meta["hmac_verified"] is True
    audits = recent_handoff_audits()
    assert audits
    assert audits[0]["verification_result"] == "OK"
    assert audits[0]["hmac_state"] == "ok"


def test_campaign_open_handoff_fail_closed_on_bad_signature(monkeypatch):
    mgr = object.__new__(CampaignManager)
    mgr.config = CampaignConfig(id="camp-fail", name="hmac")

    def _boom(*_args, **_kwargs):
        raise HandoffIntegrityError("INVALID_SIGNATURE", sender="red_team", receiver="target")

    monkeypatch.setattr("src.core.hmac_handoff.verify_handoff", _boom)
    with pytest.raises(HandoffIntegrityError, match="INVALID_SIGNATURE"):
        mgr._open_handoff(
            sender="red_team",
            receiver="target",
            body={"prompt": "x"},
            round_idx=1,
        )
    audits = recent_handoff_audits()
    assert audits
    assert audits[0]["hmac_state"] == "fail"
    assert audits[0]["containment_result"] == "CAMPAIGN_ABORTED"
    assert audits[0]["verification_result"] == "INVALID_SIGNATURE"


def test_audit_persist_attempted_outside_testing(monkeypatch):
    from src.core.config import settings
    from src.core.hmac_handoff import audit_from_envelope, sign_handoff
    from src.data import hmac_audit_store

    persisted: dict = {}

    def _fake_persist(row):
        persisted["row"] = row

    monkeypatch.setattr(settings, "ENVIRONMENT", "development")
    monkeypatch.setattr(hmac_audit_store, "_persist_sync", _fake_persist)
    env = sign_handoff(
        sender="red_team",
        receiver="target",
        body={"prompt": "secret-payload", "id": "p1"},
        campaign_id="c-persist",
    )
    hmac_audit_store.record_handoff_audit(
        audit_from_envelope(env, hmac_state=HmacState.OK, verification_result="OK")
    )
    row = persisted["row"]
    assert row["hmac_state"] == "ok"
    assert row["body_sha256"] == env.body_sha256
    assert row["nonce_sha256"] == nonce_digest(env.nonce)
    assert env.nonce not in str(row)
    assert "secret-payload" not in str(row)
    assert "body" not in row
    assert "nonce" not in row or row.get("nonce") is None


def test_production_audit_persist_failure_is_fail_closed(monkeypatch):
    from src.core.config import settings
    from src.core.hmac_handoff import audit_from_envelope, sign_handoff
    from src.data import hmac_audit_store

    def _boom(_row):
        raise RuntimeError("db down")

    env = sign_handoff(
        sender="target",
        receiver="judge",
        body={"verdict": "BLOCKED"},
        campaign_id="c-fail-persist",
    )
    monkeypatch.setattr(settings, "ENVIRONMENT", "production")
    monkeypatch.setattr(hmac_audit_store, "_persist_sync", _boom)
    with pytest.raises(RuntimeError, match="db down"):
        hmac_audit_store.record_handoff_audit(
            audit_from_envelope(env, hmac_state=HmacState.OK, verification_result="OK")
        )


def test_malformed_envelope_is_audited():
    with pytest.raises(HandoffIntegrityError, match="MALFORMED_ENVELOPE"):
        receive_handoff(
            {"sender": "red_team", "body": {"prompt": "drop-table-secret"}},
            expected_sender="red_team",
            expected_receiver="target",
        )
    audits = recent_handoff_audits()
    assert audits
    assert audits[0]["verification_result"] == "MALFORMED_ENVELOPE"
    assert audits[0]["hmac_state"] == "fail"
    assert "drop-table-secret" not in str(audits[0])
    assert "nonce" not in audits[0]


def test_target_and_judge_agents_verify_on_receive():
    env = sign_handoff(
        sender="red_team",
        receiver="target",
        body={"prompt": "signed-for-target"},
        campaign_id="c-agent",
    )
    opened = object.__new__(TargetAgent).receive_signed(env)
    assert opened.body["prompt"] == "signed-for-target"
    judge_env = sign_handoff(
        sender="target",
        receiver="judge",
        body={"attack": {"prompt": "x"}, "response": {"blocked": True}},
        campaign_id="c-agent",
    )
    judged = object.__new__(JudgeAgent).receive_signed(judge_env)
    assert judged.receiver == "judge"


def test_target_hop_verifies_processes_and_signs_for_judge():
    env = sign_handoff(
        sender="red_team",
        receiver="target",
        body=_attack_body(),
        campaign_id="c-hop",
        round_id=1,
    )
    result = run_target_hop(env, dispatch=False)
    assert result["ok"] is True
    assert result["hmac_meta"]["hmac_verified"] is True
    assert result["response"]["blocked"] is True
    judge_env = result["judge_envelope"]
    assert judge_env["sender"] == "target"
    assert judge_env["receiver"] == "judge"
    judged = run_judge_hop(judge_env, dispatch=False)
    assert judged["ok"] is True
    assert judged["hmac_meta"]["sender"] == "target"
    assert judged["score"]["verdict"] == "BLOCKED"


def test_campaign_target_hop_does_not_sign_as_target(monkeypatch):
    senders: list[str] = []
    real = sign_handoff

    def _wrap(**kwargs):
        senders.append(kwargs["sender"])
        return real(**kwargs)

    monkeypatch.setattr("src.orchestrator.campaign_manager.sign_handoff", _wrap)
    mgr = object.__new__(CampaignManager)
    mgr.config = CampaignConfig(id="c-no-impersonate", name="hmac")
    mgr.target_agent = None
    hop = mgr._target_hop(AttackPayload.model_validate(_attack_body()), 1)
    assert senders == ["red_team"]
    assert hop["judge_envelope"]["sender"] == "target"


def test_campaign_judge_hop_aborts_wrong_peer():
    mgr = object.__new__(CampaignManager)
    mgr.config = CampaignConfig(id="c-peer", name="hmac")
    mgr.judge = None
    env = sign_handoff(
        sender="red_team",
        receiver="target",
        body=_attack_body(),
        campaign_id="c-peer",
    )
    with pytest.raises(HandoffIntegrityError, match="WRONG_PEER"):
        mgr._judge_hop(env.model_dump(mode="json"), 1)
    audits = recent_handoff_audits()
    assert audits
    assert audits[0]["verification_result"] == "WRONG_PEER"
    assert audits[0]["containment_result"] == "CAMPAIGN_ABORTED"


def test_replay_of_agent_receive_is_rejected():
    env = sign_handoff(
        sender="red_team",
        receiver="target",
        body={"prompt": "once"},
        campaign_id="c-once",
    )
    object.__new__(TargetAgent).receive_signed(env)
    with pytest.raises(HandoffIntegrityError, match="REPLAYED_HANDOFF"):
        object.__new__(TargetAgent).receive_signed(env)
