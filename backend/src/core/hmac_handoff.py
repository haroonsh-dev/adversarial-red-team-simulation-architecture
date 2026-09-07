"""HMAC-SHA256 signed inter-agent handoffs with Redis replay protection.

Wired chain today: Red Team → Target → Judge.
Research / Curator / Defender remain unwired and must not receive fake signatures.

WebSocket tickets use a different key prefix — they are not agent handoffs.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
import secrets
import time
from typing import Any
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field, ValidationError

from src.core.config import settings
from src.core.models.hops import HmacState

logger = logging.getLogger(__name__)

HANDOFF_VERSION = 1
NONCE_PREFIX = "artsa:hmac:nonce:"


class HandoffIntegrityError(Exception):
    """Fail-closed: the receiver must not process this payload."""

    def __init__(self, reason: str, *, sender: str = "", receiver: str = "") -> None:
        self.reason = reason
        self.sender = sender
        self.receiver = receiver
        super().__init__(reason)


class SignedHandoff(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    version: int = HANDOFF_VERSION
    event_id: str = Field(default_factory=lambda: str(uuid4()))
    sender: str
    receiver: str
    campaign_id: str
    round_id: str | None = None
    timestamp: int
    nonce: str
    body_sha256: str
    signature: str
    body: dict[str, Any] = Field(default_factory=dict)


class HandoffAuditRecord(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    event_id: str
    timestamp: int
    sender: str
    receiver: str
    campaign_id: str
    round_id: str | None = None
    nonce_sha256: str
    body_sha256: str
    hmac_state: HmacState
    signature_status: str
    verification_result: str
    replay_detected: bool
    containment_result: str | None = None
    tenant_id: str | None = None
    receiver_process: str | None = None


def nonce_digest(nonce: str) -> str:
    """SHA-256 hex of a nonce. Audit/Redis keys store this, never the raw token."""
    return hashlib.sha256((nonce or "").encode("utf-8")).hexdigest()


def handoff_secret() -> str:
    """Dedicated handoff key, falling back to SECRET_KEY."""
    return (settings.ARTSA_HMAC_HANDOFF_SECRET or settings.SECRET_KEY or "").strip()


def signing_key_available() -> tuple[bool, str]:
    secret = handoff_secret()
    if not secret:
        return False, "missing"
    if settings.ENVIRONMENT == "production":
        if secret == "change-me-in-production" or len(secret) < 32:
            return False, "weak_or_default"
        return True, "ok"
    if len(secret) < 16:
        return False, "too_short"
    return True, "ok"


def _canonical_bytes(envelope: SignedHandoff) -> bytes:
    payload = {
        "version": envelope.version,
        "event_id": envelope.event_id,
        "sender": envelope.sender,
        "receiver": envelope.receiver,
        "campaign_id": envelope.campaign_id,
        "round_id": envelope.round_id,
        "timestamp": envelope.timestamp,
        "nonce": envelope.nonce,
        "body_sha256": envelope.body_sha256,
    }
    return json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")


def _sign_bytes(data: bytes) -> str:
    ok, detail = signing_key_available()
    if not ok:
        raise HandoffIntegrityError(f"MISSING_KEY:{detail}")
    digest = hmac.new(handoff_secret().encode("utf-8"), data, hashlib.sha256).digest()
    return digest.hex()


def _body_digest(body: dict[str, Any]) -> str:
    blob = json.dumps(body, separators=(",", ":"), sort_keys=True, default=str).encode("utf-8")
    return hashlib.sha256(blob).hexdigest()


def _consume_nonce(nonce: str, ttl_sec: int) -> bool:
    """Return True if this nonce is first-seen. False = replay."""
    from src.data.redis_client import get_redis_stream_client, redis_is_live

    if settings.ENVIRONMENT == "production" and not settings.is_testing and not redis_is_live():
        raise HandoffIntegrityError("REDIS_UNAVAILABLE")
    try:
        client = get_redis_stream_client()
    except Exception as exc:
        raise HandoffIntegrityError("REDIS_UNAVAILABLE") from exc
    key = f"{NONCE_PREFIX}{nonce_digest(nonce)}"
    return bool(client.set_nx(key, "1", ttl_sec=max(1, ttl_sec)))


def sign_handoff(
    *,
    sender: str,
    receiver: str,
    body: dict[str, Any],
    campaign_id: str,
    round_id: str | int | None = None,
) -> SignedHandoff:
    now = int(time.time())
    envelope = SignedHandoff(
        sender=sender,
        receiver=receiver,
        campaign_id=campaign_id,
        round_id=None if round_id is None else str(round_id),
        timestamp=now,
        nonce=secrets.token_urlsafe(16),
        body_sha256=_body_digest(body),
        signature="",
        body=body,
    )
    envelope.signature = _sign_bytes(_canonical_bytes(envelope))
    return envelope


def verify_handoff(
    envelope: SignedHandoff | dict[str, Any],
    *,
    expected_sender: str,
    expected_receiver: str,
) -> SignedHandoff:
    """Verify signature, peer, freshness, body digest, and nonce. Fail closed.

    Does not persist audit. Receivers must call ``receive_handoff`` so malformed
    envelopes are recorded too.
    """
    if not isinstance(envelope, SignedHandoff):
        try:
            opened = SignedHandoff.model_validate(envelope)
        except (ValidationError, TypeError, ValueError) as exc:
            raise HandoffIntegrityError("MALFORMED_ENVELOPE") from exc
    else:
        opened = envelope
    sender, receiver = opened.sender, opened.receiver

    if opened.sender != expected_sender or opened.receiver != expected_receiver:
        raise HandoffIntegrityError("WRONG_PEER", sender=sender, receiver=receiver)

    if opened.version != HANDOFF_VERSION:
        raise HandoffIntegrityError("UNSUPPORTED_VERSION", sender=sender, receiver=receiver)

    expected_sig = _sign_bytes(_canonical_bytes(opened))
    if not hmac.compare_digest(opened.signature, expected_sig):
        raise HandoffIntegrityError("INVALID_SIGNATURE", sender=sender, receiver=receiver)

    if _body_digest(opened.body) != opened.body_sha256:
        raise HandoffIntegrityError("BODY_TAMPERED", sender=sender, receiver=receiver)

    now = int(time.time())
    ttl = int(settings.ARTSA_HMAC_HANDOFF_TTL_SEC)
    skew = int(settings.ARTSA_HMAC_HANDOFF_MAX_SKEW_SEC)
    if opened.timestamp > now + skew or now - opened.timestamp > ttl:
        raise HandoffIntegrityError("EXPIRED", sender=sender, receiver=receiver)

    if not _consume_nonce(opened.nonce, ttl + skew):
        raise HandoffIntegrityError("REPLAYED_HANDOFF", sender=sender, receiver=receiver)

    return opened


def audit_from_envelope(
    envelope: SignedHandoff,
    *,
    hmac_state: HmacState,
    verification_result: str,
    replay_detected: bool = False,
    containment_result: str | None = None,
    tenant_id: str | None = None,
    receiver_process: str | None = None,
) -> HandoffAuditRecord:
    return HandoffAuditRecord(
        event_id=envelope.event_id,
        timestamp=envelope.timestamp,
        sender=envelope.sender,
        receiver=envelope.receiver,
        campaign_id=envelope.campaign_id,
        round_id=envelope.round_id,
        nonce_sha256=nonce_digest(envelope.nonce),
        body_sha256=envelope.body_sha256,
        hmac_state=hmac_state,
        signature_status="verified" if hmac_state == HmacState.OK else "failed",
        verification_result=verification_result,
        replay_detected=replay_detected,
        containment_result=containment_result,
        tenant_id=tenant_id,
        receiver_process=receiver_process,
    )


def audit_from_malformed(
    raw: Any,
    *,
    expected_sender: str,
    expected_receiver: str,
    reason: str = "MALFORMED_ENVELOPE",
    campaign_id: str | None = None,
    tenant_id: str | None = None,
    containment_result: str | None = None,
    receiver_process: str | None = None,
) -> HandoffAuditRecord:
    """Durable audit when the envelope never parsed. No payload body is stored."""
    blob = raw if isinstance(raw, dict) else {}
    nonce_raw = blob.get("nonce") if isinstance(blob.get("nonce"), str) else ""
    body_sha = blob.get("body_sha256") if isinstance(blob.get("body_sha256"), str) else ""
    event_id = blob.get("event_id") if isinstance(blob.get("event_id"), str) else str(uuid4())
    ts_raw = blob.get("timestamp")
    try:
        timestamp = int(ts_raw) if ts_raw is not None else int(time.time())
    except (TypeError, ValueError):
        timestamp = int(time.time())
    round_raw = blob.get("round_id")
    return HandoffAuditRecord(
        event_id=event_id[:36],
        timestamp=timestamp,
        sender=str(blob.get("sender") or expected_sender)[:64],
        receiver=str(blob.get("receiver") or expected_receiver)[:64],
        campaign_id=str(blob.get("campaign_id") or campaign_id or "")[:64],
        round_id=None if round_raw is None else str(round_raw)[:32],
        nonce_sha256=nonce_digest(nonce_raw) if nonce_raw else "",
        body_sha256=body_sha[:64],
        hmac_state=HmacState.FAIL,
        signature_status="failed",
        verification_result=reason,
        replay_detected=False,
        containment_result=containment_result,
        tenant_id=tenant_id,
        receiver_process=receiver_process,
    )


def receive_handoff(
    envelope: SignedHandoff | dict[str, Any],
    *,
    expected_sender: str,
    expected_receiver: str,
    containment_on_fail: str | None = "REJECTED",
    tenant_id: str | None = None,
    receiver_process: str | None = None,
) -> SignedHandoff:
    """Receiver-side verify + durable audit, including malformed envelopes."""
    from src.data.hmac_audit_store import record_handoff_audit

    try:
        opened = verify_handoff(
            envelope,
            expected_sender=expected_sender,
            expected_receiver=expected_receiver,
        )
    except HandoffIntegrityError as exc:
        if exc.reason == "MALFORMED_ENVELOPE":
            record_handoff_audit(
                audit_from_malformed(
                    envelope if isinstance(envelope, dict) else {},
                    expected_sender=expected_sender,
                    expected_receiver=expected_receiver,
                    containment_result=containment_on_fail,
                    tenant_id=tenant_id,
                    receiver_process=receiver_process,
                )
            )
        else:
            raw = envelope if isinstance(envelope, SignedHandoff) else None
            if raw is None:
                try:
                    raw = SignedHandoff.model_validate(envelope)
                except (ValidationError, TypeError, ValueError):
                    raw = None
            if raw is None:
                record_handoff_audit(
                    audit_from_malformed(
                        envelope if isinstance(envelope, dict) else {},
                        expected_sender=expected_sender,
                        expected_receiver=expected_receiver,
                        reason=exc.reason,
                        containment_result=containment_on_fail,
                        tenant_id=tenant_id,
                        receiver_process=receiver_process,
                    )
                )
            else:
                record_handoff_audit(
                    audit_from_envelope(
                        raw,
                        hmac_state=HmacState.FAIL,
                        verification_result=exc.reason,
                        replay_detected=exc.reason == "REPLAYED_HANDOFF",
                        containment_result=containment_on_fail,
                        tenant_id=tenant_id,
                        receiver_process=receiver_process,
                    )
                )
        raise
    record_handoff_audit(
        audit_from_envelope(
            opened,
            hmac_state=HmacState.OK,
            verification_result="OK",
            tenant_id=tenant_id,
            receiver_process=receiver_process,
        )
    )
    return opened
