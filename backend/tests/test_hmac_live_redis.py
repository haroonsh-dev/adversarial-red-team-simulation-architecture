"""Live Redis integration: HMAC hops across independent OS processes."""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import time
import uuid
from collections.abc import Iterator
from pathlib import Path

import pytest
from src.core.config import settings
from src.core.hmac_handoff import sign_handoff
from src.data.orm import HmacHandoffAuditORM
from src.data.redis_client import probe_live_redis
from src.models import AttackCategory

BACKEND_DIR = Path(__file__).resolve().parents[1]
_DEFAULT_LIVE_URL = "redis://127.0.0.1:6379/15"
_DOCKER_LIVE_URL = "redis://127.0.0.1:16379/15"


def _ping(url: str) -> bool:
    try:
        probe_live_redis(url).ping()
    except Exception:
        return False
    return True


def _candidate_urls() -> list[str]:
    explicit = (os.environ.get("ARTSA_TEST_REDIS_URL") or "").strip()
    urls: list[str] = []
    if explicit and explicit.lower() not in {"memory", "none"}:
        urls.append(explicit)
    urls.append(_DEFAULT_LIVE_URL)
    urls.append(_DOCKER_LIVE_URL)
    return list(dict.fromkeys(urls))


def _start_binary_redis() -> tuple[str, subprocess.Popen] | None:
    binary = shutil.which("redis-server") or "/opt/homebrew/opt/redis/bin/redis-server"
    if not Path(binary).exists():
        return None
    proc = subprocess.Popen(
        [binary, "--port", "16379", "--save", "", "--appendonly", "no", "--protected-mode", "no"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    for _ in range(40):
        if _ping(_DOCKER_LIVE_URL):
            return _DOCKER_LIVE_URL, proc
        if proc.poll() is not None:
            return None
        time.sleep(0.25)
    proc.terminate()
    return None


def _start_docker_redis() -> str | None:
    docker = shutil.which("docker")
    if not docker:
        return None
    name = f"artsa-hmac-itest-{uuid.uuid4().hex[:8]}"
    run = subprocess.run(
        [
            docker,
            "run",
            "-d",
            "--rm",
            "--name",
            name,
            "-p",
            "16379:6379",
            "redis:7-alpine",
        ],
        capture_output=True,
        text=True,
        check=False,
    )
    if run.returncode != 0:
        return None
    for _ in range(40):
        if _ping(_DOCKER_LIVE_URL):
            os.environ["_ARTSA_HMAC_ITEST_CONTAINER"] = name
            return _DOCKER_LIVE_URL
        time.sleep(0.25)
    subprocess.run([docker, "rm", "-f", name], capture_output=True, check=False)
    return None


@pytest.fixture(scope="module")
def live_redis_url() -> Iterator[str]:
    for url in _candidate_urls():
        if _ping(url):
            yield url
            return
    started_bin = _start_binary_redis()
    if started_bin is not None:
        url, proc = started_bin
        try:
            yield url
        finally:
            proc.terminate()
            proc.wait(timeout=5)
        return
    started = _start_docker_redis()
    if started is None:
        pytest.skip("live Redis is not reachable (set ARTSA_TEST_REDIS_URL, install redis-server, or allow Docker)")
    try:
        yield started
    finally:
        name = os.environ.pop("_ARTSA_HMAC_ITEST_CONTAINER", "")
        docker = shutil.which("docker")
        if name and docker:
            subprocess.run([docker, "rm", "-f", name], capture_output=True, check=False)


@pytest.fixture
def audit_db(tmp_path: Path) -> Path:
    path = tmp_path / "hmac_audit.db"
    from sqlalchemy import create_engine

    engine = create_engine(f"sqlite:///{path}")
    HmacHandoffAuditORM.metadata.create_all(engine)
    engine.dispose()
    return path


def _attack_body(**overrides) -> dict:
    body = {
        "category": AttackCategory.PROMPT_INJECTION.value,
        "name": "live-hmac",
        "prompt": "cross-process hop",
        "objective": "prove agent-boundary HMAC",
    }
    body.update(overrides)
    return body


def _worker_env(url: str, audit_db: Path | None = None) -> dict[str, str]:
    env = os.environ.copy()
    env["ENVIRONMENT"] = "development"
    env["REDIS_URL"] = url
    env["ARTSA_REQUIRE_AUTH"] = "false"
    env["ARTSA_HMAC_RECEIVER_WORKERS"] = "false"
    secret = (settings.ARTSA_HMAC_HANDOFF_SECRET or settings.SECRET_KEY or "").strip()
    env["SECRET_KEY"] = secret
    env["ARTSA_HMAC_HANDOFF_SECRET"] = secret
    env["PYTHONPATH"] = str(BACKEND_DIR) + os.pathsep + env.get("PYTHONPATH", "")
    if audit_db is not None:
        env["SYNC_DATABASE_URL"] = f"sqlite:///{audit_db}"
    return env


def _run_worker(
    url: str,
    role: str,
    envelope: dict,
    *,
    command: str = "receive",
    audit_db: Path | None = None,
) -> dict:
    proc = subprocess.run(
        [sys.executable, "-m", "src.agents.handoff_worker", command, "--role", role],
        input=json.dumps(envelope),
        capture_output=True,
        text=True,
        cwd=str(BACKEND_DIR),
        env=_worker_env(url, audit_db),
        timeout=30,
        check=False,
    )
    if proc.returncode != 0:
        pytest.fail(f"worker process failed: {proc.stderr or proc.stdout}")
    return json.loads(proc.stdout)


def _run_receiver(url: str, role: str, envelope: dict) -> dict:
    return _run_worker(url, role, envelope, command="receive")


def _load_audits(db_path: Path) -> list[HmacHandoffAuditORM]:
    from sqlalchemy import create_engine, select
    from sqlalchemy.orm import sessionmaker

    engine = create_engine(f"sqlite:///{db_path}")
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    with factory() as session:
        rows = list(session.scalars(select(HmacHandoffAuditORM)))
    engine.dispose()
    return rows


@pytest.mark.integration
def test_hmac_replay_rejected_across_two_live_redis_processes(live_redis_url: str):
    envelope = sign_handoff(
        sender="red_team",
        receiver="target",
        body={"prompt": "cross-process", "id": "cp-1"},
        campaign_id="c-live-redis",
        round_id=1,
    ).model_dump(mode="json")

    first = _run_receiver(live_redis_url, "target", envelope)
    assert first["ok"] is True
    assert first["event_id"] == envelope["event_id"]

    second = _run_receiver(live_redis_url, "target", envelope)
    assert second["ok"] is False
    assert second["reason"] == "REPLAYED_HANDOFF"


@pytest.mark.integration
def test_hmac_agent_boundary_valid_handoffs_succeed(
    live_redis_url: str, audit_db: Path
):
    envelope = sign_handoff(
        sender="red_team",
        receiver="target",
        body=_attack_body(),
        campaign_id="c-boundary-ok",
        round_id=1,
    ).model_dump(mode="json")

    target = _run_worker(
        live_redis_url, "target", envelope, command="execute", audit_db=audit_db
    )
    assert target["ok"] is True
    assert target["hmac_meta"]["hmac_verified"] is True
    assert target["judge_envelope"]["sender"] == "target"
    assert target["judge_envelope"]["receiver"] == "judge"

    judge = _run_worker(
        live_redis_url,
        "judge",
        target["judge_envelope"],
        command="execute",
        audit_db=audit_db,
    )
    assert judge["ok"] is True
    assert judge["hmac_meta"]["sender"] == "target"
    assert judge["score"]["verdict"] == "BLOCKED"

    rows = _load_audits(audit_db)
    results = {row.verification_result for row in rows}
    assert "OK" in results
    assert all(row.hmac_state == "ok" for row in rows)


@pytest.mark.integration
def test_hmac_agent_boundary_replay_rejected_by_second_process(
    live_redis_url: str, audit_db: Path
):
    envelope = sign_handoff(
        sender="red_team",
        receiver="target",
        body=_attack_body(prompt="replay-me"),
        campaign_id="c-boundary-replay",
        round_id=2,
    ).model_dump(mode="json")

    first = _run_worker(
        live_redis_url, "target", envelope, command="execute", audit_db=audit_db
    )
    assert first["ok"] is True

    second = _run_worker(
        live_redis_url, "target", envelope, command="execute", audit_db=audit_db
    )
    assert second["ok"] is False
    assert second["reason"] == "REPLAYED_HANDOFF"

    rows = _load_audits(audit_db)
    assert any(row.verification_result == "OK" for row in rows)
    replay = [row for row in rows if row.verification_result == "REPLAYED_HANDOFF"]
    assert replay
    assert replay[0].hmac_state == "fail"
    assert replay[0].replay_detected is True
    assert replay[0].containment_result == "CAMPAIGN_ABORTED"


@pytest.mark.integration
def test_hmac_agent_boundary_tamper_peer_expiry_abort_and_audit(
    live_redis_url: str, audit_db: Path, monkeypatch
):
    valid = sign_handoff(
        sender="red_team",
        receiver="target",
        body=_attack_body(),
        campaign_id="c-boundary-fail",
        round_id=3,
    )

    tampered = valid.model_dump(mode="json")
    tampered["body"] = {**tampered["body"], "prompt": "tampered-prompt"}
    tamper_result = _run_worker(
        live_redis_url, "target", tampered, command="execute", audit_db=audit_db
    )
    assert tamper_result["ok"] is False
    assert tamper_result["reason"] == "BODY_TAMPERED"

    peer = valid.model_dump(mode="json")
    peer_result = _run_worker(
        live_redis_url, "judge", peer, command="execute", audit_db=audit_db
    )
    assert peer_result["ok"] is False
    assert peer_result["reason"] == "WRONG_PEER"

    real_now = time.time()
    monkeypatch.setattr("src.core.hmac_handoff.time.time", lambda: real_now - 10_000)
    stale = sign_handoff(
        sender="red_team",
        receiver="target",
        body=_attack_body(prompt="stale"),
        campaign_id="c-boundary-fail",
        round_id=4,
    )
    monkeypatch.undo()
    expired_result = _run_worker(
        live_redis_url,
        "target",
        stale.model_dump(mode="json"),
        command="execute",
        audit_db=audit_db,
    )
    assert expired_result["ok"] is False
    assert expired_result["reason"] == "EXPIRED"

    rows = _load_audits(audit_db)
    reasons = {row.verification_result for row in rows}
    assert {"BODY_TAMPERED", "WRONG_PEER", "EXPIRED"} <= reasons
    for row in rows:
        assert row.hmac_state == "fail"
        assert row.containment_result == "CAMPAIGN_ABORTED"
        assert "tampered-prompt" not in (row.body_sha256 or "")
        assert row.nonce_sha256
        assert len(row.nonce_sha256) == 64


def _start_serve(url: str, role: str, audit_db: Path) -> subprocess.Popen:
    proc = subprocess.Popen(
        [sys.executable, "-m", "src.agents.handoff_worker", "serve", "--role", role],
        cwd=str(BACKEND_DIR),
        env=_worker_env(url, audit_db),
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
        text=True,
    )
    return proc


@pytest.mark.integration
def test_campaign_sends_envelopes_to_live_redis_workers_and_aborts(
    live_redis_url: str, audit_db: Path, monkeypatch
):
    """CampaignManager LPUSHes to Target/Judge serve processes; HMAC failure aborts."""
    from src.agents.handoff_worker import run_target_hop
    from src.core.hmac_handoff import HandoffIntegrityError
    from src.models import AttackPayload, CampaignConfig
    from src.orchestrator.campaign_manager import CampaignManager

    live = probe_live_redis(live_redis_url)
    monkeypatch.setattr("src.agents.handoff_worker.get_redis_stream_client", lambda: live)
    monkeypatch.setattr(settings, "ARTSA_HMAC_RECEIVER_WORKERS", True)
    monkeypatch.setattr(settings, "ARTSA_HMAC_WORKER_TIMEOUT_SEC", 2)

    workers = [
        _start_serve(live_redis_url, "target", audit_db),
        _start_serve(live_redis_url, "judge", audit_db),
    ]
    try:
        for proc in workers:
            if proc.poll() is not None:
                err = proc.stderr.read() if proc.stderr else ""
                pytest.fail(f"serve worker exited early: {err}")

        mgr = object.__new__(CampaignManager)
        mgr.config = CampaignConfig(id="c-live-workers", name="hmac")
        mgr.target_agent = None
        mgr.judge = None

        hop = None
        last_exc: Exception | None = None
        for _ in range(20):
            try:
                hop = mgr._target_hop(AttackPayload.model_validate(_attack_body()), 1)
                break
            except HandoffIntegrityError as exc:
                if exc.reason != "RECEIVER_TIMEOUT":
                    raise
                last_exc = exc
                time.sleep(0.5)
        if hop is None:
            raise last_exc or AssertionError("Target worker never accepted the envelope")

        assert hop["ok"] is True
        assert hop["hmac_meta"]["receiver_process"] == "worker"
        assert hop["judge_envelope"]["sender"] == "target"

        judged = mgr._judge_hop(hop["judge_envelope"], 1)
        assert judged["ok"] is True
        assert judged["hmac_meta"]["receiver_process"] == "worker"
        assert judged["score"]["verdict"] == "BLOCKED"

        tampered = sign_handoff(
            sender="red_team",
            receiver="target",
            body=_attack_body(prompt="orig"),
            campaign_id="c-live-workers",
            round_id=2,
        ).model_dump(mode="json")
        tampered["body"] = {**tampered["body"], "prompt": "tampered-prompt"}
        with pytest.raises(HandoffIntegrityError, match="BODY_TAMPERED"):
            run_target_hop(tampered, dispatch=True)

        rows = _load_audits(audit_db)
        results = {row.verification_result for row in rows}
        assert "OK" in results
        assert "BODY_TAMPERED" in results
        fail = next(row for row in rows if row.verification_result == "BODY_TAMPERED")
        assert fail.hmac_state == "fail"
        assert fail.containment_result == "CAMPAIGN_ABORTED"
    finally:
        for proc in workers:
            proc.terminate()
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()


@pytest.mark.integration
def test_worker_mode_runs_configured_target_not_stub(live_redis_url: str, audit_db: Path, monkeypatch, tmp_path: Path):
    """Worker loads exec context, runs TargetAgent, and HMAC failure never calls the model."""
    from src.agents.handoff_worker import run_target_hop
    from src.core.campaign_exec import (
        DETERMINISTIC_RESPONSE,
        CampaignExecContext,
        JudgeExecSpec,
        TargetExecSpec,
        publish_exec_context,
    )
    from src.core.hmac_handoff import HandoffIntegrityError
    from src.models import AttackPayload, CampaignConfig, GuardrailConfig
    from src.orchestrator.campaign_manager import CampaignManager

    call_log = tmp_path / "llm_calls.log"
    monkeypatch.setenv("ARTSA_TEST_LLM_CALL_LOG", str(call_log))
    live = probe_live_redis(live_redis_url)
    monkeypatch.setattr("src.data.redis_client.get_redis_stream_client", lambda: live)
    monkeypatch.setattr("src.agents.handoff_worker.get_redis_stream_client", lambda: live)
    monkeypatch.setattr(settings, "ARTSA_HMAC_RECEIVER_WORKERS", True)
    monkeypatch.setattr(settings, "ARTSA_HMAC_WORKER_TIMEOUT_SEC", 2)

    campaign_id = "c-real-target"
    ctx = CampaignExecContext(
        campaign_id=campaign_id,
        target=TargetExecSpec(
            target_id="tgt-configured",
            target_version="v7",
            provider="deterministic",
            model="echo",
            secret_ref="test:deterministic",
            system_prompt="You are the registered target. Follow policy.",
            guardrails=GuardrailConfig(
                input_content_filter=False,
                input_injection_detector=False,
                output_toxicity_filter=False,
                output_pii_redactor=False,
            ),
        ),
        judge=JudgeExecSpec(
            provider="deterministic",
            model="echo",
            use_llm=False,
            secret_ref="test:deterministic",
        ),
    )
    publish_exec_context(ctx)

    workers = [
        _start_serve(live_redis_url, "target", audit_db),
        _start_serve(live_redis_url, "judge", audit_db),
    ]
    try:
        mgr = object.__new__(CampaignManager)
        mgr.config = CampaignConfig(id=campaign_id, name="real-agent")
        mgr.target_agent = None
        mgr.judge = None

        hop = None
        last_exc: Exception | None = None
        for _ in range(20):
            try:
                hop = mgr._target_hop(AttackPayload.model_validate(_attack_body()), 1)
                break
            except HandoffIntegrityError as exc:
                if exc.reason != "RECEIVER_TIMEOUT":
                    raise
                last_exc = exc
                time.sleep(0.5)
        if hop is None:
            raise last_exc or AssertionError("Target worker never processed the envelope")

        assert hop["ok"] is True
        assert hop["response"]["response"] == DETERMINISTIC_RESPONSE
        assert "[HMAC WORKER STUB]" not in hop["response"]["response"]
        assert hop["hmac_meta"]["receiver_process"] == "worker"
        judged = mgr._judge_hop(hop["judge_envelope"], 1)
        assert judged["ok"] is True

        after_ok = call_log.read_text() if call_log.exists() else ""
        assert "invoke" in after_ok

        tampered = sign_handoff(
            sender="red_team",
            receiver="target",
            body=_attack_body(prompt="orig"),
            campaign_id=campaign_id,
            round_id=9,
        ).model_dump(mode="json")
        tampered["body"] = {**tampered["body"], "prompt": "tampered-prompt"}
        with pytest.raises(HandoffIntegrityError, match="BODY_TAMPERED"):
            run_target_hop(tampered, dispatch=True)
        after_fail = call_log.read_text() if call_log.exists() else ""
        assert after_fail == after_ok
    finally:
        for proc in workers:
            proc.terminate()
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()


@pytest.mark.integration
def test_set_nx_only_one_winner_across_two_processes(live_redis_url: str):
    race_key = f"artsa:hmac:nonce:itest-{uuid.uuid4().hex}"
    script = (
        "import sys, os\n"
        "os.environ['ENVIRONMENT']='development'\n"
        "from src.data.redis_client import LiveRedisClient\n"
        "ok = LiveRedisClient(sys.argv[1]).set_nx(sys.argv[2], '1', ttl_sec=30)\n"
        "print('1' if ok else '0')\n"
    )
    env = os.environ.copy()
    env["ENVIRONMENT"] = "development"
    env["PYTHONPATH"] = str(BACKEND_DIR) + os.pathsep + env.get("PYTHONPATH", "")
    procs = [
        subprocess.Popen(
            [sys.executable, "-c", script, live_redis_url, race_key],
            cwd=str(BACKEND_DIR),
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        for _ in range(2)
    ]
    results = []
    for proc in procs:
        out, err = proc.communicate(timeout=15)
        assert proc.returncode == 0, err
        results.append(out.strip())
    assert sorted(results) == ["0", "1"]
