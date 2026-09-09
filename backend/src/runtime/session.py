"""Apply runtime gate actions to the live session (tracker + memory store).

BLOCK maps to ingest KILL / ``BREACHED``. QUARANTINE (deny/expire or
unapproved strip path) maps to ``QUARANTINED``. Operator-queued proxy
quarantine uses ``PENDING_APPROVAL`` via the approval helper, not this mapper.
"""

from __future__ import annotations

import logging
import uuid

from src.runtime.actions import RuntimeAction

logger = logging.getLogger(__name__)


def apply_runtime_session_action(session_id: uuid.UUID, action: RuntimeAction) -> None:
    """Ensure the session exists, then apply the durable containment status."""
    if action in (RuntimeAction.ALLOW, RuntimeAction.APPROVAL_REQUIRED):
        return
    if action == RuntimeAction.BLOCK:
        mapped, status, ended = "KILL", "BREACHED", True
    elif action == RuntimeAction.QUARANTINE:
        mapped, status, ended = "QUARANTINE", "QUARANTINED", False
    else:
        return

    from src.api.dependencies import get_session_tracker
    from src.core.models.sessions import Session
    from src.data import memory_store

    tracker = get_session_tracker()
    session = tracker.get_session(session_id) or memory_store.get_session(session_id)
    if session is None:
        session = Session(id=session_id, agent_id="artsa-proxy")
    tracker.active_sessions[str(session_id)] = session
    tracker.session_events.setdefault(str(session_id), [])
    if memory_store.get_session(session_id) is None:
        memory_store.store_session(session)

    tracker.apply_action(session_id, mapped)
    memory_store.apply_session_status(session_id, status, ended=ended)
    logger.debug("Runtime %s applied to session %s -> %s", action.value, session_id, status)
