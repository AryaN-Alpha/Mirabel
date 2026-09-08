"""Mirabel's publishing activity record and rate limit stats for Meta Threads."""

from __future__ import annotations

from datetime import timedelta
from django.utils import timezone

from threads.models import ThreadsDraft, ThreadsRateLimitSnapshot

ALLOWED_PERIOD_DAYS = (7, 30, 90)
DEFAULT_PERIOD_DAYS = 30


def content_activity(period_days: int = DEFAULT_PERIOD_DAYS) -> dict:
    period_days = period_days if period_days in ALLOWED_PERIOD_DAYS else DEFAULT_PERIOD_DAYS
    return activity_since(period_days)


def activity_since(period_days: int) -> dict:
    since = timezone.now() - timedelta(days=period_days)
    published = ThreadsDraft.objects.filter(
        status=ThreadsDraft.Status.PUBLISHED, updated_at__gte=since
    ).order_by("-updated_at")

    published = list(published)
    by_reply_control: dict[str, int] = {}
    with_image_count = 0

    for draft in published:
        by_reply_control[draft.reply_control] = by_reply_control.get(draft.reply_control, 0) + 1
        if draft.image:
            with_image_count += 1

    rate_limit = ThreadsRateLimitSnapshot.latest()

    return {
        "period_days": period_days,
        "posts_published": len(published),
        "posts_with_images": with_image_count,
        "by_reply_control": by_reply_control,
        "rate_limit": {
            "quota_usage": rate_limit.quota_usage if rate_limit else 0,
            "quota_total": rate_limit.quota_total if rate_limit else 250,
            "is_exhausted": rate_limit.is_exhausted if rate_limit else False,
            "fetched_at": rate_limit.fetched_at.isoformat() if rate_limit else None,
        } if rate_limit else None,
        "recent_posts": [
            {
                "id": d.id,
                "body_preview": d.body[:140],
                "reply_control": d.reply_control,
                "published_at": d.updated_at.isoformat() if d.updated_at else None,
                "threads_post_id": d.threads_post_id,
                "permalink": d.permalink,
                "has_image": bool(d.image),
            }
            for d in published[:10]
        ],
        "data_source": "mirabel_publishing_record",
    }
