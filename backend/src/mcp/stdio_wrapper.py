"""ARTSA live containment wrapper for newline-delimited MCP stdio servers.

The wrapper deliberately owns the client/server pipe: it never asks a client
to voluntarily withhold an unsafe result.  Protocol bodies remain transient;
all ARTSA evidence is digest-plus-redacted metadata.
"""

from __future__ import annotations

import argparse
import asyncio
import copy
import json
import os
import signal
import sys
import uuid
from dataclasses import dataclass
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.config import settings
from src.data.orm import SessionORM
from src.data.redis_client import get_redis_stream_client
from src.runtime.actions import RuntimeAction
from src.runtime.audit import record_runtime_audit
from src.runtime.gate import get_runtime_gate
from src.runtime.circuit_breaker import circuit_breaker, record_breaker_trip
from src.services.approval_service import consume_retry_token, create_request
from src.services.mcp_proxy import MCPJsonRpcRequest, MCPProxyInterceptor


_TOOL_METHOD = "tools/call"
_BLOCK_CODE = -32003
_APPROVAL_CODE = -32004
_PROTOCOL_CODE = -32000


def _id_key(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), default=str)


def _json_line(value: dict[str, Any]) -> bytes:
    return json.dumps(value, separators=(",", ":"), default=str).encode() + b"\n"


def _clean_params(params: dict[str, Any]) -> tuple[dict[str, Any], str | None]:
    """Remove ARTSA retry metadata before forwarding and digesting a call."""
    cleaned = copy.deepcopy(params)
    meta = cleaned.get("_meta")
    token: str | None = None
    if isinstance(meta, dict):
        artsa = meta.get("artsa")
        if isinstance(artsa, dict):
            raw = artsa.pop("retry_token", None)
            token = raw if isinstance(raw, str) else None
            if not artsa:
                meta.pop("artsa", None)
        if not meta:
            cleaned.pop("_meta", None)
    return cleaned, token


def _tool_name(params: dict[str, Any]) -> str:
    return f"mcp.tools/call:{str(params.get('name') or params.get('tool') or 'unknown')}"


def _result_scan_text(value: Any) -> str:
    """Flatten a JSON result without JSON escaping away detector evidence."""
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        return "\n".join(f"{key}: {_result_scan_text(item)}" for key, item in value.items())
    if isinstance(value, list):
        return "\n".join(_result_scan_text(item) for item in value)
    return str(value)


def _error(request_id: Any, code: int, message: str, *, artsa: dict[str, Any] | None = None) -> dict[str, Any]:
    error: dict[str, Any] = {"code": code, "message": message}
    if artsa:
        error["data"] = {"artsa": artsa}
    return {"jsonrpc": "2.0", "id": request_id, "error": error}


@dataclass
class PendingToolCall:
    request_id: Any
    tool_name: str
    arguments: dict[str, Any]
    retry_authorized: bool


class _StdoutWriter:
    """Minimal async-writer adapter; stdout is the MCP protocol channel."""

    def write(self, data: bytes) -> None:
        sys.stdout.buffer.write(data)
        sys.stdout.buffer.flush()

    async def drain(self) -> None:
        return None


