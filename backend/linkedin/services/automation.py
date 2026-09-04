"""LinkedIn automation engine: schedule computation, atomic claim-and-run,
and the per-type execution bodies. Runs on the project's existing Celery
beat infrastructure (see linkedin/tasks.py + mirabel/celery.py) rather than
introducing a second scheduler.

Only automation types the connected LinkedIn API can actually support are
implemented: profile_sync (re-fetch + diff), daily_briefing and
weekly_report (grounded summaries of real stored data). No "performance
alert" type exists — it would require engagement analytics LinkedIn doesn't
expose here (see services/activity.py). No automation ever posts/comments
on its own — that stays behind the same require_confirmation human-approval
gate every agent tool uses (agent/tools/linkedin_tools.py).
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta

from django.utils import timezone

from core.models import ModelPreference
from core.services.providers import ProviderError, get_provider
from core.services.providers.model_select import fast_model_for
from linkedin.models import LinkedInAutomation, LinkedInAutomationRun, LinkedInCredential, LinkedInProfileChange
from linkedin.services.activity import activity_since
from linkedin.services.oauth import LinkedInError
from linkedin.services.profile import profile_health, sync_profile

logger = logging.getLogger("linkedin.services.automation")

_FIXED_INTERVAL = {
    LinkedInAutomation.Type.DAILY_BRIEFING: timedelta(days=1),
    LinkedInAutomation.Type.WEEKLY_REPORT: timedelta(days=7),
}

MIN_INTERVAL_HOURS = 1
MAX_INTERVAL_HOURS = 24 * 7


def compute_next_run_at(automation: LinkedInAutomation, *, from_time: datetime | None = None) -> datetime:
    now = from_time or timezone.now()
    if automation.type == LinkedInAutomation.Type.PROFILE_SYNC:
        hours = min(max(automation.interval_hours, MIN_INTERVAL_HOURS), MAX_INTERVAL_HOURS)
        return now + timedelta(hours=hours)
    return now + _FIXED_INTERVAL[automation.type]


def due_automations():
    return LinkedInAutomation.objects.filter(enabled=True, next_run_at__lte=timezone.now())


def claim_and_run(automation_id: int) -> None:
    """Atomically claims a due automation before executing it, so a
    concurrent/duplicate beat tick can never run the same automation twice
    for the same due time — the UPDATE...WHERE next_run_at=<the value we
    just read> compare-and-swap is the idempotency guard (same "handle each
    row independently, never let a batch retry replay work" precedent as
    outlook.tasks.send_due_scheduled_emails).
    """
    now = timezone.now()
    automation = LinkedInAutomation.objects.filter(pk=automation_id, enabled=True, next_run_at__lte=now).first()
    if automation is None:
        return
    _claim_and_execute(automation, now=now)


def run_now(automation_id: int) -> bool:
    """Manually trigger an enabled automation immediately, regardless of its
    schedule — backs the "Run now" UI action so a Daily/Weekly automation
    doesn't require waiting up to a week to see its first result. Uses the
    same atomic claim as claim_and_run (just without the due-time gate), so
    it can never race a concurrent beat tick into double-running the same
    automation. Returns False if the automation doesn't exist, is disabled,
    or was already claimed by something else in the same instant.
    """
    now = timezone.now()
    automation = LinkedInAutomation.objects.filter(pk=automation_id, enabled=True).first()
    if automation is None:
        return False
    return _claim_and_execute(automation, now=now)


def _claim_and_execute(automation: LinkedInAutomation, *, now: datetime) -> bool:
    next_run_at = compute_next_run_at(automation, from_time=now)
    claimed = LinkedInAutomation.objects.filter(pk=automation.pk, next_run_at=automation.next_run_at).update(
        next_run_at=next_run_at
    )
    if not claimed:
        return False  # another worker already claimed this due tick

    run = LinkedInAutomationRun.objects.create(automation_id=automation.pk, status="running")
    try:
        run.detail = _run_by_type(automation)
        run.status = "success"
        automation.last_status = "success"
        automation.failure_count = 0
        logger.info("linkedin.automation.completed: %s (%s)", automation.name, automation.type)
    except LinkedInError as exc:
        run.status = "failed"
        run.error_message = str(exc)
        automation.last_status = "failed"
        automation.failure_count += 1
        logger.error("linkedin.automation.failed: %s (%s): %s", automation.name, automation.type, exc)
    except Exception:
        run.status = "failed"
        run.error_message = "An unexpected error occurred."
        automation.last_status = "failed"
        automation.failure_count += 1
        logger.exception("linkedin.automation.failed: %s (%s)", automation.name, automation.type)
    finally:
        run.finished_at = timezone.now()
        run.save()
        automation.last_run_at = now
        automation.save(update_fields=["last_status", "failure_count", "last_run_at"])
    return True


def _run_by_type(automation: LinkedInAutomation) -> str:
    if automation.type == LinkedInAutomation.Type.PROFILE_SYNC:
        return _run_profile_sync()
    if automation.type == LinkedInAutomation.Type.DAILY_BRIEFING:
        # A true 1-day lookback — "since yesterday" — so a daily briefing
        # reads as a quick pulse, distinct from the weekly report's fuller
        # 7-day recap rather than both showing the identical window.
        return _run_briefing(period_days=1, call_site="linkedin.automation.daily_briefing")
    if automation.type == LinkedInAutomation.Type.WEEKLY_REPORT:
        return _run_briefing(period_days=7, call_site="linkedin.automation.weekly_report")
    raise LinkedInError(f"Unknown automation type: {automation.type}")


def _run_profile_sync() -> str:
    result = sync_profile()
    if not result["changed"]:
        return "No profile changes detected."
    fields = ", ".join(c["field"] for c in result["changes"])
    return f"{len(result['changes'])} change(s) detected: {fields}."


def _run_briefing(*, period_days: int, call_site: str) -> str:
    cred = LinkedInCredential.current()
    if not cred.is_connected:
        raise LinkedInError("LinkedIn isn't connected.", reason="not_connected")

    health = profile_health()
    activity = activity_since(period_days)
    since = timezone.now() - timedelta(days=period_days)
    changes_in_period = LinkedInProfileChange.objects.filter(detected_at__gte=since).count()
    day_word = "day" if period_days == 1 else "days"
    facts = (
        f"Profile health score: {health['score']}/100.\n"
        f"Posts published through Mirabel in the last {period_days} {day_word}: "
        f"{activity['posts_published']}.\n"
        f"Profile changes detected in the last {period_days} {day_word}: {changes_in_period}.\n"
        f"Open profile recommendations: {len(health['recommendations'])}.\n"
    )
    return _generate_briefing(facts, call_site=call_site)


def _generate_briefing(facts: str, *, call_site: str) -> str:
    """Never-crash contract matching linkedin/services/generation.py::_generate
    — falls back to the raw grounded facts (never a generic failure string,
    never invented content) if the provider call fails, so a briefing
    automation never has to be marked "failed" just because the LLM is down."""
    pref = ModelPreference.current()
    system = (
        "You write a short LinkedIn activity briefing for the user, strictly "
        "grounded in the facts given below. Never invent a number, metric, or "
        "event not present in the facts. If the facts are thin, say so "
        "plainly rather than padding with generic advice. 3-5 sentences, "
        "plain text, no markdown."
    )
    try:
        provider = get_provider(pref.provider)
        text = provider.generate_text(
            # fast_model_for(pref) — see core/services/providers/model_select.py.
            # A grounded, fact-restating briefing needs no reasoning-tier
            # hidden chain-of-thought.
            model=fast_model_for(pref),
            system=system,
            system_suffix="",
            history=[{"role": "user", "content": facts}],
            max_tokens=pref.max_tokens,
            temperature=pref.temperature,
            call_site=call_site,
        )
        return text.strip()
    except ProviderError as exc:
        logger.error("%s provider call failed: %s", pref.provider, exc)
        return facts
    except Exception:
        logger.exception("linkedin automation briefing generation failed")
        return facts
