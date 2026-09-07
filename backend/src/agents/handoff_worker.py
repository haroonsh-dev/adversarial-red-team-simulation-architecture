"""HMAC Target / Judge workers — verification happens at the agent boundary.

Sequence:
  Red Team signs an envelope and sends it to the Target worker.
  Target verifies (Redis replay protection), processes, then signs a response
  envelope for the Judge. Judge verifies that envelope before scoring.

``python -m src.agents.handoff_worker execute --role target|judge`` is the
independent-process entrypoint. ``serve`` BRPOPs Redis inboxes when
``ARTSA_HMAC_RECEIVER_WORKERS`` is enabled.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from typing import Any

from pydantic import ValidationError

from src.core.campaign_exec import (
    assert_no_secret_fields,
    build_judge_agent,
    build_target_agent,
)
from src.core.config import settings
from src.core.hmac_handoff import (
    HandoffIntegrityError,
    SignedHandoff,
    nonce_digest,
    receive_handoff,
    sign_handoff,
)
from src.data.redis_client import get_redis_stream_client, redis_is_live

INBOX_PREFIX = "artsa:handoff:inbox:"
REPLY_PREFIX = "artsa:handoff:reply:"
PEER_OF = {"target": "red_team", "judge": "target"}


def accept_envelope(
    role: str,
    envelope: SignedHandoff | dict[str, Any],
    *,
    receiver_process: str = "in_process",
) -> SignedHandoff:
    """Verify on the named receiver. Research/Curator/Defender are not valid roles."""
    if role not in PEER_OF:
        raise HandoffIntegrityError("WRONG_PEER", receiver=role)
    return receive_handoff(
        envelope,
        expected_sender=PEER_OF[role],
        expected_receiver=role,
        containment_on_fail="CAMPAIGN_ABORTED",
        receiver_process=receiver_process,
    )


def _hop_meta(opened: SignedHandoff, *, receiver_process: str) -> dict[str, Any]:
    return {
        "sender": opened.sender,
        "receiver": opened.receiver,
        "hmac_state": "ok",
        "hmac_verified": True,
        "replay_detected": False,
        "nonce_sha256": nonce_digest(opened.nonce),
        "event_id": opened.event_id,
        "verification_result": "OK",
        "receiver_process": receiver_process,
    }


def _stub_target_response(prompt: str):
    from src.models import TargetResponse

    del prompt
    return TargetResponse(
        response="[HMAC WORKER STUB]",
        blocked=True,
        blocked_by="hmac_worker_stub",
        bypass_depth=0,
    )


def _coerce_history(history: Any) -> list[dict[str, str]] | None:
    if not history:
        return None
    if isinstance(history, list) and history and isinstance(history[0], str):
        return [{"role": "assistant", "content": item} for item in history if item]
    if isinstance(history, list):
        return [item for item in history if isinstance(item, dict)]
    return None


def run_target_hop(
    envelope: SignedHandoff | dict[str, Any],
    *,
    agent: Any = None,
    history: list[str] | None = None,
    dispatch: bool = True,
    receiver_process: str | None = None,
    extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Verify as Target, process the attack, sign Target → Judge.

    The orchestrator must not process the prompt or sign as Target.
    Worker mode loads TargetAgent from a key-free exec context after verify.
    """
    extra = dict(extra or {})
    if history is not None and "history" not in extra:
        extra["history"] = history
    if dispatch and settings.ARTSA_HMAC_RECEIVER_WORKERS:
        env = envelope if isinstance(envelope, SignedHandoff) else SignedHandoff.model_validate(envelope)
        extra.setdefault("exec_ref", {"campaign_id": env.campaign_id, "role": "target"})
        try:
            assert_no_secret_fields(extra)
        except ValueError as exc:
            raise HandoffIntegrityError("SECRET_ON_QUEUE", receiver="target") from exc
        return _queue_execute("target", envelope, extra=extra)

    process = receiver_process or "in_process"
    opened = accept_envelope("target", envelope, receiver_process=process)
    from src.models import AttackPayload

    try:
        payload = AttackPayload.model_validate(opened.body)
    except ValidationError as exc:
        raise HandoffIntegrityError("MALFORMED_BODY", sender="red_team", receiver="target") from exc

    hop_agent = agent
    if hop_agent is None:
        hop_agent = build_target_agent(opened.campaign_id)
    if hop_agent is None:
        response = _stub_target_response(payload.prompt)
    else:
        conv = _coerce_history(extra.get("history") or history)
        if conv:
            response = hop_agent.process_with_history(payload.prompt, conv)
        else:
            response = hop_agent.process(payload.prompt)

    judge_envelope = sign_handoff(
        sender="target",
        receiver="judge",
        body={
            "attack": payload.model_dump(mode="json"),
            "response": response.model_dump(mode="json"),
        },
        campaign_id=opened.campaign_id,
        round_id=opened.round_id,
    )
    return {
        "ok": True,
        "payload": payload.model_dump(mode="json"),
        "response": response.model_dump(mode="json"),
        "judge_envelope": judge_envelope.model_dump(mode="json"),
        "hmac_meta": _hop_meta(opened, receiver_process=process),
    }


