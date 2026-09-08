"""Combined overview aggregation for Threads dashboard and agent tools."""

from __future__ import annotations

from threads.models import ThreadsAutomation, ThreadsCredential, ThreadsProfileChange, ThreadsRateLimitSnapshot
from threads.services.activity import content_activity
from threads.services.profile import profile_health

RECENT_CHANGES_LIMIT = 5


def build_overview(period_days: int = 30) -> dict:
    cred = ThreadsCredential.current()
    rate_limit = ThreadsRateLimitSnapshot.latest()

    recent_changes = [
        {
            "field": c.field,
            "old_value": c.old_value,
            "new_value": c.new_value,
            "detected_at": c.detected_at.isoformat(),
        }
        for c in ThreadsProfileChange.objects.order_by("-detected_at")[:RECENT_CHANGES_LIMIT]
    ]

    automations = [
        {
            "id": a.id,
            "name": a.name,
            "type": a.type,
            "enabled": a.enabled,
            "last_status": a.last_status,
            "last_run_at": a.last_run_at.isoformat() if a.last_run_at else None,
        }
        for a in ThreadsAutomation.objects.all()
    ]

    return {
        "connected": cred.is_connected,
        "username": cred.username,
        "name": cred.name,
        "picture_url": cred.profile_picture_url,
        "is_private": cred.is_private_profile,
        "needs_reauth": cred.needs_reauth,
        "profile_health": profile_health(),
        "activity": content_activity(period_days),
        "recent_profile_changes": recent_changes,
        "automations": automations,
        "rate_limit": {
            "quota_usage": rate_limit.quota_usage if rate_limit else 0,
            "quota_total": rate_limit.quota_total if rate_limit else 250,
            "is_exhausted": rate_limit.is_exhausted if rate_limit else False,
            "fetched_at": rate_limit.fetched_at.isoformat() if rate_limit else None,
        } if rate_limit else None,
    }
