import logging
import uuid
from datetime import datetime, timedelta, timezone

from celery import shared_task
from django.conf import settings

from core.models import Message
from memory.models import MemorySummary
from memory.services.chroma_client import add_memory
from memory.services.salience import calculate_salience
from memory.services.summary import build_weekly_summary

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
