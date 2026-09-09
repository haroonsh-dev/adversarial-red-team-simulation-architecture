"""In-memory system-prompt disclosure detection.

The proxy may hold a system prompt for the duration of one request. It must
never persist that prompt. Detection compares hashed sliding windows of the
normalized prompt against hashed windows of the output, plus optional
operator-registered canaries (also hashed, never stored in evidence).

A generic “reveal the system prompt” regex is not used here — that is an
input-side extraction *attempt*, not output disclosure.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from src.runtime.actions import RuntimeAction
from src.runtime.evidence import RedactedFinding, finding_from_span, sha256_text

DISCLOSURE_WINDOW = 32
DISCLOSURE_MIN_PROMPT_CHARS = 24
CANARY_MIN_CHARS = 12
_DETECTOR = "SystemPromptDisclosure"


def normalize_prompt_text(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "")).strip().lower()


def _window_hashes(normalized: str, window: int) -> dict[str, int]:
    hashes: dict[str, int] = {}
    if len(normalized) < window:
        return hashes
    for i in range(len(normalized) - window + 1):
        hashes[sha256_text(normalized[i : i + window])] = i
    return hashes


@dataclass(frozen=True)
class PromptFingerprint:
    """Opaque in-memory fingerprint. Does not retain prompt plaintext."""

    digest: str
    window: int
    window_hashes: frozenset[str]
    short_len: int
    short_hash: str | None


def fingerprint_system_prompt(text: str) -> PromptFingerprint | None:
    normalized = normalize_prompt_text(text)
    if len(normalized) < DISCLOSURE_MIN_PROMPT_CHARS:
        return None
    digest = sha256_text(normalized)
    if len(normalized) < DISCLOSURE_WINDOW:
        return PromptFingerprint(
            digest=digest,
            window=DISCLOSURE_WINDOW,
            window_hashes=frozenset(),
            short_len=len(normalized),
            short_hash=digest,
        )
    return PromptFingerprint(
        digest=digest,
        window=DISCLOSURE_WINDOW,
        window_hashes=frozenset(_window_hashes(normalized, DISCLOSURE_WINDOW).keys()),
        short_len=0,
        short_hash=None,
    )


def fingerprint_from_messages(
    messages: list[dict],
    extra_system: str | None = None,
) -> PromptFingerprint | None:
    parts: list[str] = []
    if extra_system and extra_system.strip():
        parts.append(extra_system)
    for message in messages:
        if not isinstance(message, dict):
            continue
        if str(message.get("role") or "") != "system":
            continue
        content = message.get("content")
        if isinstance(content, str) and content.strip():
            parts.append(content)
        elif isinstance(content, list):
            for part in content:
                if isinstance(part, dict) and part.get("type") == "text":
                    text = part.get("text")
                    if isinstance(text, str) and text.strip():
                        parts.append(text)
    if not parts:
        return None
    return fingerprint_system_prompt("\n".join(parts))


def scan_prompt_disclosure(
    output: str,
    fingerprint: PromptFingerprint | None,
) -> RedactedFinding | None:
    if fingerprint is None:
        return None
    normalized = normalize_prompt_text(output)
    if not normalized:
        return None

    if fingerprint.short_hash and fingerprint.short_len:
        target = fingerprint.short_len
        if len(normalized) < target:
            return None
        for i in range(len(normalized) - target + 1):
            if sha256_text(normalized[i : i + target]) == fingerprint.short_hash:
                return finding_from_span(
                    detector=_DETECTOR,
                    category="SYSTEM_PROMPT_DISCLOSURE",
                    body=output,
                    start=i,
                    end=i + target,
                    action=RuntimeAction.BLOCK,
                    prompt_fingerprint_sha256=fingerprint.digest,
                )
        return None

    out_windows = _window_hashes(normalized, fingerprint.window)
    for digest, start in out_windows.items():
        if digest in fingerprint.window_hashes:
            return finding_from_span(
                detector=_DETECTOR,
                category="SYSTEM_PROMPT_DISCLOSURE",
                body=output,
                start=start,
                end=start + fingerprint.window,
                action=RuntimeAction.BLOCK,
                prompt_fingerprint_sha256=fingerprint.digest,
            )
    return None


def scan_registered_canaries(
    output: str,
    canaries: tuple[str, ...],
) -> list[RedactedFinding]:
    """Find registered canaries without retaining their plaintext.

    Long canaries use the same hashed sliding-window rule as system prompts.
    That lets streaming detection block as soon as its first window arrives,
    before the holdback buffer can release a prefix of the full canary.
    """
    findings: list[RedactedFinding] = []
    normalized = normalize_prompt_text(output)
    if not normalized:
        return findings
    output_windows = _window_hashes(normalized, DISCLOSURE_WINDOW)
    seen: set[str] = set()
    for canary in canaries:
        needle = normalize_prompt_text(canary)
        if len(needle) < CANARY_MIN_CHARS:
            continue
        digest = sha256_text(needle)
        if digest in seen:
            continue
        if len(needle) < DISCLOSURE_WINDOW:
            idx = normalized.find(needle)
            end = idx + len(needle)
        else:
            canary_windows = _window_hashes(needle, DISCLOSURE_WINDOW)
            match = next(
                (
                    start
                    for window_digest, start in output_windows.items()
                    if window_digest in canary_windows
                ),
                None,
            )
            if match is None:
                continue
            idx, end = match, match + DISCLOSURE_WINDOW
        if idx < 0:
            continue
        seen.add(digest)
        findings.append(
            finding_from_span(
                detector=_DETECTOR,
                category="SYSTEM_PROMPT_DISCLOSURE",
                body=output,
                start=idx,
                end=end,
                action=RuntimeAction.BLOCK,
                canary_sha256=digest,
            )
        )
    return findings
