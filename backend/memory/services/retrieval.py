import logging
from datetime import datetime, timezone

from django.conf import settings

from memory.services.chroma_client import query_memories
from memory.services.salience import score_for_retrieval

logger = logging.getLogger(__name__)


def retrieve_relevant_memories(*, query_text: str) -> list[dict]:
    """
    Returns top-k memories re-ranked by combined score.
    Falls back to [] on any error — chat must never break because of memory.
    """
    try:
        raw = query_memories(query_text=query_text, n_results=12)
    except Exception as exc:
        logger.exception("memory retrieval failed: %s", exc)
        return []

    now = datetime.now(timezone.utc)
    scored: list[tuple[float, dict]] = []
    for hit in raw:
        meta = hit["metadata"]
        try:
            created = datetime.fromisoformat(meta["created_at"])
            age_days = max(0.0, (now - created).total_seconds() / 86400.0)
        except (KeyError, ValueError):
            age_days = 365.0

        score = score_for_retrieval(
            similarity=hit["similarity"],
            salience=float(meta.get("salience", 0.3)),
            age_days=age_days,
            half_life_days=settings.MEMORY_RECENCY_HALF_LIFE_DAYS,
        )
        scored.append((score, hit))

    scored.sort(key=lambda pair: pair[0], reverse=True)
    top = scored[: settings.MEMORY_RETRIEVAL_TOP_K]
    return [hit for _, hit in top]


def format_memories_for_prompt(memories: list[dict]) -> str:
    """Renders memories as a system-prompt addendum. Empty string if none."""
    if not memories:
        return ""
    lines = [
        "# RELEVANT MEMORIES"
        " (private — do not quote verbatim, but let them shape your reaction)"
    ]
    for m in memories:
        meta = m["metadata"]
        kind = meta.get("kind", "turn")
        when = meta.get("created_at", "")[:10]
        if kind == "summary":
            lines.append(f"- [weekly summary, week ending {when}] {m['text']}")
        else:
            role = meta.get("role", "?")
            mood = meta.get("mood", "neutral")
            lines.append(f"- [{when} · {role} · mood={mood}] {m['text']}")
    return "\n".join(lines)
