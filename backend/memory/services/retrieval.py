import hashlib
import logging
from datetime import datetime, timezone

from django.conf import settings
from django.core.cache import cache

from core.services.telemetry import log_optimization_event
from memory.services.chroma_client import query_memories
from memory.services.salience import score_for_retrieval

logger = logging.getLogger(__name__)

_CACHE_PREFIX = "memret:"


def _cache_key(query_text: str) -> str:
    # Hashed rather than the raw query text: keeps the key backend-agnostic
    # (memcached rejects keys with spaces/control chars/long length).
    digest = hashlib.sha256(query_text.strip().lower().encode()).hexdigest()
    return f"{_CACHE_PREFIX}{digest}"


def retrieve_relevant_memories(*, query_text: str) -> list[dict]:
    """
    Returns top-k memories re-ranked by combined score.
    Falls back to [] on any error — chat must never break because of memory.

    Short-TTL cached on the normalized query text (settings.
    MEMORY_RETRIEVAL_CACHE_TTL_SECONDS) — cuts duplicate Chroma round-trips
    when the same/near-identical query recurs in a short window (an agent
    run calling search_memories more than once, rapid back-to-back voice
    turns on the same topic). A cache-backend failure degrades to an
    uncached lookup, never to an error.
    """
    cache_key = None
    try:
        cache_key = _cache_key(query_text)
        cached = cache.get(cache_key)
        if cached is not None:
            log_optimization_event(category="memory_retrieval", outcome="cache_hit", count=len(cached))
            return cached
    except Exception:
        logger.debug("memory retrieval cache read failed, continuing uncached", exc_info=True)

    try:
        raw = query_memories(query_text=query_text, n_results=12)
    except Exception as exc:
        logger.exception("memory retrieval failed: %s", exc)
        return []

    now = datetime.now(timezone.utc)
    scored: list[tuple[float, dict]] = []
    for hit in raw:
        meta = hit["metadata"]
        # Excludes superseded facts (memory/services/supersession.py) without
        # a Chroma `where` filter — a `status` equality filter would exclude
        # every pre-existing row that predates this field entirely (Chroma
        # only matches when the key is present), silently emptying RAG
        # context for old data. Defaulting missing status to "active" here
        # keeps old rows unaffected and only screens out explicit supersession.
        if meta.get("status", "active") == "superseded":
            continue
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
    # Relevance floor: a weak match shouldn't ride into context just because
    # it landed in the top-K of the 12 over-fetched candidates — this makes
    # top-K genuinely dynamic (0..K), not always exactly K.
    relevant = [hit for score, hit in scored if score >= settings.MEMORY_RELEVANCE_THRESHOLD]
    top = relevant[: settings.MEMORY_RETRIEVAL_TOP_K]
    log_optimization_event(
        category="memory_retrieval",
        outcome="cache_miss",
        count=len(top),
        extra=len(scored) - len(relevant),
    )

    if cache_key is not None:
        try:
            cache.set(cache_key, top, timeout=settings.MEMORY_RETRIEVAL_CACHE_TTL_SECONDS)
        except Exception:
            logger.debug("memory retrieval cache write failed", exc_info=True)
    return top


def format_memories_for_prompt(memories: list[dict]) -> str:
    """Renders memories as a system-prompt addendum. Empty string if none.
    Stops adding memories once the block would exceed
    settings.MEMORY_BLOCK_MAX_CHARS, rather than concatenating all selected
    memories unconditionally."""
    if not memories:
        return ""
    header = (
        "# RELEVANT MEMORIES"
        " (private — do not quote verbatim, but let them shape your reaction)"
    )
    budget = settings.MEMORY_BLOCK_MAX_CHARS
    lines = [header]
    used = len(header)
    for m in memories:
        meta = m["metadata"]
        kind = meta.get("kind", "turn")
        when = meta.get("created_at", "")[:10]
        if kind == "summary":
            line = f"- [weekly summary, week ending {when}] {m['text']}"
        elif kind == "fact":
            fact_type = meta.get("fact_type", "fact")
            line = f"- [fact · {fact_type}] {m['text']}"
        else:
            role = meta.get("role", "?")
            mood = meta.get("mood", "neutral")
            line = f"- [{when} · {role} · mood={mood}] {m['text']}"
        if used + len(line) + 1 > budget:
            break
        lines.append(line)
        used += len(line) + 1
    return "\n".join(lines)
