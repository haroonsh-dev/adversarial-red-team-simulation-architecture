"""LangGraph-compatible tool wrappers with ARTSA containment."""

from __future__ import annotations

from functools import wraps
from typing import Any, Callable, Dict, Optional
from uuid import uuid4

from artsa.client import ArtsaBlockedError, ArtsaClient


def wrap_langgraph_tool(
    client: ArtsaClient,
    *,
    session_id: Optional[str] = None,
    agent_id: str = "langgraph-agent",
    tool_name: Optional[str] = None,
) -> Callable[[Callable[..., Any]], Callable[..., Any]]:
    """Decorator for LangGraph / LangChain ``@tool`` functions.

    Apply *outside* or *instead of* framework decorators so ARTSA runs first::

        @tool
        @wrap_langgraph_tool(client, agent_id="ops-bot")
        def search(query: str) -> str:
            ...
    """

    def decorator(fn: Callable[..., Any]) -> Callable[..., Any]:
        name = tool_name or getattr(fn, "name", None) or fn.__name__
        sid = session_id or str(uuid4())

        @wraps(fn)
        def wrapper(*args: Any, **kwargs: Any) -> Any:
            arguments: Dict[str, Any] = dict(kwargs)
            if args:
                arguments["args"] = list(args)
            try:
                client.guard_tool_call(sid, agent_id, name, arguments)
            except ArtsaBlockedError:
                raise
            result = fn(*args, **kwargs)
            client.guard_tool_result(sid, agent_id, name, arguments, result)
            return result

        # Preserve LangChain tool metadata if present
        for attr in ("name", "description", "args_schema", "return_direct"):
            if hasattr(fn, attr):
                setattr(wrapper, attr, getattr(fn, attr))
        return wrapper

    return decorator


def guard_langgraph_tools(
    client: ArtsaClient,
    tools: Dict[str, Callable[..., Any]],
    *,
    session_id: str,
    agent_id: str,
) -> Dict[str, Callable[..., Any]]:
    """Return a new dict of tools wrapped with ARTSA guards (LangGraph ToolNode-friendly)."""
    wrapped: Dict[str, Callable[..., Any]] = {}
    for name, fn in tools.items():
        wrapped[name] = wrap_langgraph_tool(
            client, session_id=session_id, agent_id=agent_id, tool_name=name
        )(fn)
    return wrapped
