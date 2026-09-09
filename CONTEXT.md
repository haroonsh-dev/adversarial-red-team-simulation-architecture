# ARTSA

ARTSA (Adversarial Red Team Simulation Architecture) is a six-agent red-teaming and behavioral security platform. This glossary is the claim contract: use these terms, and do not describe derived or unfinished work as live.

## Agents

**Six-agent chain**:
The MVP loop: Research → Curator → Red Team → Target → Judge → Defender.
_Avoid_: pipeline (when you mean this chain), swarm, multi-agent topology

**Research**:
The agent that gathers threat intelligence and attack-technique material for a campaign.

**Curator**:
The agent that turns Research findings into a seeded attack set.

**Red Team**:
The agent that crafts and sends adversarial probes at the Target.

**Target**:
The system under test that responds to probes.
_Avoid_: victim, app under test, customer model (when you mean this role)

**Judge**:
The agent that scores probe outcomes and reaches a verdict.

**Defender**:
The agent that patches policy and contains a successful attack after the Judge scores it.

## Research claim

**Detection-rate-over-time**:
The thesis chart: ARTSA adaptive detection rate versus a static baseline, round over round.
_Avoid_: accuracy, recall, dashboard KPI (when you mean this curve)

**Adaptive defense**:
The continuously self-updating Defender side of that comparison. The adaptive series should climb.

**Static baseline**:
The non-updating control series. It stays flat.

**Adaptive lift**:
The percentage-point gap between the latest adaptive rate and the static baseline.
_Avoid_: improvement, delta (unless you mean a single round vs the previous round)

## Security mechanism

**HMAC handoff**:
A cryptographically signed inter-agent state payload. Red Team serializes a signed envelope to Target. Target independently verifies it (Redis replay protection) **before processing**, then signs its response for Judge. Judge independently verifies that envelope **before scoring**. Replay is SET NX on `sha256(nonce)`. Audit rows are digest-only (`body_sha256` + `nonce_sha256` — no prompt body, no plaintext nonce). Research / Curator / Defender remain unwired. WebSocket tickets and password hashes are a different HMAC — they are not agent handoffs.

**Walkthrough**:
A labeled seeded demonstration, not live traffic and not experiment output.

## Pages

**Command Center**:
The strategic floor: six-agent health, HMAC/trust story, detection-rate-over-time, ASI coverage, active campaigns.
_Avoid_: dashboard, overview, home (when you mean this page)

**Detections**:
The tactical floor: severity triage, per-event investigation, live activity table.
_Avoid_: monitor, blotter, live feed (in product copy)

## Threat model

**ASI**:
An OWASP Top 10 for Agentic Applications category (ASI01–ASI10) used to classify attacks and defenses.

**ASI08**:
Session circuit breaker. Three runtime `BLOCK` decisions in the configured
rolling window open a durable, tenant-isolated breaker, breach the session, and
deny all later guarded operations for that session. It is not provider-wide.

**Runtime blocking**:
Non-streaming and streaming LLM proxy completions and `tool_calls` are gated (`ALLOW` / `QUARANTINE` / `BLOCK`) with digest-only forensic audit. Python SDK and LangChain/LangGraph execution wrappers also gate tool returns post-execution, retaining only a digest and redacted findings. SDK/ingest and the LLM proxy (OpenAI, Anthropic, and streaming) turn `QUARANTINE` into a tenant-scoped, digest-only approval request. The proxy persists `PENDING_APPROVAL` on `agent_sessions` and binds one session ID per request (echoed as `X-ARTSA-Session-ID` when the client omits it) so approve → retry is recoverable. `artsa-mcp-stdio` is the live newline-delimited stdio boundary: it blocks unsafe MCP calls before the child server and gates tool results before the MCP client. Streamable HTTP/SSE MCP remains unbuilt. The full backend pytest collection still requires `pymongo`; do not treat this capability as production-complete from a partial run.

**Provider resolution**:
Provider credentials are tenant-scoped encrypted records resolved lazily at the client-construction boundary. ARTSA never loads all provider keys at startup, and provider aliases are unique only within a tenant. Standalone SDK calls require `tenant_id` or `ARTSA_SDK_TENANT_ID`; environment credential fallback is disabled by default. Existing `default_org` provider rows are migration-only and cannot act as a production shared pool.

## Graph

**Attack graph**:
The in-memory pathfinding model used now (NetworkX). Apache AGE is the deferred upgrade, not the current store.
_Avoid_: Neo4j, knowledge graph (when you mean this graph)