class MCPStdioWrapper:
    def __init__(self, db: AsyncSession, *, tenant_id: str | None = None) -> None:
        self.db = db
        self.tenant_id = tenant_id or settings.ARTSA_TENANT_ID
        self.session_id = uuid.uuid4()
        self.redis = get_redis_stream_client()
        self.interceptor = MCPProxyInterceptor()
        self.pending: dict[str, PendingToolCall | None] = {}
        self.stop = asyncio.Event()
        self._stdout_lock = asyncio.Lock()

    async def initialize_session(self) -> None:
        row = (await self.db.execute(select(SessionORM).where(SessionORM.id == str(self.session_id)))).scalar_one_or_none()
        if row is None:
            self.db.add(SessionORM(id=str(self.session_id), agent_id="artsa-mcp-stdio", tenant_id=self.tenant_id, status="ACTIVE"))
            await self.db.commit()

    async def _apply_action(self, action: str) -> None:
        row = (await self.db.execute(
            select(SessionORM).where(SessionORM.id == str(self.session_id))
        )).scalar_one_or_none()
        if row is None:
            return
        status = {
            "KILL": "BREACHED",
            "QUARANTINE": "QUARANTINED",
            "PENDING_APPROVAL": "PENDING_APPROVAL",
            "RELEASE": "ACTIVE",
        }.get(action.upper())
        if status:
            row.status = status

    async def _session_accepts_tool_call(self) -> bool:
        row = (await self.db.execute(
            select(SessionORM).where(SessionORM.id == str(self.session_id))
        )).scalar_one_or_none()
        return bool(row and row.status == "ACTIVE")

    async def _write_client(self, writer: asyncio.StreamWriter, value: dict[str, Any]) -> None:
        async with self._stdout_lock:
            writer.write(_json_line(value))
            await writer.drain()

    async def _protocol_failure(self, client_writer: asyncio.StreamWriter, request_id: Any = None) -> None:
        await self._apply_action("KILL")
        await self.db.commit()
        if request_id is not None:
            await self._write_client(client_writer, _error(request_id, _PROTOCOL_CODE, "ARTSA MCP protocol containment failure."))
        self.stop.set()

    async def handle_client(
        self, obj: dict[str, Any], child_writer: asyncio.StreamWriter, client_writer: asyncio.StreamWriter
    ) -> None:
        method = obj.get("method")
        request_id = obj.get("id")
        if not isinstance(method, str) or obj.get("jsonrpc", "2.0") != "2.0":
            await self._protocol_failure(client_writer, request_id)
            return
        params = obj.get("params") or {}
        if not isinstance(params, dict):
            await self._protocol_failure(client_writer, request_id)
            return
        is_notification = method.startswith("notifications/")
        if is_notification:
            child_writer.write(_json_line(obj))
            await child_writer.drain()
            return
        if method != _TOOL_METHOD:
            if request_id is not None:
                self.pending[_id_key(request_id)] = None
            child_writer.write(_json_line(obj))
            await child_writer.drain()
            return

        clean_params, retry_token = _clean_params(params)
        tool_name = _tool_name(clean_params)
        retry_authorized = False
        if retry_token:
            retry_authorized = consume_retry_token(
                self.redis, retry_token, tenant_id=self.tenant_id, session_id=self.session_id,
                tool_name=tool_name, arguments=clean_params,
            )
            if not retry_authorized:
                await self._write_client(client_writer, _error(request_id, _BLOCK_CODE, "Invalid or already used ARTSA approval retry token."))
                return

        if await circuit_breaker.is_open(self.db, tenant_id=self.tenant_id, session_id=self.session_id):
            await self._write_client(client_writer, _error(
                request_id, _BLOCK_CODE, "ARTSA containment: circuit breaker open.",
                artsa={"session_id": str(self.session_id), "category": "ASI08"},
            ))
            return

        if not retry_authorized and not await self._session_accepts_tool_call():
            await self._write_client(client_writer, _error(
                request_id, _BLOCK_CODE, "ARTSA containment: session is not active.",
                artsa={"session_id": str(self.session_id)},
            ))
            return

        inspected = self.interceptor.inspect_request(
            MCPJsonRpcRequest(method=method, id=request_id, params=clean_params), session_id=self.session_id
        )
        if not inspected.is_safe:
            opened = await circuit_breaker.record_block(
                self.db, tenant_id=self.tenant_id, session_id=self.session_id
            )
            if opened:
                record_breaker_trip(self.session_id)
                await self._apply_action("KILL")
            await self.db.commit()
            await self._write_client(client_writer, _error(
                request_id, _BLOCK_CODE, "ARTSA containment: MCP tool call blocked.",
                artsa={"session_id": str(self.session_id), "categories": ["MCP_PREEXEC_CONTAINMENT"]},
            ))
            if opened:
                self.stop.set()
            return
        forwarded = {**obj, "params": clean_params}
        if request_id is not None:
            self.pending[_id_key(request_id)] = PendingToolCall(request_id, tool_name, clean_params, retry_authorized)
        child_writer.write(_json_line(forwarded))
        await child_writer.drain()

    async def handle_child(self, obj: dict[str, Any], client_writer: asyncio.StreamWriter) -> None:
        if "id" not in obj:
            await self._write_client(client_writer, obj)
            return
        key = _id_key(obj.get("id"))
        if key not in self.pending:
            await self._protocol_failure(client_writer, obj.get("id"))
            return
        pending = self.pending.pop(key)
        if pending is None or "result" not in obj:
            await self._write_client(client_writer, obj)
            return
        transient = _result_scan_text(obj["result"])
        decision = get_runtime_gate().evaluate(
            output_text=transient, session_id=self.session_id, untrusted_tool_result=True,
        )
        if decision.action == RuntimeAction.ALLOW or (decision.action == RuntimeAction.QUARANTINE and pending.retry_authorized):
            if decision.action != RuntimeAction.ALLOW:
                record_runtime_audit(get_runtime_gate().to_audit(decision, session_id=self.session_id))
            await self._write_client(client_writer, obj)
            return
        record_runtime_audit(get_runtime_gate().to_audit(decision, session_id=self.session_id))
        if decision.action == RuntimeAction.BLOCK:
            opened = await circuit_breaker.record_block(
                self.db, tenant_id=self.tenant_id, session_id=self.session_id
            )
            if opened:
                record_breaker_trip(self.session_id)
                await self._apply_action("KILL")
            await self.db.commit()
            await self._write_client(client_writer, _error(
                pending.request_id, _BLOCK_CODE, "ARTSA containment: MCP tool result blocked.",
                artsa={"session_id": str(self.session_id), "action": "BLOCK", "body_sha256": decision.body_sha256,
                       "categories": [f.category for f in decision.findings]},
            ))
            if opened:
                self.stop.set()
            return
        approval = await create_request(
            self.db, tenant_id=self.tenant_id, session_id=self.session_id, tool_name=pending.tool_name,
            arguments=pending.arguments, findings=decision.findings,
            requester={"transport": "mcp_stdio", "method": _TOOL_METHOD},
        )
        await self._apply_action("PENDING_APPROVAL")
        await self.db.commit()
        await self._write_client(client_writer, _error(
            pending.request_id, _APPROVAL_CODE, "ARTSA containment: MCP tool result requires operator approval.",
            artsa={"session_id": str(self.session_id), "approval_id": approval.id, "action": "QUARANTINE",
                   "body_sha256": decision.body_sha256, "categories": [f.category for f in decision.findings]},
        ))


