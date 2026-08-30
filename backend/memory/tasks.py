import logging
import uuid
from datetime import datetime, timedelta, timezone

from celery import shared_task
from django.conf import settings

from core.models import Message
from memory.models import MemoryFact, MemorySummary
from memory.services.chroma_client import add_memory
from memory.services.dedup import is_near_duplicate
from memory.services.facts import extract_facts, has_extractable_signal
from memory.services.lifecycle import prune_stale_memories
from memory.services.salience import calculate_salience
from memory.services.summary import build_weekly_summary
from memory.services.supersession import find_superseded_fact

logger = logging.getLogger(__name__)


@shared_task(
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_kwargs={"max_retries": 5},
    name="memory.tasks.embed_and_store",
)
def embed_and_store(self, message_id: int) -> None:
    """
    Fired after every Message is created.
    Idempotent: Chroma upserts on the deterministic memory_id, so a retry
    won't duplicate entries.
    """
    try:
        msg = Message.objects.select_related("conversation").get(pk=message_id)
    except Message.DoesNotExist:
        logger.warning("embed_and_store: message %s vanished, skipping", message_id)
        return

    salience = calculate_salience(
        text=msg.text, mood=msg.mood or "neutral", role=msg.role
    )

    if salience < 0.20:
        logger.info(
            "embed_and_store: skipping low-salience message %s (s=%.3f)", message_id, salience
        )
        return

    if is_near_duplicate(msg.text):
        logger.info("embed_and_store: skipping near-duplicate message %s", message_id)
        return

    add_memory(
        memory_id=f"msg_{msg.id}",
        text=msg.text,
        metadata={
            "message_id": msg.id,
            "conversation_id": msg.conversation_id,
            "role": msg.role,
            "mood": msg.mood or "neutral",
            "salience": salience,
            "created_at": msg.created_at.isoformat(),
            "kind": "turn",
            "status": "active",
        },
    )
    logger.info("embed_and_store: stored message %s (s=%.3f)", message_id, salience)


@shared_task(
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_kwargs={"max_retries": 3},
    name="memory.tasks.run_weekly_summary",
)
def run_weekly_summary(self) -> None:
    period_end = datetime.now(timezone.utc)
    period_start = period_end - timedelta(days=7)

    summary = build_weekly_summary(period_start=period_start, period_end=period_end)
    if summary is None:
        logger.info("weekly_summary: nothing to summarize")
        return

    chroma_id = f"summary_{uuid.uuid4().hex[:12]}"
    add_memory(
        memory_id=chroma_id,
        text=summary["summary_text"],
        metadata={
            "kind": "summary",
            "role": "summary",
            "mood": "neutral",
            "salience": 0.9,
            "period_start": period_start.isoformat(),
            "period_end": period_end.isoformat(),
            "dominant_moods": ",".join(summary["dominant_moods"]),
            "created_at": period_end.isoformat(),
            "status": "active",
        },
    )

    MemorySummary.objects.create(
        period_start=period_start,
        period_end=period_end,
        summary_text=summary["summary_text"],
        dominant_moods=summary["dominant_moods"],
        message_count=summary["message_count"],
        chroma_id=chroma_id,
    )
    logger.info(
        "weekly_summary: created summary (%d messages)", summary["message_count"]
    )


@shared_task(
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_kwargs={"max_retries": 3},
    name="memory.tasks.run_memory_lifecycle",
)
def run_memory_lifecycle(self) -> None:
    prune_stale_memories()


@shared_task(
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_kwargs={"max_retries": 3},
    name="memory.tasks.extract_and_supersede_facts",
)
def extract_and_supersede_facts(self, message_id: int) -> None:
    """
    Fired after a user message alongside embed_and_store (not chained onto
    it, so each stays independently retryable). Extracts durable facts and
    supersedes any prior active fact of the same type they contradict.

    Idempotency guard is checked FIRST, before any LLM spend: unlike
    embed_and_store (deterministic Chroma id "msg_{id}", safe to re-upsert),
    this task mints a fresh uuid per fact per run, so a Celery retry after a
    failure partway through (e.g. the LLM calls succeeded but the DB write
    raised) would otherwise re-spend two paid LLM calls and create duplicate
    MemoryFact rows.
    """
    if MemoryFact.objects.filter(source_message_id=message_id).exists():
        return

    try:
        msg = Message.objects.get(pk=message_id)
    except Message.DoesNotExist:
        logger.warning("extract_and_supersede_facts: message %s vanished, skipping", message_id)
        return

    if msg.role != Message.Role.USER:
        return

    salience = calculate_salience(text=msg.text, mood=msg.mood or "neutral", role=msg.role)
    if salience < settings.MEMORY_FACT_EXTRACTION_SALIENCE_MIN:
        return
    if not has_extractable_signal(msg.text):
        return

    facts = extract_facts(msg.text)
    if not facts:
        return

    now = datetime.now(timezone.utc)
    for fact in facts:
        old_hit = find_superseded_fact(fact["text"], fact["fact_type"])
        new_chroma_id = f"fact_{uuid.uuid4().hex[:12]}"
        old_chroma_id = ""

        old_fact_row = None
        if old_hit is not None:
            old_chroma_id = old_hit["id"]
            # Re-upsert using the FULL existing metadata — Chroma's upsert
            # overwrites metadata wholesale, it does not merge. Building a
            # fresh partial dict here would silently drop fact_type,
            # created_at, salience, etc. from the old row.
            old_metadata = dict(old_hit["metadata"])
            old_metadata["status"] = "superseded"
            old_metadata["superseded_by"] = new_chroma_id
            old_metadata["superseded_at"] = now.isoformat()
            add_memory(memory_id=old_chroma_id, text=old_hit["text"], metadata=old_metadata)

            # chroma_id has no db_index — fetch once and reuse the object
            # (below, as `supersedes=`) rather than a second filtered lookup
            # on the same unindexed column.
            old_fact_row = MemoryFact.objects.filter(chroma_id=old_chroma_id).first()
            if old_fact_row is not None:
                old_fact_row.status = MemoryFact.Status.SUPERSEDED
                old_fact_row.superseded_at = now
                old_fact_row.save(update_fields=["status", "superseded_at"])

        add_memory(
            memory_id=new_chroma_id,
            text=fact["text"],
            metadata={
                "kind": "fact",
                "status": "active",
                "fact_type": fact["fact_type"],
                "role": "user",
                "mood": "neutral",
                "salience": 0.75,
                "created_at": now.isoformat(),
                "message_id": msg.id,
                "supersedes": old_chroma_id,
            },
        )
        MemoryFact.objects.create(
            fact_text=fact["text"],
            fact_type=fact["fact_type"],
            status=MemoryFact.Status.ACTIVE,
            chroma_id=new_chroma_id,
            supersedes=old_fact_row,
            source_message=msg,
        )

    logger.info("extract_and_supersede_facts: stored %d fact(s) for message %s", len(facts), message_id)
