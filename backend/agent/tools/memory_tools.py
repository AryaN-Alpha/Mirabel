"""Memory tools — read-only search over Mirabel's long-term (RAG) memory."""

from __future__ import annotations

from langchain_core.tools import tool

from memory.services.chroma_client import collection_stats
from memory.services.retrieval import retrieve_relevant_memories


@tool
def search_memories(query: str) -> dict:
    """Search Mirabel's long-term memory for anything relevant to a topic or question.

    Args:
        query: What to search for.
    """
    memories = retrieve_relevant_memories(query_text=query)
    return {"memories": [{"text": m["text"], "metadata": m["metadata"]} for m in memories]}


@tool
def get_memory_stats() -> dict:
    """Get overall stats about Mirabel's long-term memory — total count, mood breakdown, date range."""
    return collection_stats()


TOOLS = [search_memories, get_memory_stats]
