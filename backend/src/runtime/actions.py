"""Gateway-facing runtime actions.

Session KILL remains the session-status mapping of BLOCK so ingest/SDK
``block_actions`` keep working. QUARANTINE on the proxy/ingest path is
withheld into a digest-only operator approval (``PENDING_APPROVAL``) rather
than returned to the client.
"""

from __future__ import annotations

from enum import Enum


class RuntimeAction(str, Enum):
    ALLOW = "ALLOW"
    QUARANTINE = "QUARANTINE"
    APPROVAL_REQUIRED = "APPROVAL_REQUIRED"
    BLOCK = "BLOCK"


_RANK = {
    RuntimeAction.ALLOW: 0,
    RuntimeAction.QUARANTINE: 1,
    RuntimeAction.APPROVAL_REQUIRED: 2,
    RuntimeAction.BLOCK: 3,
}


def strictest(*actions: RuntimeAction) -> RuntimeAction:
    chosen = RuntimeAction.ALLOW
    for action in actions:
        if _RANK[action] > _RANK[chosen]:
            chosen = action
    return chosen
