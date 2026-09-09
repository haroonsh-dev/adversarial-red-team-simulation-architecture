"""OpenAI function-calling / Responses API tool guard."""

from __future__ import annotations

import json
from typing import Any, Callable, Dict, Optional

from artsa.client import ArtsaClient, ArtsaBlockedError


def guard_openai_tool_call(
    client: ArtsaClient,
    *,
    session_id: str,
    agent_id: str,
    tool_call: Any,
    execute: Callable[[str, Dict[str, Any]], Any],
    enforce: bool = True,
) -> Any:
    """Evaluate an OpenAI tool_call object, then execute only if allowed.

    Works with Chat Completions `message.tool_calls[]` style objects that expose
    `.function.name` and `.function.arguments` (JSON string).
    """
    name = tool_call.function.name
    raw_args = tool_call.function.arguments
    arguments: Dict[str, Any]
    if isinstance(raw_args, str):
        try:
            arguments = json.loads(raw_args) if raw_args else {}
        except json.JSONDecodeError:
            arguments = {"raw": raw_args}
    elif isinstance(raw_args, dict):
        arguments = raw_args
    else:
        arguments = {"raw": str(raw_args)}

    client.guard_tool_call(session_id, agent_id, name, arguments, enforce=enforce)
    result = execute(name, arguments)
    client.guard_tool_result(session_id, agent_id, name, arguments, result, enforce=enforce)
    return result


def wrap_openai_tools(
    client: ArtsaClient,
    tools: Dict[str, Callable[..., Any]],
    *,
    session_id: str,
    agent_id: str,
) -> Callable[[Any], Any]:
    """Return a dispatcher that guards then runs named tools from a registry."""

    def dispatch(tool_call: Any) -> Any:
        name = tool_call.function.name
        if name not in tools:
            raise KeyError(f"Unknown tool: {name}")

        def execute(_name: str, arguments: Dict[str, Any]) -> Any:
            return tools[name](**arguments)

        return guard_openai_tool_call(
            client,
            session_id=session_id,
            agent_id=agent_id,
            tool_call=tool_call,
            execute=execute,
        )

    return dispatch


__all__ = ["guard_openai_tool_call", "wrap_openai_tools", "ArtsaBlockedError"]
