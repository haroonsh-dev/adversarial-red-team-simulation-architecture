"""Python decorator — wrap any tool function with ARTSA containment."""

from __future__ import annotations

from contextvars import ContextVar
from functools import wraps
from typing import Any, Callable, Dict, Optional
from uuid import uuid4

from artsa.client import ArtsaClient

# Sticky session across nested tool calls in the same async/sync context.
_session_ctx: ContextVar[Optional[str]] = ContextVar("artsa_session_id", default=None)


def current_session_id() -> Optional[str]:
    return _session_ctx.get()


def bind_session(session_id: Optional[str] = None) -> str:
    """Bind (or create) a session id for the current context; returns the id."""
    sid = session_id or _session_ctx.get() or str(uuid4())
    _session_ctx.set(sid)
    return sid


def guarded_tool(
    client: ArtsaClient,
    *,
    session_id: Optional[str] = None,
    agent_id: str = "python-agent",
    tool_name: Optional[str] = None,
    arg_mapper: Optional[Callable[..., Dict[str, Any]]] = None,
) -> Callable[[Callable[..., Any]], Callable[..., Any]]:
    """Decorator that evaluates each call against ARTSA before running the tool.

    Session id is sticky via contextvars when not passed explicitly — nested
    tools in one request share one session for trajectory scoring.

    Example::

        client = ArtsaClient(api_key="...")

        @guarded_tool(client, agent_id="support-bot")
        def read_file(path: str) -> str:
            return open(path).read()
    """

    def decorator(fn: Callable[..., Any]) -> Callable[..., Any]:
        name = tool_name or fn.__name__

        @wraps(fn)
        def wrapper(*args: Any, **kwargs: Any) -> Any:
            sid = session_id or bind_session()
            arguments = arg_mapper(*args, **kwargs) if arg_mapper else {**kwargs}
            if args and not arg_mapper:
                # Prefer kwargs-style names when possible
                import inspect

                try:
                    bound = inspect.signature(fn).bind_partial(*args, **kwargs)
                    bound.apply_defaults()
                    arguments = dict(bound.arguments)
                except (TypeError, ValueError):
                    arguments = {"args": list(args), **kwargs}
            client.guard_tool_call(sid, agent_id, name, arguments)
            result = fn(*args, **kwargs)
            client.guard_tool_result(sid, agent_id, name, arguments, result)
            return result

        return wrapper

    return decorator
