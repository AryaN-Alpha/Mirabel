"""Mirabel's own record of LinkedIn posts it has published — deliberately
NOT called "analytics". LinkedIn does not expose engagement analytics
(profile views, search appearances, followers, impressions, reactions,
comments, reposts) through this integration's OAuth scope (openid profile
email w_member_social); that requires the partner-gated Marketing Developer
Platform / Community Management API, which this integration does not have.
This module only aggregates LinkedInDraft rows this app itself published —
real data Mirabel owns, never fabricated engagement numbers.
"""

from __future__ import annotations

from datetime import timedelta

from django.utils import timezone

from linkedin.models import LinkedInDraft

ALLOWED_PERIOD_DAYS = (7, 30, 90)
DEFAULT_PERIOD_DAYS = 30

NOT_TRACKED_NOTE = (
    "This reflects posts published through Mirabel, not LinkedIn engagement "
    "analytics (impressions, reactions, comments, profile views, follower "
    "count, search appearances). LinkedIn does not expose those metrics "
    "through this integration's OAuth scope."
)


def content_activity(period_days: int = DEFAULT_PERIOD_DAYS) -> dict:
    """Public/UI-facing entry point — only accepts the periods the frontend's
    7/30/90-day selector (and the get_linkedin_content_activity agent tool)
    actually offer; anything else falls back to the default rather than
    silently querying a different window than the caller asked for."""
    period_days = period_days if period_days in ALLOWED_PERIOD_DAYS else DEFAULT_PERIOD_DAYS
    return activity_since(period_days)


def activity_since(period_days: int) -> dict:
    """Unclamped aggregation for internal callers (linkedin/services/automation.py's
    daily/weekly briefings) that need a window content_activity()'s
    7/30/90-only contract doesn't offer, e.g. a true 1-day lookback for a
    daily briefing. Never call this directly from a view or agent tool —
    those go through content_activity() so the returned period_days always
    matches what was actually requested."""
    since = timezone.now() - timedelta(days=period_days)
    published = LinkedInDraft.objects.filter(
        status=LinkedInDraft.Status.PUBLISHED, updated_at__gte=since
    ).order_by("-updated_at")

    published = list(published)
    by_visibility: dict[str, int] = {}
    for draft in published:
        by_visibility[draft.visibility] = by_visibility.get(draft.visibility, 0) + 1

    return {
        "period_days": period_days,
        "posts_published": len(published),
        "by_visibility": by_visibility,
        "recent_posts": [
            {
                "id": d.id,
                "body_preview": d.body[:160],
                "visibility": d.visibility,
                "published_at": d.updated_at,
                "linkedin_post_urn": d.linkedin_post_urn,
            }
            for d in published[:10]
        ],
        "data_source": "mirabel_publishing_record",
        "note": NOT_TRACKED_NOTE,
    }
