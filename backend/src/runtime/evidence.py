"""Redacted runtime evidence — digest and spans, never matched secret text."""

from __future__ import annotations

import hashlib
import uuid
from datetime import UTC, datetime

from pydantic import BaseModel, ConfigDict, Field

from src.runtime.actions import RuntimeAction


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8", errors="replace")).hexdigest()


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


class RedactedFinding(BaseModel):
    """Forensic finding that is safe to persist and log.

    Forbidden fields: matched secret text, system prompt body, canary plaintext.
    """

    model_config = ConfigDict(extra="forbid")

    detector: str
    category: str
    body_sha256: str
    span_start: int = 0
    span_end: int = 0
    match_length: int = 0
    action: RuntimeAction
    prompt_fingerprint_sha256: str | None = None
    canary_sha256: str | None = None
    tool_name: str | None = None
    match_sha256: str | None = None


class RuntimeAuditRecord(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    session_id: str
    stream: bool = False
    action: RuntimeAction
    body_sha256: str
    findings: list[RedactedFinding] = Field(default_factory=list)
    recorded_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


def finding_from_span(
    *,
    detector: str,
    category: str,
    body: str,
    start: int,
    end: int,
    action: RuntimeAction,
    prompt_fingerprint_sha256: str | None = None,
    canary_sha256: str | None = None,
    tool_name: str | None = None,
) -> RedactedFinding:
    start = max(0, start)
    end = max(start, end)
    matched = body[start:end]
    return RedactedFinding(
        detector=detector,
        category=category,
        body_sha256=sha256_text(body),
        span_start=start,
        span_end=end,
        match_length=end - start,
        action=action,
        prompt_fingerprint_sha256=prompt_fingerprint_sha256,
        canary_sha256=canary_sha256,
        tool_name=tool_name,
        match_sha256=sha256_text(matched) if matched else None,
    )
