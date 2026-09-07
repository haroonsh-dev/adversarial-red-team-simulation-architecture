# ADR-007: HMAC handoffs are live on the wired agent chain

**Status:** Superseded (Phase 1 security foundation, 2026-09-07)  
**Date:** 2026-09-06

HMAC-signed inter-agent state is the architectural differentiator.

**Shipped:** Red Team serializes a signed envelope to Target. Target independently verifies (Redis `SET NX` on `sha256(nonce)`) **before processing**, then signs a response envelope for Judge. Judge independently verifies **before scoring**. The campaign orchestrator does not process the Target prompt and does not sign as Target.

Audit rows in `hmac_handoff_audit` store `body_sha256` and `nonce_sha256` only — never the prompt body or the raw nonce. Each verification attempt has its own row id so a replay failure can persist next to the original OK.

Malformed envelopes that fail schema parsing are audited as `MALFORMED_ENVELOPE` and rejected.

When `ARTSA_HMAC_RECEIVER_WORKERS=true`, hops run in independent OS processes over Redis lists (`python -m src.agents.handoff_worker serve --role target|judge`).

WebSocket tickets remain a **separate** HMAC (ticket secret + Redis SET NX). Do not present WS tickets as agent handoffs.

Research / Curator / Defender stay `not_wired` and must not receive fabricated signatures.
