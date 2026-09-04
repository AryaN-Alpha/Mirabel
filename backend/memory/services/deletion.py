"""Bulk/range deletion of the memory store — the only code path (besides
memory/services/lifecycle.py's narrow stale-prune) allowed to hard-delete
memories. Unlike lifecycle.py, this is user-initiated and intentionally not
gated by salience or kind: it exists so the user can wipe a specific
week/month/year, or everything, on demand.

Chroma is the source of truth for "what's in range" (every kind — turn,
fact, summary — is mirrored there with a created_at), so both entrypoints
below query it first, then cascade the same ids into Postgres via
chroma_id for any MemoryFact/MemorySummary rows among them. This keeps the
two stores from drifting: deleting only from Chroma would leave orphaned
Postgres audit rows; deleting only from Postgres would leave the orphaned
row still retrievable through RAG.
"""

from __future__ import annotations

import logging
from typing import Any

from django.db import transaction

from memory.models import MemoryFact, MemorySummary
from memory.services.chroma_client import delete_memories, get_collection

logger = logging.getLogger(__name__)


def _build_range_where(
    date_from: str | None, date_to: str | None, kind: str | None
) -> dict[str, Any] | None:
    conditions: list[dict[str, Any]] = []
    if kind in ("turn", "summary", "fact"):
        conditions.append({"kind": kind})
    if date_from:
        conditions.append({"created_at": {"$gte": date_from}})
    if date_to:
        conditions.append({"created_at": {"$lte": date_to}})
    if not conditions:
        return None
    if len(conditions) == 1:
        return conditions[0]
    return {"$and": conditions}


def _matching_rows(
    date_from: str | None, date_to: str | None, kind: str | None
) -> list[dict[str, Any]]:
    """Every {id, metadata} row matching the filter. No filters at all
    matches the entire collection — callers decide whether that's intended
    (delete_all) or a mistake (delete_range requires at least one filter)."""
    collection = get_collection()
    where = _build_range_where(date_from, date_to, kind)
    kwargs: dict[str, Any] = {"include": ["metadatas"]}
    if where:
        kwargs["where"] = where
    raw = collection.get(**kwargs)
    ids = raw["ids"] or []
    metas = raw["metadatas"] or []
    return [{"id": mid, "metadata": meta or {}} for mid, meta in zip(ids, metas)]


def _delete_rows(rows: list[dict[str, Any]]) -> dict[str, int]:
    """Postgres first (atomically), Chroma last — deliberately, not
    alphabetically. These are two separate systems with no shared
    transaction, so a failure partway through is possible either way; this
    ordering makes that failure self-healing on retry instead of leaving
    permanent debris:
    - If the Postgres step raises, nothing has been deleted from Chroma yet
      — retrying the same call is a clean no-op-then-succeed.
    - If the Chroma step raises (after Postgres committed), a retry's
      _matching_rows() still finds the same ids in Chroma (untouched), the
      Postgres deletes below become harmless no-ops for rows already gone,
      and Chroma deletion is retried.
    The reverse order has no such retry path: a Postgres failure after a
    successful Chroma delete would orphan those Postgres rows permanently,
    since _matching_rows() only ever reads from Chroma to find what to
    delete."""
    ids = [row["id"] for row in rows]
    fact_ids = [row["id"] for row in rows if row["metadata"].get("kind") == "fact"]
    summary_ids = [row["id"] for row in rows if row["metadata"].get("kind") == "summary"]

    with transaction.atomic():
        facts_deleted, _ = (
            MemoryFact.objects.filter(chroma_id__in=fact_ids).delete() if fact_ids else (0, None)
        )
        summaries_deleted, _ = (
            MemorySummary.objects.filter(chroma_id__in=summary_ids).delete()
            if summary_ids
            else (0, None)
        )

    delete_memories(ids)

    return {
        "deleted": len(ids),
        "facts_deleted": facts_deleted,
        "summaries_deleted": summaries_deleted,
    }


def count_range(
    date_from: str | None = None, date_to: str | None = None, kind: str | None = None
) -> int:
    """Dry-run: how many memories would delete_range(...) with these same
    args remove. Used to show a confirmation count before the real delete."""
    return len(_matching_rows(date_from, date_to, kind))


def delete_range(
    date_from: str | None = None, date_to: str | None = None, kind: str | None = None
) -> dict[str, int]:
    """Hard-deletes every memory matching the filter, cascading into
    Postgres. Requires at least one of date_from/date_to/kind — callers that
    want everything gone should use delete_all() instead, so an
    all-filters-empty call can never accidentally wipe the whole store."""
    if not date_from and not date_to and not kind:
        raise ValueError("delete_range requires at least one of date_from, date_to, kind")
    rows = _matching_rows(date_from, date_to, kind)
    result = _delete_rows(rows)
    logger.info(
        "memory deletion: range delete removed %s (facts=%s, summaries=%s) "
        "date_from=%s date_to=%s kind=%s",
        result["deleted"], result["facts_deleted"], result["summaries_deleted"],
        date_from, date_to, kind,
    )
    return result


def count_all() -> int:
    return len(_matching_rows(None, None, None))


def delete_all() -> dict[str, int]:
    """Wipes the entire memory store: every Chroma memory of every kind,
    plus every Postgres MemoryFact and MemorySummary row."""
    rows = _matching_rows(None, None, None)
    result = _delete_rows(rows)
    logger.info(
        "memory deletion: delete_all removed %s (facts=%s, summaries=%s)",
        result["deleted"], result["facts_deleted"], result["summaries_deleted"],
    )
    return result
