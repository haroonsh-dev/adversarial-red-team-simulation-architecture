"""ARTSA Client — live tool-call instrumentation and containment enforcement."""

from __future__ import annotations

import logging
import json
import time
import uuid
from typing import Any, Dict, Optional, Sequence

import requests

logger = logging.getLogger("artsa.sdk")

BLOCKING_ACTIONS = frozenset({"KILL", "QUARANTINE"})
CONTAINED_STATUSES = frozenset({"BREACHED", "QUARANTINED", "CLOSED"})


def _tool_result_payload(result: Any) -> Dict[str, Any]:
    """Normalize arbitrary tool returns for the transient post-exec scan."""
    try:
        json.dumps(result)
        value = result
    except (TypeError, ValueError):
        value = str(result)
    return {"result": value}


class ArtsaBlockedError(RuntimeError):
    """Raised when ARTSA recommends KILL or QUARANTINE and enforcement is enabled."""

    def __init__(self, tool_name: str, result: Dict[str, Any]) -> None:
        verdict = result.get("verdict") or {}
        reasoning = verdict.get("reasoning") or "containment policy"
        super().__init__(f"ARTSA blocked tool '{tool_name}': {reasoning}")
        self.tool_name = tool_name
        self.result = result


class ArtsaQuotaError(RuntimeError):
    """Raised on HTTP 429 — slow down; not a containment verdict."""

    def __init__(self, message: str, *, retry_after_sec: float | None = None) -> None:
        super().__init__(message)
        self.retry_after_sec = retry_after_sec
        self.status_code = 429


