"""Compat shims for third-party packages.

LangChain 1.x removed ``langchain.verbose`` / ``.debug`` / ``.llm_cache``, but
``langchain_core.globals.get_verbose()`` still reads them when the ``langchain``
meta-package is installed. Without this shim, every ChatOpenAI / Ollama call
fails with:

    AttributeError: module 'langchain' has no attribute 'verbose'

Call ``patch_langchain_globals()`` once at process start (before any LLM use).
"""

from __future__ import annotations

import logging

logger = logging.getLogger(__name__)


def patch_langchain_globals() -> None:
    try:
        import langchain
    except ImportError:
        return

    patched: list[str] = []
    if not hasattr(langchain, "verbose"):
        langchain.verbose = False  # type: ignore[attr-defined]
        patched.append("verbose")
    if not hasattr(langchain, "debug"):
        langchain.debug = False  # type: ignore[attr-defined]
        patched.append("debug")
    if not hasattr(langchain, "llm_cache"):
        langchain.llm_cache = None  # type: ignore[attr-defined]
        patched.append("llm_cache")

    if patched:
        logger.info("Patched langchain globals for core compat: %s", ", ".join(patched))