async def _read_line(reader: asyncio.StreamReader, limit: int) -> bytes | None:
    line = await reader.readline()
    if not line:
        return None
    if len(line) > limit:
        raise ValueError("MCP frame exceeds configured limit")
    return line


class _StdinFrameReader:
    """Read newline-delimited protocol frames directly from fd 0.

    `sys.stdin.buffer.readline()` can retain a pipe read in an executor when
    the wrapper is embedded by desktop MCP hosts.  Reading the descriptor
    directly gives EOF deterministic semantics while retaining bytes after a
    newline for the next JSON-RPC message.
    """

    def __init__(self, fd: int) -> None:
        self._fd = fd
        self._buffer = bytearray()
        self._eof = False
        self._ready = asyncio.Event()
        self._loop = asyncio.get_running_loop()
        os.set_blocking(fd, False)
        self._loop.add_reader(fd, self._on_ready)

    def close(self) -> None:
        self._loop.remove_reader(self._fd)

    def _on_ready(self) -> None:
        while True:
            try:
                chunk = os.read(self._fd, 65536)
            except BlockingIOError:
                break
            if not chunk:
                self._eof = True
                self.close()
                break
            self._buffer.extend(chunk)
        self._ready.set()

    async def readline(self, limit: int) -> bytes | None:
        while True:
            # No event-loop callback can run between this clear and the await
            # below, so readiness cannot be lost between frames.
            self._ready.clear()
            newline = self._buffer.find(b"\n")
            if newline >= 0:
                line = bytes(self._buffer[:newline + 1])
                del self._buffer[:newline + 1]
                if len(line) > limit:
                    raise ValueError("MCP frame exceeds configured limit")
                return line
            if len(self._buffer) > limit:
                raise ValueError("MCP frame exceeds configured limit")
            if self._eof:
                if not self._buffer:
                    return None
                raise ValueError("unterminated MCP frame at EOF")
            await self._ready.wait()


