"""
Single source of truth for ChromaDB access.
Wraps the chromadb-client SDK so the rest of the codebase can be tested with a fake.
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
    """Process-wide singleton. PersistentClient runs locally without a separate Docker server."""
    import os
    chroma_path = os.path.join(django_settings.BASE_DIR, "chroma_data")
    return chromadb.PersistentClient(path=chroma_path, settings=Settings())


def get_collection(user_label: str) -> chromadb.Collection:
    """One collection per user, created on first access."""
    client = get_client()
    return client.get_or_create_collection(
        name=f"mirabel_user_{user_label}",
        metadata={"hnsw:space": "cosine"},
    )


def add_memory(
    *,
    user_label: str,
    memory_id: str,
    text: str,
    metadata: dict[str, Any],
) -> None:
    """Idempotent on memory_id — Chroma upserts on duplicate IDs."""
    collection = get_collection(user_label)
    collection.upsert(
        ids=[memory_id],
        documents=[text],
        metadatas=[metadata],
    )


def query_memories(
    *, user_label: str, query_text: str, n_results: int = 12
) -> list[dict[str, Any]]:
    """
    Returns {id, text, metadata, similarity} dicts.
    Over-fetches (n_results=12) so the re-ranker in retrieval.py has room to work.
    """
    collection = get_collection(user_label)
    raw = collection.query(query_texts=[query_text], n_results=n_results)

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
