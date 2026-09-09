"""Optional MongoDB document sink for ARTSA records.

When ``ARTSA_MONGODB_URI`` is configured, every alert, telemetry event
(tool_call / proxy_call / session_action) and ingest evaluation is written into
the ``ARTSA_MONGODB_DB`` database (default ``artsa``) of the Atlas cluster — so
ARTSA data never mixes with an existing application database such as ``staff-db``.

Design mirrors :mod:`src.services.custom_integration_dispatcher`: producers
(enqueue_*) are non-blocking ``put_nowait`` calls; a single worker thread owns
the pymongo client and performs the inserts, so the hot path never blocks on
network I/O. When the URI is unset everything is a no-op.

Collections
    alerts          — one document per dispatched alert (risk parsed from message)
    events          — telemetry events forwarded from the bus
    evaluations     — per-event risk verdicts from the ingest pipeline
    sessions        — session lifecycle snapshots (created / risk / action)
    tool_calls      — full tool-call audit records (arguments, response, latency)
    campaigns       — campaign job lifecycle (created / progress / completed / failed)
    agents          — agent inventory snapshots (upserted on registration/update)
    agent_baselines — learned behavioral baselines (one per agent, upserted)
"""

from __future__ import annotations

import logging
import queue
import threading
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime
from typing import Any

from src.core.config import settings

logger = logging.getLogger(__name__)

TELEMETRY_TYPES = ("tool_call", "proxy_call", "session_action")


def mongo_enabled() -> bool:
    uri = (settings.ARTSA_MONGODB_URI or "").strip()
    return bool(uri) and uri.lower() != "disabled"


