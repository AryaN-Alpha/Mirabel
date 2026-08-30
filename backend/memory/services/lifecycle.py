"""Memory lifecycle maintenance — bounds the Chroma collection's growth over
time without ever touching valuable history.

Deliberately conservative: only deletes a memory when it is BOTH old AND was
never salient in the first place (never a "this got old so delete it"
policy on its own, and never touches kind="summary" rows, which are pinned
at 0.9 salience by design and are exactly the compact long-term record this
system exists to keep). See CLAUDE.md's memory Phase 2 rules and the
optimization doc's "do not delete valuable historical information merely
because it is old" — importance/salience is the gate, age alone is not.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from django.conf import settings

from memory.services.chroma_client import delete_memories, get_collection

logger = logging.getLogger(__name__)


def prune_stale_memories() -> dict[str, int]:
    """Deletes turn-memories that are both older than
    settings.MEMORY_PRUNE_MAX_AGE_DAYS and were never above
    settings.MEMORY_PRUNE_SALIENCE_CEILING. Never touches kind="summary".

    kind="fact" rows (memory/services/facts.py) need no special-casing here:
    they're pinned at salience=0.75, well above the default 0.25 ceiling, so
    the salience check below already exempts them — including superseded
    ones, which keep their original salience and are preserved for audit
    history exactly like everything else this function chooses not to touch.
    """
    collection = get_collection()
    raw = collection.get(include=["metadatas"])
    ids = raw["ids"] or []
    metas = raw["metadatas"] or []

    cutoff = datetime.now(timezone.utc) - timedelta(days=settings.MEMORY_PRUNE_MAX_AGE_DAYS)
    ceiling = settings.MEMORY_PRUNE_SALIENCE_CEILING

    stale_ids = []
    for mid, meta in zip(ids, metas):
        meta = meta or {}
        if meta.get("kind") == "summary":
            continue
        salience = meta.get("salience")
        if salience is None or salience >= ceiling:
            continue
        created_at = meta.get("created_at")
        try:
            created = datetime.fromisoformat(created_at) if created_at else None
        except ValueError:
            created = None
        if created is None or created >= cutoff:
            continue
        stale_ids.append(mid)

    delete_memories(stale_ids)
    result = {"scanned": len(ids), "deleted": len(stale_ids)}
    logger.info("memory lifecycle: pruned %s of %s memories", result["deleted"], result["scanned"])
    return result
