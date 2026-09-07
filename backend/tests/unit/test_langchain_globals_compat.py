"""LangChain globals compat for ChatModel construction."""

from src.compat.langchain_globals import patch_langchain_globals


def test_patch_allows_chat_openai_construct():
    patch_langchain_globals()
    import langchain
    from langchain_openai import ChatOpenAI

    assert hasattr(langchain, "verbose")
    # Construction previously raised AttributeError: no attribute 'verbose'
    llm = ChatOpenAI(model="llama3.2", api_key="x", base_url="http://127.0.0.1:11434")
    assert llm is not None