class MongoSink:
    """Write ARTSA records to MongoDB off the hot path (opt-in)."""

    def __init__(self, maxsize: int = 1000) -> None:
        self._queue: queue.Queue[tuple[str, dict[str, Any]]] = queue.Queue(maxsize=maxsize)
        self._pool = ThreadPoolExecutor(max_workers=1, thread_name_prefix="mongo")
        self._stop = threading.Event()
        self._started = False
        self._client: Any = None
        self._db: Any = None

    # ── lifecycle ────────────────────────────────────────────────────────────

    def start(self) -> None:
        if self._started:
            return
        self._started = True
        self._stop.clear()
        self._futures = [self._pool.submit(self._consume)]

    def stop(self, wait: bool = True) -> None:
        self._started = False
        self._stop.set()
        try:
            self._pool.shutdown(wait=wait, cancel_futures=False)
        except Exception as exc:  # pragma: no cover - already shut down
            logger.debug("Mongo sink pool shutdown raced: %s", exc)
        if self._client is not None:
            try:
                self._client.close()
            except Exception as exc:  # pragma: no cover
                logger.debug("Mongo client close raced: %s", exc)
        self._client = None
        self._db = None

    # ── producers (non-blocking) ────────────────────────────────────────────

    def enqueue(self, collection: str, doc: dict[str, Any]) -> bool:
        """Queue a document for insert. Returns False (drops) when disabled or full."""
        if not self._started or not mongo_enabled():
            return False
        try:
            self._queue.put_nowait((collection, doc))
            return True
        except queue.Full:
            logger.warning("MongoDB sink queue full — dropping %s doc", collection)
            return False

    def enqueue_alert(self, alert: Any) -> None:
        """Build the alert document and queue it to the ``alerts`` collection."""
        self.enqueue(
            "alerts",
            {
                "type": "alert",
                "alert_id": str(alert.id),
                "session_id": str(alert.session_id),
                "agent_id": alert.agent_id,
                "severity": alert.severity,
                "title": alert.title,
                "message": alert.message,
                "channel": alert.channel,
                "risk_score": alert.risk_score,
                "triggered_at": alert.triggered_at.isoformat(),
                "ts": datetime.now(UTC).isoformat(),
            },
        )

    def enqueue_telemetry(self, event: dict[str, Any]) -> None:
        """Queue a telemetry-bus event to the ``events`` collection."""
        doc = dict(event)
        doc.setdefault("ts", datetime.now(UTC).isoformat())
        self.enqueue("events", doc)

    def enqueue_evaluation(self, evaluation: dict[str, Any]) -> None:
        """Queue an ingest verdict to the ``evaluations`` collection."""
        self.enqueue("evaluations", evaluation)

    def enqueue_session(self, session: Any, kind: str) -> None:
        """Queue a session lifecycle snapshot to the ``sessions`` collection.

        ``kind`` is one of ``created`` | ``risk`` | ``action``. Accepts a
        domain :class:`src.core.models.sessions.Session` or an ORM row — both
        expose the same attributes.
        """
        started = getattr(session, "started_at", None)
        ended = getattr(session, "ended_at", None)
        self.enqueue(
            "sessions",
            {
                "type": "session",
                "kind": kind,
                "session_id": str(getattr(session, "id", "")),
                "agent_id": getattr(session, "agent_id", None),
                "tenant_id": getattr(session, "tenant_id", None),
                "status": getattr(session, "status", None),
                "tool_call_count": getattr(session, "tool_call_count", 0),
                "max_risk_score": getattr(session, "max_risk_score", 0.0),
                "containment_breaches": getattr(session, "containment_breaches", 0),
                "started_at": started.isoformat() if started else None,
                "ended_at": ended.isoformat() if ended else None,
                "ts": datetime.now(UTC).isoformat(),
            },
        )

    def enqueue_tool_call(self, event: Any) -> None:
        """Queue a full tool-call audit record to the ``tool_calls`` collection.

        Richer than the telemetry ``events`` entries (which carry only the
        evaluation) — this preserves arguments, response and latency.
        """
        timestamp = getattr(event, "timestamp", None)
        self.enqueue(
            "tool_calls",
            {
                "type": "tool_call",
                "event_id": str(getattr(event, "id", "")),
                "session_id": str(getattr(event, "session_id", "")),
                "agent_id": getattr(event, "agent_id", None),
                "tool_name": getattr(event, "tool_name", None),
                "arguments": getattr(event, "arguments", None),
                "timestamp": timestamp.isoformat() if timestamp else None,
                "trace_id": getattr(event, "trace_id", None),
                "response": getattr(event, "response", None),
                "post_exec_redacted": bool(getattr(event, "post_exec_redacted", False)),
                "response_sha256": getattr(event, "response_sha256", None),
                "response_findings": getattr(event, "response_findings", None),
                "latency_ms": getattr(event, "latency_ms", None),
                "ts": datetime.now(UTC).isoformat(),
            },
        )

    def enqueue_campaign(self, record: dict[str, Any], kind: str) -> None:
        """Queue a campaign-job lifecycle snapshot to the ``campaigns`` collection.

        ``record`` is the dict shape used by :class:`CampaignJobStore`
        (already JSON-serialisable), ``kind`` one of
        ``created`` | ``progress`` | ``completed`` | ``failed``.
        """
        doc = dict(record)
        doc.update({"type": "campaign", "kind": kind, "ts": datetime.now(UTC).isoformat()})
        self.enqueue("campaigns", doc)

    def enqueue_agent(self, agent: Any) -> None:
        """Queue an agent inventory snapshot to the ``agents`` collection.

        Accepts a domain :class:`src.core.models.agents.Agent` or an ORM row.
        """
        last_seen = getattr(agent, "last_seen", None)
        self.enqueue(
            "agents",
            {
                "type": "agent",
                "agent_id": str(getattr(agent, "id", "")),
                "tenant_id": getattr(agent, "tenant_id", None),
                "name": getattr(agent, "name", None),
                "agent_type": getattr(agent, "agent_type", "general"),
                "provider": getattr(agent, "provider", ""),
                "model": getattr(agent, "model", ""),
                "status": getattr(agent, "status", None),
                "last_seen": last_seen.isoformat() if last_seen else None,
                "total_sessions": getattr(agent, "total_sessions", 0),
                "total_breaches": getattr(agent, "total_breaches", 0),
                "ts": datetime.now(UTC).isoformat(),
            },
        )

    def enqueue_agent_baseline(self, agent_id: str, baseline: dict[str, Any]) -> None:
        """Queue a behavioral-baseline snapshot to the ``agent_baselines`` collection."""
        self.enqueue(
            "agent_baselines",
            {
                "type": "agent_baseline",
                "agent_id": str(agent_id),
                "baseline": dict(baseline or {}),
                "ts": datetime.now(UTC).isoformat(),
            },
        )

    # ── worker ──────────────────────────────────────────────────────────────

    def _consume(self) -> None:
        while not self._stop.is_set():
            try:
                collection, doc = self._queue.get(timeout=0.5)
            except queue.Empty:
                continue
            try:
                self._insert(collection, doc)
            except Exception as exc:
                logger.warning("MongoDB sink insert into %s failed: %s", collection, exc)
            finally:
                self._queue.task_done()

    def _insert(self, collection: str, doc: dict[str, Any]) -> None:
        if self._db is None:
            import pymongo

            self._client = pymongo.MongoClient(
                settings.ARTSA_MONGODB_URI,
                serverSelectionTimeoutMS=4000,
            )
            self._db = self._client[settings.ARTSA_MONGODB_DB]
        self._db[collection].insert_one(doc)


mongo_sink = MongoSink()


async def drain_telemetry() -> None:
    """Forward telemetry-bus events to the MongoDB ``events`` collection.

    Started in the app lifespan alongside the custom-integration drainer.
    Alerts are not on the bus — they flow via :func:`enqueue_alert`.
    """
    from src.services.telemetry_bus import telemetry_bus

    bus_queue = await telemetry_bus.subscribe()
    try:
        while True:
            event = await bus_queue.get()
            if event.get("type") in TELEMETRY_TYPES:
                mongo_sink.enqueue_telemetry(event)
    finally:
        telemetry_bus.unsubscribe(bus_queue)
