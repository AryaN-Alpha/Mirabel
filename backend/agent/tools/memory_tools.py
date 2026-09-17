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
    compact_memories = []
    for m in memories:
        meta = m.get("metadata") or {}
        item = {
            "text": m.get("text", ""),
            "date": meta.get("created_at", "")[:10],
            "type": meta.get("kind", "turn"),
        }
        if meta.get("fact_type"):
            item["fact_type"] = meta["fact_type"]
        elif meta.get("mood") and meta.get("mood") != "neutral":
            item["mood"] = meta["mood"]
        compact_memories.append(item)
    return {"memories": compact_memories}


@tool
def get_memory_stats() -> dict:
    """Get overall stats about Mirabel's long-term memory — total count, mood breakdown, date range."""
    return collection_stats()


TOOLS = [search_memories, get_memory_stats]
