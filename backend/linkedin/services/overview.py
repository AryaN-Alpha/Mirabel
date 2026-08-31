"""Combined "how is my LinkedIn doing" aggregation for the Overview page and
the get_linkedin_activity_summary agent tool. Pure aggregation over the
other service modules — no new data source, no new LLM call."""

from __future__ import annotations

from linkedin.models import LinkedInAutomation, LinkedInProfileChange
from linkedin.services.activity import content_activity
from linkedin.services.profile import profile_health

RECENT_CHANGES_LIMIT = 5


def build_overview(period_days: int = 30) -> dict:
    recent_changes = [
        {
            "field": c.field,
            "old_value": c.old_value,
            "new_value": c.new_value,
            "detected_at": c.detected_at,
        }
        for c in LinkedInProfileChange.objects.order_by("-detected_at")[:RECENT_CHANGES_LIMIT]
    ]
    automations = [
        {
            "id": a.id,
            "name": a.name,
            "type": a.type,
            "enabled": a.enabled,
            "last_status": a.last_status,
            "last_run_at": a.last_run_at,
        }
        for a in LinkedInAutomation.objects.all()
    ]
    return {
        "profile_health": profile_health(),
        "activity": content_activity(period_days),
        "recent_profile_changes": recent_changes,
        "automations": automations,
    }
