"""Near-duplicate detection at memory write time — no LLM call, reuses the
Chroma similarity search already paid for on the read path.

Deliberately narrow: this only catches near-identical text (a very tight
similarity threshold), which is spam/repeat-message territory. It does NOT
attempt semantic contradiction/supersession ("user switched from X to Y") —
that requires either an LLM judgment call or much more sophisticated
heuristics than raw similarity can give, and is out of scope here. See
CLAUDE.md Phase 2 rules: one collection, salience computed once at write
time — this only decides whether a write happens at all.
"""

from __future__ import annotations

import logging

from django.conf import settings

from memory.services.chroma_client import query_memories

logger = logging.getLogger(__name__)


def is_near_duplicate(text: str) -> bool:
    """True if an existing memory is near-identical to `text` (similarity
    at or above settings.MEMORY_DEDUP_SIMILARITY_THRESHOLD). Fails open
    (returns False — proceed with the write) on any retrieval error, same
    fail-safe discipline as memory/services/retrieval.py."""
    try:
        hits = query_memories(query_text=text, n_results=1)
    except Exception:
        logger.debug("dedup check failed, proceeding with write", exc_info=True)
        return False
    if not hits:
        return False
    return hits[0]["similarity"] >= settings.MEMORY_DEDUP_SIMILARITY_THRESHOLD
