"""WebSocket Real-Time Telemetry Route with heartbeat and reconnection protocol.

Includes:
  - Client-initiated ping/pong heartbeat (30 s interval, 10 s tolerance).
  - Server-side keepalive pings every 25 s.
  - Reconnection token support (opaque token, valid for 120 s after disconnect).
  - Graceful client reconnection with event replay from last known sequence.
"""

import asyncio
import json
import logging
import secrets
import time
from typing import Any

from fastapi import APIRouter, Request, WebSocket, WebSocketDisconnect

from src.api.ws_auth import require_ws_auth
from src.core.rbac import Role
from src.core.ws_tickets import create_ws_ticket
from src.services.telemetry_bus import telemetry_bus

logger = logging.getLogger(__name__)

router = APIRouter(tags=["WebSocket"])

HEARTBEAT_INTERVAL = 25.0   # server sends ping every 25 s
HEARTBEAT_TIMEOUT = 10.0    # client must respond to ping within 10 s
RECONNECT_WINDOW = 120.0    # reconnection token lifetime in seconds

# In-memory reconnection token store: {token: {"session": str, "last_seq": int, "expires_at": float}}
_reconnect_store: dict[str, dict[str, Any]] = {}


def _prune_reconnect_tokens() -> None:
    """Remove expired reconnection tokens."""
    now = time.monotonic()
    expired = [t for t, v in _reconnect_store.items() if v["expires_at"] < now]
    for t in expired:
        del _reconnect_store[t]


@router.post("/websocket/ticket")
async def create_ws_ticket_endpoint(request: Request) -> dict[str, str]:
    """Mint a short-lived, single-use WebSocket auth ticket.

    The caller must already be authenticated (X-API-Key or OIDC bearer via the
    API key middleware). The returned ticket is bound to the caller's role and
    can be passed to the WebSocket endpoint as ``?ticket=...`` so the raw bearer
    token never appears in the URL (and thus never in proxy/access logs).
    """
    role = getattr(request.state, "role", None)
    if role is None:
        # Auth not enforced (dev/testing) — mirror require_ws_auth's admin default.
        effective_role = Role.ADMIN
    else:
        effective_role = Role(role) if isinstance(role, Role) else Role(str(role))
    return {"ticket": create_ws_ticket(effective_role)}


@router.websocket("/websocket")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket endpoint with heartbeat and reconnection support."""
    if await require_ws_auth(websocket) is None:
        return

    await websocket.accept()
    from src.services.prometheus_metrics import record_ws_connect, record_ws_disconnect

    record_ws_connect()
    queue = await telemetry_bus.subscribe()
    reconnection_token: str | None = None
    last_sequence: int = 0
    client_alive: bool = True

    logger.info("WebSocket client connected to live containment feed")

    try:
        # Send a hello handshake with reconnection token
        reconnection_token = secrets.token_urlsafe(32)
        hello = {
            "type": "hello",
            "version": "0.3.0",
            "heartbeat_interval_ms": int(HEARTBEAT_INTERVAL * 1000),
            "heartbeat_timeout_ms": int(HEARTBEAT_TIMEOUT * 1000),
            "reconnect_token": reconnection_token,
            "reconnect_window_s": int(RECONNECT_WINDOW),
        }
        await websocket.send_text(json.dumps(hello))

        # Store reconnection token
        _reconnect_store[reconnection_token] = {
            "last_seq": 0,
            "expires_at": time.monotonic() + RECONNECT_WINDOW,
        }

        # Send recent history on connect
        history = telemetry_bus.get_history(limit=20)
        await websocket.send_text(json.dumps({"type": "history", "events": history}))

        # Shared liveness stamp — any client frame (ping/pong/reconnect) keeps the socket open.
        last_client_seen = time.monotonic()

        async def receive_loop():
            """Handle client messages: pings (heartbeat) and reconnection requests."""
            nonlocal client_alive, last_client_seen
            try:
                while True:
                    raw = await websocket.receive_text()
                    last_client_seen = time.monotonic()
                    try:
                        msg = json.loads(raw)
                    except json.JSONDecodeError:
                        continue

                    msg_type = msg.get("type", "")
                    if msg_type in {"ping", "pong"}:
                        if msg_type == "ping":
                            await websocket.send_text(json.dumps({
                                "type": "pong",
                                "timestamp": time.time(),
                                "seq": msg.get("seq", 0),
                            }))
                    elif msg_type == "reconnect":
                        token = msg.get("reconnect_token", "")
                        from_seq = msg.get("from_seq", 0)
                        _prune_reconnect_tokens()
                        entry = _reconnect_store.get(token)
                        if entry and entry["expires_at"] > time.monotonic():
                            replay = telemetry_bus.get_history_from(from_seq, limit=200)
                            await websocket.send_text(json.dumps({
                                "type": "replay",
                                "from_seq": from_seq,
                                "events": replay,
                                "latest_seq": telemetry_bus.latest_sequence(),
                            }))
                        else:
                            await websocket.send_text(json.dumps({
                                "type": "error",
                                "code": "INVALID_RECONNECT_TOKEN",
                                "message": "Reconnection token expired or invalid",
                            }))
                    elif msg_type == "subscribe":
                        pass  # future: per-client event filtering
            except WebSocketDisconnect:
                client_alive = False

        async def send_loop():
            """Send telemetry events and server heartbeats."""
            nonlocal last_sequence, client_alive, last_client_seen

            try:
                while True:
                    try:
                        event = await asyncio.wait_for(queue.get(), timeout=HEARTBEAT_INTERVAL)
                        last_sequence += 1
                        await websocket.send_text(json.dumps({
                            "type": "telemetry",
                            "seq": last_sequence,
                            "event": event,
                        }))
                    except TimeoutError:
                        if time.monotonic() - last_client_seen > HEARTBEAT_INTERVAL + HEARTBEAT_TIMEOUT:
                            logger.warning("WebSocket client heartbeat timeout — disconnecting")
                            client_alive = False
                            break
                        try:
                            ping_payload = json.dumps({
                                "type": "ping",
                                "timestamp": time.time(),
                            })
                            await asyncio.wait_for(
                                websocket.send_text(ping_payload),
                                timeout=5.0,
                            )
                        except Exception:
                            client_alive = False
                            break
            except WebSocketDisconnect:
                client_alive = False

        receive_task = asyncio.create_task(receive_loop())
        send_task = asyncio.create_task(send_loop())
        done, pending = await asyncio.wait(
            {receive_task, send_task}, return_when=asyncio.FIRST_COMPLETED
        )
        for task in pending:
            task.cancel()
        for task in done:
            if task.cancelled():
                continue
            exc = task.exception()
            if exc is None or isinstance(exc, WebSocketDisconnect):
                continue
            logger.error("WebSocket task error: %s", exc)
    except WebSocketDisconnect:
        logger.info("WebSocket client disconnected (clean)")
    except Exception as exc:
        logger.error("WebSocket error: %s", exc)
    finally:
        record_ws_disconnect()
        telemetry_bus.unsubscribe(queue)
        # Keep reconnection token alive for the window
        if reconnection_token and reconnection_token in _reconnect_store:
            _reconnect_store[reconnection_token]["last_seq"] = last_sequence
