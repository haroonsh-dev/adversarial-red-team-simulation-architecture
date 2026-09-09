"""ARTSA Async Client — httpx-based async tool-call instrumentation.

Drop-in async replacement for the synchronous ArtsaClient. Use this when
your agent runtime is async (e.g., asyncio, FastAPI, async LangChain).

Usage:
    from artsa.async_client import AsyncArtsaClient

    client = AsyncArtsaClient(api_url="http://localhost:8000", api_key="...")

    async with client:
        result = await client.guard_tool_call(
            session_id="s1", agent_id="a1", tool_name="search", arguments={"q": "..."}
        )
"""

from __future__ import annotations

import logging
import uuid
from types import TracebackType
from typing import Any, Dict, Optional, Sequence, Self

import httpx

from artsa.client import ArtsaQuotaError, _tool_result_payload

logger = logging.getLogger("artsa.sdk.async")

BLOCKING_ACTIONS = frozenset({"KILL", "QUARANTINE"})
CONTAINED_STATUSES = frozenset({"BREACHED", "QUARANTINED", "CLOSED"})


class ArtsaBlockedError(RuntimeError):
    """Raised when ARTSA recommends KILL or QUARANTINE and enforcement is enabled."""

    def __init__(self, tool_name: str, result: Dict[str, Any]) -> None:
        verdict = result.get("verdict") or {}
        reasoning = verdict.get("reasoning") or "containment policy"
        super().__init__(f"ARTSA blocked tool '{tool_name}': {reasoning}")
        self.tool_name = tool_name
        self.result = result


class AsyncArtsaClient:
    """Async httpx-based client for instrumenting AI agents with containment monitoring."""

    def __init__(
        self,
        api_url: str = "http://localhost:8000",
        api_key: Optional[str] = None,
        timeout: float = 30.0,
        fail_closed: bool = True,
        block_actions: Optional[Sequence[str]] = None,
        max_retries: int = 2,
        retry_backoff_sec: float = 0.05,
        httpx_client: Optional[httpx.AsyncClient] = None,
    ) -> None:
        self.api_url = api_url.rstrip("/")
        self.api_key = api_key
        self.timeout = timeout

        import os

        env_override = os.getenv("ARTSA_FAIL_CLOSED")
        if env_override is not None:
            self.fail_closed = env_override.strip().lower() in ("1", "true", "yes")
        else:
            self.fail_closed = fail_closed

        self.block_actions = frozenset(block_actions) if block_actions else BLOCKING_ACTIONS
        self.max_retries = max(0, max_retries)
        self.retry_backoff_sec = retry_backoff_sec
        self._external_client = httpx_client is not None
        self._client = httpx_client or httpx.AsyncClient(timeout=httpx.Timeout(timeout))

    @staticmethod
    def _unwrap(body: Dict[str, Any]) -> Dict[str, Any]:
        """Transparently unwrap the ARTSA response envelope when present."""
        if isinstance(body, dict) and "success" in body and "data" in body:
            if body.get("success"):
                return body.get("data", body) or {}
            return body.get("error", body) or {}
        return body

    async def __aenter__(self) -> Self:
        if not self._external_client:
            await self._client.__aenter__()
        return self

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc_val: BaseException | None,
        exc_tb: TracebackType | None,
    ) -> None:
        if not self._external_client:
            await self._client.__aexit__(exc_type, exc_val, exc_tb)

    async def close(self) -> None:
        """Close the underlying httpx client if owned."""
        if not self._external_client:
            await self._client.aclose()

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

    async def _post(self, path: str, json_body: Dict[str, Any]) -> Dict[str, Any]:
        last_error: Exception | None = None
        for attempt in range(self.max_retries + 1):
            try:
                res = await self._client.post(
                    f"{self.api_url}{path}",
                    json=json_body,
                    headers=self._headers(),
                )
                if res.status_code == 403:
                    detail: Dict[str, Any] = {}
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
            except (httpx.HTTPStatusError, httpx.RequestError, httpx.TimeoutException) as e:
                last_error = e
                if attempt < self.max_retries:
                    await self._sleep(self.retry_backoff_sec * (2**attempt))

        logger.warning(
            "ARTSA async request failed after retries (%s): %s",
            "closed" if self.fail_closed else "open",
            last_error,
        )
        return self._fallback()

    @staticmethod
    async def _sleep(seconds: float) -> None:
        """Async sleep helper (extracted for test mocking)."""
        import asyncio
        await asyncio.sleep(seconds)

    async def monitor_tool_call(
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
        """Send a tool call to ARTSA and return the ingest + evaluation payload (async)."""
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
        return await self._post("/api/v1/ingest", payload)

    def is_blocked(self, result: Dict[str, Any]) -> bool:
        verdict = result.get("verdict") or {}
        action = str(verdict.get("recommended_action", "NONE")).upper()
        if action in self.block_actions:
            return True
        status = str(result.get("session_status") or "").upper()
        return status in CONTAINED_STATUSES

    async def guard_tool_call(
        self,
        session_id: str,
        agent_id: str,
        tool_name: str,
        arguments: Dict[str, Any],
        *,
        enforce: bool = True,
        **kwargs: Any,
    ) -> Dict[str, Any]:
        """Evaluate a tool call asynchronously; raise ArtsaBlockedError when enforcement blocks it."""
        result = await self.monitor_tool_call(session_id, agent_id, tool_name, arguments, **kwargs)
        if enforce and self.is_blocked(result):
            raise ArtsaBlockedError(tool_name, result)
        return result

    async def guard_tool_result(
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
        """Scan a completed tool return and withhold it on containment."""
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
        response = await self._post("/api/v1/ingest", payload)
        if enforce and self.is_blocked(response):
            raise ArtsaBlockedError(tool_name, response)
        return response

    async def enforce_session(self, session_id: str, action: str = "KILL") -> Dict[str, Any]:
        """Manually contain a session via `/api/v1/sessions/{id}/action` (async)."""
        return await self._post(f"/api/v1/sessions/{session_id}/action", {"action": action.upper()})

    async def ready(self) -> bool:
        """Return True when `/api/v1/ready` reports ready."""
        try:
            res = await self._client.get(
                f"{self.api_url}/api/v1/ready",
                headers=self._headers(),
            )
            if res.status_code != 200:
                return False
            return res.json().get("status") == "ready"
        except Exception:
            return False

    async def health(self) -> Dict[str, Any]:
        """Return the health check payload from `/api/v1/health`."""
        try:
            res = await self._client.get(
                f"{self.api_url}/api/v1/health",
                headers=self._headers(),
            )
            res.raise_for_status()
            return res.json()
        except Exception:
            return {"status": "unreachable"}

    async def create_session(
        self, agent_id: str, *, metadata: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Create a new monitoring session via `/api/v1/sessions`."""
        payload = {"agent_id": agent_id, "metadata": metadata or {}}
        return await self._post("/api/v1/sessions", payload)
