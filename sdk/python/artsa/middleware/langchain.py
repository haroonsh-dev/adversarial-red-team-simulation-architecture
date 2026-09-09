"""LangChain Containment Callback Interceptor."""

from typing import Any, Dict
from artsa.client import ArtsaClient, ArtsaBlockedError
from artsa.middleware.base import BaseMiddleware


class LangChainContainmentCallback(BaseMiddleware):
    """Pre-execution LangChain observability callback.

    Callbacks cannot reliably prevent LangChain from consuming a completed
    result. Use ``wrap_langgraph_tool`` or ``guard_langgraph_tools`` for the
    enforceable pre- and post-execution gate.
    """

    def __init__(self, client: ArtsaClient, session_id: str, agent_id: str) -> None:
        super().__init__(client)
        self.session_id = session_id
        self.agent_id = agent_id

    def intercept_tool(self, session_id: str, agent_id: str, tool_name: str, arguments: Dict[str, Any]) -> Dict[str, Any]:
        return self.client.guard_tool_call(
            session_id=session_id,
            agent_id=agent_id,
            tool_name=tool_name,
            arguments=arguments,
        )

    def on_tool_start(
        self,
        serialized: Dict[str, Any],
        input_str: str,
        **kwargs: Any,
    ) -> None:
        """Callback invoked when LangChain agent starts executing a tool."""
        tool_name = serialized.get("name", "unknown_tool")
        try:
            self.intercept_tool(
                session_id=self.session_id,
                agent_id=self.agent_id,
                tool_name=tool_name,
                arguments={"input": input_str},
            )
        except ArtsaBlockedError as exc:
            raise RuntimeError(str(exc)) from exc
