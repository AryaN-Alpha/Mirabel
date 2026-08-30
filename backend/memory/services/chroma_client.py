"""
Single source of truth for ChromaDB access.
Wraps the chromadb SDK so the rest of the codebase can be tested with a fake.
"""

from __future__ import annotations

import logging
from functools import lru_cache
from typing import Any

import chromadb
from chromadb.config import Settings
from django.conf import settings as django_settings

logger = logging.getLogger(__name__)


@lru_cache(maxsize=1)
def get_client() -> chromadb.ClientAPI:
    """Process-wide singleton. HttpClient talks to the chroma container so the
    Django process (host) and the Celery worker (container) share one store."""
    return chromadb.HttpClient(
        host=django_settings.CHROMA_HOST,
        port=django_settings.CHROMA_PORT,
        tenant=django_settings.CHROMA_TENANT,
        database=django_settings.CHROMA_DATABASE,
        settings=Settings(),
    )


def get_collection() -> chromadb.Collection:
    """Single collection — this app has exactly one user."""
    client = get_client()
    return client.get_or_create_collection(
        name="mirabel_memories",
        metadata={"hnsw:space": "cosine"},
    )


def add_memory(
    *,
    memory_id: str,
    text: str,
    metadata: dict[str, Any],
) -> None:
    """Idempotent on memory_id — Chroma upserts on duplicate IDs."""
    collection = get_collection()
    collection.upsert(
        ids=[memory_id],
        documents=[text],
        metadatas=[metadata],
    )


def list_memories(
    *,
    where: dict[str, Any] | None = None,
    where_document: dict[str, Any] | None = None,
    sort: str = "created_at",
    limit: int,
    offset: int,
) -> tuple[int, list[dict[str, Any]]]:
    """
    Filtered + paginated read over the whole collection.

    Chroma's .get() has no server-side sort or true offset-pagination, so this
    fetches every match for the filter (fine for a single-user collection —
    same over-fetch approach as query_memories), sorts in Python, and slices.
    Returns (total_matching, page_items) where each item is
    {id, text, metadata}.
    """
    collection = get_collection()
    kwargs: dict[str, Any] = {"include": ["documents", "metadatas"]}
    if where:
        kwargs["where"] = where
    if where_document:
        kwargs["where_document"] = where_document
    raw = collection.get(**kwargs)

    ids = raw["ids"] or []
    docs = raw["documents"] or []
    metas = raw["metadatas"] or []

    items = [
        {"id": mid, "text": doc, "metadata": meta or {}}
        for mid, doc, meta in zip(ids, docs, metas)
    ]

    sort_key = "salience" if sort == "salience" else "created_at"
    items.sort(key=lambda item: item["metadata"].get(sort_key, ""), reverse=True)

    total = len(items)
    page = items[offset : offset + limit]
    return total, page


def delete_memories(ids: list[str]) -> None:
    """No-op on an empty list — Chroma's delete() errors on ids=[]."""
    if not ids:
        return
    collection = get_collection()
    collection.delete(ids=ids)


def collection_stats() -> dict[str, Any]:
    """Total count, mood breakdown, and date range across the whole collection."""
    collection = get_collection()
    raw = collection.get(include=["metadatas"])
    metas = raw["metadatas"] or []

    mood_breakdown: dict[str, int] = {}
    dates: list[str] = []
    for meta in metas:
        mood = (meta or {}).get("mood", "neutral")
        mood_breakdown[mood] = mood_breakdown.get(mood, 0) + 1
        created_at = (meta or {}).get("created_at")
        if created_at:
            dates.append(created_at)
    dates.sort()

    return {
        "total": len(metas),
        "mood_breakdown": mood_breakdown,
        "oldest": dates[0] if dates else None,
        "newest": dates[-1] if dates else None,
    }


def query_memories(
    *, query_text: str, n_results: int = 12, where: dict[str, Any] | None = None
) -> list[dict[str, Any]]:
    """
    Returns {id, text, metadata, similarity} dicts.
    Over-fetches (n_results=12) so the re-ranker in retrieval.py has room to work.

    `where` is an optional Chroma metadata filter, passed through unchanged.
    Chroma's equality filters only match documents where the key is PRESENT
    — they do not treat a missing key as "not equal," they simply never
    match it. Only pass `where` when every candidate document is guaranteed
    to have the filtered key (e.g. memory/services/supersession.py filtering
    kind="fact" rows, which never predate that key existing). General
    retrieval over the whole collection must NOT filter this way — see
    retrieval.py's status filter, which is done in Python after fetch instead.
    """
    collection = get_collection()
    kwargs: dict[str, Any] = {"query_texts": [query_text], "n_results": n_results}
    if where:
        kwargs["where"] = where
    raw = collection.query(**kwargs)

    out: list[dict[str, Any]] = []
    if not raw["ids"] or not raw["ids"][0]:
        return out

    ids = raw["ids"][0]
    docs = raw["documents"][0] or []
    metas = raw["metadatas"][0] or []
    distances = raw["distances"][0] or []

    for mid, doc, meta, dist in zip(ids, docs, metas, distances):
        # Chroma returns cosine DISTANCE; convert to similarity.
        similarity = max(0.0, 1.0 - float(dist))
        out.append({
            "id": mid,
            "text": doc,
            "metadata": meta or {},
            "similarity": similarity,
        })
    return out