def run_judge_hop(
    envelope: SignedHandoff | dict[str, Any],
    *,
    agent: Any = None,
    dispatch: bool = True,
    receiver_process: str | None = None,
    extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Verify as Judge, then score. The orchestrator must not score first."""
    extra = dict(extra or {})
    if dispatch and settings.ARTSA_HMAC_RECEIVER_WORKERS:
        env = envelope if isinstance(envelope, SignedHandoff) else SignedHandoff.model_validate(envelope)
        extra.setdefault("exec_ref", {"campaign_id": env.campaign_id, "role": "judge"})
        try:
            assert_no_secret_fields(extra)
        except ValueError as exc:
            raise HandoffIntegrityError("SECRET_ON_QUEUE", receiver="judge") from exc
        return _queue_execute("judge", envelope, extra=extra)

    process = receiver_process or "in_process"
    opened = accept_envelope("judge", envelope, receiver_process=process)
    from src.agents.judge_agent import JudgeAgent
    from src.models import AttackPayload, TargetResponse

    try:
        attack = AttackPayload.model_validate(opened.body["attack"])
        response = TargetResponse.model_validate(opened.body["response"])
    except (ValidationError, KeyError, TypeError) as exc:
        raise HandoffIntegrityError("MALFORMED_BODY", sender="target", receiver="judge") from exc
    hop_agent = agent if agent is not None else build_judge_agent(opened.campaign_id)
    judge = hop_agent or JudgeAgent({"use_llm": False})
    score = judge.evaluate(attack, response)
    return {
        "ok": True,
        "payload": attack.model_dump(mode="json"),
        "response": response.model_dump(mode="json"),
        "score": score.model_dump(mode="json"),
        "hmac_meta": _hop_meta(opened, receiver_process=process),
    }


def deliver_handoff(envelope: SignedHandoff) -> SignedHandoff:
    """Verify-only delivery (no process/score). Prefer run_target_hop / run_judge_hop."""
    if settings.ARTSA_HMAC_RECEIVER_WORKERS:
        raw = _queue_execute(envelope.receiver, envelope)
        if not raw.get("ok"):
            raise HandoffIntegrityError(
                str(raw.get("reason") or "RECEIVER_FAILED"),
                sender=envelope.sender,
                receiver=envelope.receiver,
            )
        if raw.get("envelope"):
            return SignedHandoff.model_validate(raw["envelope"])
        return envelope
    return accept_envelope(envelope.receiver, envelope, receiver_process="in_process")


def _queue_execute(
    role: str,
    envelope: SignedHandoff | dict[str, Any],
    extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    if settings.ENVIRONMENT == "production" and not redis_is_live():
        sender = envelope.sender if isinstance(envelope, SignedHandoff) else str(
            envelope.get("sender") or ""
        )
        raise HandoffIntegrityError("REDIS_UNAVAILABLE", sender=sender, receiver=role)
    client = get_redis_stream_client()
    payload = envelope.model_dump(mode="json") if isinstance(envelope, SignedHandoff) else dict(envelope)
    extra = extra or {}
    try:
        assert_no_secret_fields(extra)
    except ValueError as exc:
        raise HandoffIntegrityError("SECRET_ON_QUEUE", receiver=role) from exc
    event_id = str(payload.get("event_id") or "unknown")
    reply_key = f"{REPLY_PREFIX}{event_id}"
    payload["_reply_key"] = reply_key
    if extra:
        payload["_extra"] = extra
    client.lpush(f"{INBOX_PREFIX}{role}", json.dumps(payload))
    raw = client.brpop(reply_key, timeout=float(settings.ARTSA_HMAC_WORKER_TIMEOUT_SEC))
    if not raw:
        raise HandoffIntegrityError("RECEIVER_TIMEOUT", receiver=role)
    reply = json.loads(raw)
    if not reply.get("ok"):
        raise HandoffIntegrityError(str(reply.get("reason") or "RECEIVER_FAILED"), receiver=role)
    return reply


def serve_role(role: str) -> None:
    """Block on the Redis inbox and execute the Target or Judge hop in this process."""
    if role not in PEER_OF:
        raise SystemExit(f"unsupported role {role}")
    client = get_redis_stream_client()
    inbox = f"{INBOX_PREFIX}{role}"
    while True:
        raw = client.brpop(inbox, timeout=5)
        if not raw:
            continue
        msg = json.loads(raw)
        reply_key = msg.pop("_reply_key", None)
        extra = msg.pop("_extra", None) or {}
        try:
            if role == "target":
                result = run_target_hop(
                    msg,
                    dispatch=False,
                    receiver_process="worker",
                    extra=extra,
                    history=extra.get("history") or None,
                )
            else:
                result = run_judge_hop(
                    msg, dispatch=False, receiver_process="worker", extra=extra
                )
        except HandoffIntegrityError as exc:
            result = {"ok": False, "reason": exc.reason}
        if reply_key:
            client.lpush(reply_key, json.dumps(result))


def receive_once(role: str, envelope: dict[str, Any]) -> dict[str, Any]:
    """Verify-only one-shot (no process/score)."""
    try:
        opened = accept_envelope(role, envelope, receiver_process="worker")
        return {"ok": True, "envelope": opened.model_dump(mode="json"), "event_id": opened.event_id}
    except HandoffIntegrityError as exc:
        return {"ok": False, "reason": exc.reason}


def execute_once(role: str, envelope: dict[str, Any], extra: dict[str, Any] | None = None) -> dict[str, Any]:
    extra = extra or {}
    try:
        if role == "target":
            return run_target_hop(
                envelope,
                dispatch=False,
                receiver_process="worker",
                extra=extra,
                history=extra.get("history") or None,
            )
        return run_judge_hop(
            envelope, dispatch=False, receiver_process="worker", extra=extra
        )
    except HandoffIntegrityError as exc:
        return {"ok": False, "reason": exc.reason}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="ARTSA HMAC handoff receiver")
    parser.add_argument("command", choices=["receive", "execute", "serve"])
    parser.add_argument("--role", required=True, choices=sorted(PEER_OF))
    args = parser.parse_args(argv)

    if args.command == "serve":
        # Workers must not re-queue to themselves.
        os.environ["ARTSA_HMAC_RECEIVER_WORKERS"] = "false"
        settings.ARTSA_HMAC_RECEIVER_WORKERS = False
        serve_role(args.role)
        return 0

    raw = sys.stdin.read()
    envelope = json.loads(raw)
    extra = envelope.pop("_extra", None) if isinstance(envelope, dict) else None
    if args.command == "execute":
        json.dump(execute_once(args.role, envelope, extra), sys.stdout)
    else:
        json.dump(receive_once(args.role, envelope), sys.stdout)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