class ArtsaClient:
    """Client for instrumenting AI agents with real-time escape containment monitoring."""

    def __init__(
        self,
        api_url: str = "http://localhost:8000",
        api_key: Optional[str] = None,
        timeout: float = 0.5,
        fail_closed: bool = True,
        block_actions: Optional[Sequence[str]] = None,
        max_retries: int = 2,
        retry_backoff_sec: float = 0.05,
    ) -> None:
        self.api_url = api_url.rstrip("/")
        self.api_key = api_key
        self.timeout = timeout
        # Production default: block tools when ARTSA is unreachable (set False only for demos)
        import os

        env_override = os.getenv("ARTSA_FAIL_CLOSED")
        if env_override is not None:
            self.fail_closed = env_override.strip().lower() in ("1", "true", "yes")
        else:
            self.fail_closed = fail_closed
        self.block_actions = frozenset(block_actions) if block_actions else BLOCKING_ACTIONS
        self.max_retries = max(0, max_retries)
        self.retry_backoff_sec = retry_backoff_sec

    @staticmethod
    def _unwrap(body: Dict[str, Any]) -> Dict[str, Any]:
        """Transparently unwrap the ARTSA response envelope when present.

        When ARTSA_RESPONSE_ENVELOPE=true:
          {"success": true, "data": <payload>, "meta": {...}}
          {"success": false, "error": {...}, "meta": {...}}

        When off (or for legacy flat responses), the body is returned as-is.
        """
        if isinstance(body, dict) and "success" in body and "data" in body:
            if body.get("success"):
                return body.get("data", body) or {}
            return body.get("error", body) or {}
        return body

    def _headers(self) -> Dict[str, str]:
        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
            headers["X-API-Key"] = self.api_key
        return headers

    def _fallback(self) -> Dict[str, Any]:
        if self.fail_closed:
            return {
                "verdict": {
                    "verdict": "BREACHED",
                    "recommended_action": "KILL",
                    "reasoning": "ARTSA unreachable (fail-closed)",
                    "confidence": 0.0,
                },
                "risk_score": {"overall_score": 100.0, "flags": []},
                "session_status": "BREACHED",
            }
        return {
            "verdict": {
                "verdict": "SAFE",
                "recommended_action": "NONE",
                "reasoning": "ARTSA unreachable (fail-open)",
                "confidence": 0.0,
            },
            "risk_score": {"overall_score": 0.0, "flags": []},
        }

    def _post(self, path: str, json_body: Dict[str, Any]) -> Dict[str, Any]:
        last_error: Exception | None = None
        for attempt in range(self.max_retries + 1):
            try:
                res = requests.post(
                    f"{self.api_url}{path}",
                    json=json_body,
                    headers=self._headers(),
                    timeout=self.timeout,
                )
                if res.status_code == 403:
                    # Contained session — treat as block
                    detail = {}
                    try:
                        detail = res.json().get("detail") or {}
                    except Exception:
                        pass
                    return {
                        "verdict": {
                            "verdict": "BREACHED",
                            "recommended_action": "KILL",
                            "reasoning": str(detail.get("message") or "session contained"),
                            "confidence": 1.0,
                        },
                        "risk_score": {"overall_score": 100.0, "flags": ["session_contained"]},
                        "session_status": detail.get("session_status", "BREACHED"),
                    }
                if res.status_code == 429:
                    # Quota / rate limit — not a containment block; do not fail-closed as BREACHED
                    detail_msg = "ARTSA quota exceeded — slow down and retry"
                    try:
                        body = res.json()
                        raw = body.get("detail") or body.get("error") or body
                        if isinstance(raw, dict):
                            detail_msg = str(raw.get("message") or raw.get("detail") or detail_msg)
                        elif raw:
                            detail_msg = str(raw)
                    except Exception:
                        pass
                    retry_raw = res.headers.get("Retry-After")
                    retry_after: float | None = None
                    if retry_raw:
                        try:
                            retry_after = float(retry_raw)
                        except ValueError:
                            retry_after = None
                    raise ArtsaQuotaError(detail_msg, retry_after_sec=retry_after)
                res.raise_for_status()
                return self._unwrap(res.json())
            except ArtsaQuotaError:
                raise
            except Exception as e:
                last_error = e
                if attempt < self.max_retries:
                    time.sleep(self.retry_backoff_sec * (2**attempt))
        logger.warning(
            "ARTSA request failed after retries (%s): %s",
            "closed" if self.fail_closed else "open",
            last_error,
        )
        return self._fallback()

    def monitor_tool_call(
        self,
        session_id: str,
        agent_id: str,
        tool_name: str,
        arguments: Dict[str, Any],
        *,
        event_id: Optional[str] = None,
        trace_id: Optional[str] = None,
        approval_retry_token: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Send a tool call to ARTSA and return the ingest + evaluation payload."""
        payload = {
            "id": event_id or str(uuid.uuid4()),
            "session_id": session_id,
            "agent_id": agent_id,
            "tool_name": tool_name,
            "arguments": arguments,
            "trace_id": trace_id or str(uuid.uuid4()),
        }
        if approval_retry_token:
            payload["approval_retry_token"] = approval_retry_token
        return self._post("/api/v1/ingest", payload)

    def is_blocked(self, result: Dict[str, Any]) -> bool:
        verdict = result.get("verdict") or {}
        action = str(verdict.get("recommended_action", "NONE")).upper()
        if action in self.block_actions:
            return True
        status = str(result.get("session_status") or "").upper()
        return status in CONTAINED_STATUSES

    def guard_tool_call(
        self,
        session_id: str,
        agent_id: str,
        tool_name: str,
        arguments: Dict[str, Any],
        *,
        enforce: bool = True,
        **kwargs: Any,
    ) -> Dict[str, Any]:
        """Evaluate a tool call; raise ArtsaBlockedError when enforcement blocks it."""
        result = self.monitor_tool_call(session_id, agent_id, tool_name, arguments, **kwargs)
        if enforce and self.is_blocked(result):
            raise ArtsaBlockedError(tool_name, result)
        return result

    def guard_tool_result(
        self,
        session_id: str,
        agent_id: str,
        tool_name: str,
        arguments: Dict[str, Any],
        result: Any,
        *,
        enforce: bool = True,
        event_id: Optional[str] = None,
        trace_id: Optional[str] = None,
        approval_retry_token: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Scan a completed tool return and withhold it on containment.

        ARTSA scans ``result`` transiently; its ingest mode persists only a
        digest and redacted findings, never the raw tool output.
        """
        payload = {
            "id": event_id or str(uuid.uuid4()),
            "session_id": session_id,
            "agent_id": agent_id,
            "tool_name": tool_name,
            "arguments": arguments,
            "response": _tool_result_payload(result),
            "post_exec_redacted": True,
            "trace_id": trace_id or str(uuid.uuid4()),
        }
        if approval_retry_token:
            payload["approval_retry_token"] = approval_retry_token
        response = self._post("/api/v1/ingest", payload)
        if enforce and self.is_blocked(response):
            raise ArtsaBlockedError(tool_name, response)
        return response

    def guard_rag_search(
        self,
        session_id: str,
        agent_id: str,
        query: str,
        *,
        collection: str | None = None,
        provider: str = "astra",
        enforce: bool = True,
    ) -> Dict[str, Any]:
        """Guard a vector/RAG retrieval step (e.g. Astra DB search) before calling the DB."""
        arguments: Dict[str, Any] = {"query": query, "vector_provider": provider}
        if collection:
            arguments["collection"] = collection
        return self.guard_tool_call(
            session_id,
            agent_id,
            "vector_search",
            arguments,
            enforce=enforce,
        )

    def guard_rag_context(
        self,
        session_id: str,
        agent_id: str,
        user_query: str,
        retrieved_chunks: Sequence[str],
        *,
        enforce: bool = True,
    ) -> Dict[str, Any]:
        """Guard retrieved chunks before they are sent to the LLM (poison / injection in context)."""
        previews = [c[:500] for c in retrieved_chunks[:10]]
        return self.guard_tool_call(
            session_id,
            agent_id,
            "rag_context_to_llm",
            {"query": user_query, "retrieved_chunks": previews, "chunk_count": len(retrieved_chunks)},
            enforce=enforce,
        )

    def enforce_session(self, session_id: str, action: str = "KILL") -> Dict[str, Any]:
        """Manually contain a session via `/api/v1/sessions/{id}/action`."""
        return self._post(f"/api/v1/sessions/{session_id}/action", {"action": action.upper()})

    def inspect_mcp(self, method: str, params: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Inspect an MCP JSON-RPC request via `/api/v1/mcp/proxy`."""
        try:
            res = requests.post(
                f"{self.api_url}/api/v1/mcp/proxy",
                json={"method": method, "params": params or {}},
                headers=self._headers(),
                timeout=self.timeout,
            )
            res.raise_for_status()
            return res.json()
        except Exception as e:
            logger.warning("ARTSA MCP inspect failed: %s", e)
            return {"is_safe": not self.fail_closed, "action_taken": "PASSED" if not self.fail_closed else "BLOCKED"}

    def ready(self) -> bool:
        """Return True when `/api/v1/ready` reports ready."""
        try:
            res = requests.get(f"{self.api_url}/api/v1/ready", timeout=self.timeout)
            if res.status_code != 200:
                return False
            return res.json().get("status") == "ready"
        except Exception:
            return False

    def score_tool_call(
        self,
        session_id: str,
        agent_id: str,
        tool_name: str,
        arguments: Dict[str, Any],
        **kwargs: Any,
    ) -> Dict[str, Any]:
        """Return a normalized risk score for a tool call without enforcing."""
        result = self.monitor_tool_call(session_id, agent_id, tool_name, arguments, **kwargs)
        risk = result.get("risk_score") or {}
        verdict = result.get("verdict") or {}
        return {
            "overall_score": float(risk.get("overall_score") or 0.0),
            "flags": list(risk.get("flags") or []),
            "verdict": str(verdict.get("verdict") or "SAFE"),
            "recommended_action": str(verdict.get("recommended_action") or "NONE"),
            "blocked": self.is_blocked(result),
            "raw": result,
        }

    def scan_prompt(self, content: str, *, agent_id: str = "sdk-client") -> Dict[str, Any]:
        """Scan raw prompt text via the Attack Sandbox API."""
        return self._post(
            "/api/v1/playground/evaluate",
            {"user_input": content, "agent_id": agent_id},
        )

    def evaluate_situation(
        self,
        message: str,
        *,
        agent_id: Optional[str] = None,
        session_id: Optional[str] = None,
        persist: bool = True,
        use_llm: bool = False,
    ) -> Dict[str, Any]:
        """Phase 3: paste free text — ARTSA picks tool/agent and scores (optional persist).

        Customers do not invent ``tool_name``; the situations API classifies the message.
        """
        body: Dict[str, Any] = {
            "message": message,
            "persist": persist,
            "use_llm": use_llm,
        }
        if agent_id:
            body["agent_id"] = agent_id
        if session_id:
            body["session_id"] = session_id
        return self._post("/api/v1/situations/evaluate", body)

    def guard_message(
        self,
        message: str,
        *,
        agent_id: Optional[str] = None,
        session_id: Optional[str] = None,
        persist: bool = True,
        use_llm: bool = False,
        enforce: bool = True,
    ) -> Dict[str, Any]:
        """Classify + score a free-text message; raise ArtsaBlockedError when blocked."""
        result = self.evaluate_situation(
            message,
            agent_id=agent_id,
            session_id=session_id,
            persist=persist,
            use_llm=use_llm,
        )
        if enforce and self.is_blocked(result):
            tool = (result.get("classification") or {}).get("tool_name") or "message"
            raise ArtsaBlockedError(str(tool), result)
        return result

    def start_baseline_scan(
        self,
        *,
        name: str = "Baseline quick scan",
        provider: Optional[str] = None,
        model: Optional[str] = None,
        max_rounds: int = 3,
    ) -> Dict[str, Any]:
        """Phase 3: kick off an auto wargame baseline against a configured target."""
        body: Dict[str, Any] = {
            "name": name,
            "attack_profile": "quick_scan",
            "max_rounds": max_rounds,
        }
        if provider:
            body["provider"] = provider
        if model:
            body["model"] = model
        return self._post("/api/v1/campaigns/baseline", body)
