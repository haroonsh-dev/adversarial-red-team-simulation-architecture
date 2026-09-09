from __future__ import annotations

import json
import uuid

from src.data.redis_client import InMemoryRedis
from src.services.approval_service import consume_retry_token, operation_digest


def test_retry_token_is_tenant_and_operation_bound_and_single_use():
    redis = InMemoryRedis()
    session_id = uuid.uuid4()
    arguments = {"path": "/tmp/report.txt"}
    token = "approval-token"
    redis.set(
        f"artsa:approval:retry:{token}",
        json.dumps(
            {
                "approval_id": "a1",
                "tenant_id": "tenant-a",
                "session_id": str(session_id),
                "operation_sha256": operation_digest(session_id, "read_file", arguments),
            }
        ),
        ttl_sec=60,
    )
    assert consume_retry_token(redis, token, tenant_id="tenant-a", session_id=session_id, tool_name="read_file", arguments=arguments)
    assert not consume_retry_token(redis, token, tenant_id="tenant-a", session_id=session_id, tool_name="read_file", arguments=arguments)


def test_retry_token_rejects_changed_operation_or_tenant():
    redis = InMemoryRedis()
    session_id = uuid.uuid4()
    token = "approval-token-2"
    args = {"path": "/tmp/report.txt"}
    redis.set(
        f"artsa:approval:retry:{token}",
        json.dumps({"tenant_id": "tenant-a", "session_id": str(session_id), "operation_sha256": operation_digest(session_id, "read_file", args)}),
        ttl_sec=60,
    )
    assert not consume_retry_token(redis, token, tenant_id="tenant-b", session_id=session_id, tool_name="read_file", arguments=args)
    assert not consume_retry_token(redis, token, tenant_id="tenant-a", session_id=session_id, tool_name="read_file", arguments={"path": "/etc/passwd"})