async def run_wrapper(command: list[str]) -> int:
    if not command:
        return 2
    from src.data.db import get_engine, get_session_factory, init_db

    await init_db()
    process = await asyncio.create_subprocess_exec(
        *command, stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.DEVNULL, start_new_session=True,
    )
    assert process.stdin and process.stdout
    client_writer = _StdoutWriter()
    stdin_reader = _StdinFrameReader(sys.stdin.fileno())
    clean_client_eof = False
    factory = get_session_factory()
    async with factory() as db:
        wrapper = MCPStdioWrapper(db)
        await wrapper.initialize_session()
        client_closed = asyncio.Event()
        pending_drained = asyncio.Event()
        pending_drained.set()

        def mark_pending() -> None:
            if wrapper.pending:
                pending_drained.clear()
            else:
                pending_drained.set()

        async def client_to_child() -> None:
            nonlocal clean_client_eof
            try:
                while not wrapper.stop.is_set():
                    line = await stdin_reader.readline(settings.ARTSA_MCP_STDIO_MAX_LINE_BYTES)
                    if line is None:
                        # Closing a subprocess pipe is portable; write_eof()
                        # is not reliably delivered by every asyncio pipe
                        # transport used by desktop MCP hosts.
                        process.stdin.close()
                        await process.stdin.wait_closed()
                        client_closed.set()
                        clean_client_eof = True
                        if not wrapper.pending:
                            wrapper.stop.set()
                        break
                    obj = json.loads(line)
                    if not isinstance(obj, dict): raise ValueError("JSON-RPC frame must be an object")
                    if str(obj.get("method", "")).startswith("notifications/") and len(line) > settings.ARTSA_MCP_STDIO_MAX_NOTIFICATION_BYTES:
                        raise ValueError("MCP notification exceeds configured limit")
                    await wrapper.handle_client(obj, process.stdin, client_writer)
                    mark_pending()
            except Exception:
                await wrapper._protocol_failure(client_writer)

        async def child_to_client() -> None:
            try:
                while not wrapper.stop.is_set():
                    line = await _read_line(process.stdout, settings.ARTSA_MCP_STDIO_MAX_LINE_BYTES)
                    if line is None:
                        wrapper.stop.set(); break
                    obj = json.loads(line)
                    if not isinstance(obj, dict): raise ValueError("child JSON-RPC frame must be an object")
                    if str(obj.get("method", "")).startswith("notifications/") and len(line) > settings.ARTSA_MCP_STDIO_MAX_NOTIFICATION_BYTES:
                        raise ValueError("child MCP notification exceeds configured limit")
                    await wrapper.handle_child(obj, client_writer)
                    mark_pending()
                    if client_closed.is_set() and not wrapper.pending:
                        wrapper.stop.set()
            except Exception:
                await wrapper._protocol_failure(client_writer)

        tasks = [asyncio.create_task(client_to_child()), asyncio.create_task(child_to_client())]

        async def stop_after_client_eof() -> None:
            """Flush correlated replies after EOF, but never orphan a child."""
            await client_closed.wait()
            try:
                await asyncio.wait_for(pending_drained.wait(), timeout=5)
            except TimeoutError:
                # A child that does not complete an in-flight request after its
                # input pipe closes is a protocol failure, not a daemon.
                await wrapper._protocol_failure(client_writer)
            else:
                wrapper.stop.set()

        eof_task = asyncio.create_task(stop_after_client_eof())
        await wrapper.stop.wait()
        for task in [*tasks, eof_task]: task.cancel()
        await asyncio.gather(*tasks, eof_task, return_exceptions=True)
        stdin_reader.close()
    # The wrapper is a short-lived CLI process.  In particular, aiosqlite
    # owns a worker thread until its engine is disposed; leaving it open keeps
    # a completed stdio wrapper alive after both pipes have closed.
    await get_engine().dispose()
    if process.returncode is None:
        # Use os.kill directly so shutdown is delivered even while asyncio is
        # tearing down its subprocess transport.
        os.killpg(process.pid, signal.SIGTERM)
        if clean_client_eof:
            # We have already closed the child's stdin and flushed every
            # correlated response.  Do not let a non-cooperative child hold
            # the wrapper open; SIGTERM is delivered before this process exits.
            return 0
        try:
            await asyncio.wait_for(process.wait(), timeout=2)
        except TimeoutError:
            process.kill()
            try:
                await asyncio.wait_for(process.wait(), timeout=2)
            except TimeoutError:
                # The child has received SIGKILL.  Do not keep the wrapper
                # process alive forever if an OS-level watcher fails to reap.
                return 0 if clean_client_eof else 1
    return process.returncode if process.returncode is not None else 1


def main() -> int:
    parser = argparse.ArgumentParser(description="ARTSA MCP stdio containment wrapper")
    parser.add_argument("command", nargs=argparse.REMAINDER, help="Child MCP server command, after --")
    args = parser.parse_args()
    command = args.command[1:] if args.command[:1] == ["--"] else args.command
    return asyncio.run(run_wrapper(command))


if __name__ == "__main__":
    raise SystemExit(main())
