"""Meta Threads automation engine: scheduling, atomic claim-and-run, and execution bodies."""

from __future__ import annotations

import logging
from datetime import datetime, timedelta

from django.utils import timezone

from core.models import ModelPreference
from core.services.providers import ProviderError, get_provider
from core.services.providers.model_select import fast_model_for
from threads.models import (
    ThreadsAutomation,
    ThreadsAutomationRun,
    ThreadsCredential,
    ThreadsProfileChange,
    ThreadsRateLimitSnapshot,
)
from threads.services import client, oauth
from threads.services.activity import activity_since
from threads.services.oauth import ThreadsError
from threads.services.profile import profile_health, sync_profile

logger = logging.getLogger("threads")

_FIXED_INTERVAL = {
    ThreadsAutomation.Type.TOKEN_REFRESH: timedelta(days=1),
    ThreadsAutomation.Type.RATE_LIMIT_SYNC: timedelta(hours=1),
    ThreadsAutomation.Type.DAILY_BRIEFING: timedelta(days=1),
    ThreadsAutomation.Type.WEEKLY_REPORT: timedelta(days=7),
}

MIN_INTERVAL_HOURS = 1
MAX_INTERVAL_HOURS = 24 * 7


def compute_next_run_at(automation: ThreadsAutomation, *, from_time: datetime | None = None) -> datetime:
    now = from_time or timezone.now()
    if automation.type == ThreadsAutomation.Type.PROFILE_SYNC:
        hours = min(max(automation.interval_hours, MIN_INTERVAL_HOURS), MAX_INTERVAL_HOURS)
        return now + timedelta(hours=hours)
    return now + _FIXED_INTERVAL.get(automation.type, timedelta(hours=6))


def due_automations():
    return ThreadsAutomation.objects.filter(enabled=True, next_run_at__lte=timezone.now())


def claim_and_run(automation_id: int) -> None:
    now = timezone.now()
    automation = ThreadsAutomation.objects.filter(pk=automation_id, enabled=True, next_run_at__lte=now).first()
    if automation is None:
        return
    _claim_and_execute(automation, now=now)


def run_now(automation_id: int) -> bool:
    now = timezone.now()
    automation = ThreadsAutomation.objects.filter(pk=automation_id, enabled=True).first()
    if automation is None:
        return False
    return _claim_and_execute(automation, now=now)


def _claim_and_execute(automation: ThreadsAutomation, *, now: datetime) -> bool:
    next_run_at = compute_next_run_at(automation, from_time=now)
    claimed = ThreadsAutomation.objects.filter(pk=automation.pk, next_run_at=automation.next_run_at).update(
        next_run_at=next_run_at
    )
    if not claimed:
        return False

    run = ThreadsAutomationRun.objects.create(automation_id=automation.pk, status="running")
    try:
        run.detail = _run_by_type(automation)
        run.status = "success"
        automation.last_status = "success"
        automation.failure_count = 0
        logger.info("threads.automation.completed: %s (%s)", automation.name, automation.type)
    except ThreadsError as exc:
        run.status = "failed"
        run.error_message = str(exc)
        automation.last_status = "failed"
        automation.failure_count += 1
        logger.error("threads.automation.failed: %s (%s): %s", automation.name, automation.type, exc)
    except Exception as exc:
        run.status = "failed"
        run.error_message = f"An unexpected error occurred: {exc}"
        automation.last_status = "failed"
        automation.failure_count += 1
        logger.exception("threads.automation.failed: %s (%s)", automation.name, automation.type)
    finally:
        run.finished_at = timezone.now()
        run.save()
        automation.last_run_at = now
        automation.save(update_fields=["last_status", "failure_count", "last_run_at"])
    return True


def _run_by_type(automation: ThreadsAutomation) -> str:
    if automation.type == ThreadsAutomation.Type.PROFILE_SYNC:
        result = sync_profile()
        changes = result.get("changes", [])
        if not changes:
            return "Profile synchronized; no changes detected."
        summary = ", ".join(f"{c['field']} changed" for c in changes)
        return f"Profile synchronized; {len(changes)} change(s) detected: {summary}."

    if automation.type == ThreadsAutomation.Type.TOKEN_REFRESH:
        cred = ThreadsCredential.current()
        if not cred.is_connected:
            return "Threads account is not connected; skipping token refresh."
        refreshed = oauth.refresh_token(cred, force=False)
        if refreshed:
            return "Threads token successfully refreshed for another 60 days."
        if cred.needs_reauth:
            return "Token refresh skipped: manual re-authorization required (private account or revoked)."
        return f"Token is recent ({cred.token_age_hours:.1f}h old); no refresh needed today."

    if automation.type == ThreadsAutomation.Type.RATE_LIMIT_SYNC:
        cred = ThreadsCredential.current()
        if not cred.is_connected:
            return "Threads account is not connected; skipping rate limit sync."
        token = oauth.get_active_access_token()
        data = client.get_publishing_limit(token, cred.threads_user_id)
        usage = data.get("data", [{}])[0] if isinstance(data.get("data"), list) and data["data"] else data
        snapshot = ThreadsRateLimitSnapshot.objects.create(
            quota_usage=usage.get("quota_usage", 0),
            quota_total=usage.get("config", {}).get("quota_total", 250),
            reply_quota_usage=usage.get("reply_quota_usage"),
            reply_quota_total=usage.get("reply_config", {}).get("quota_total"),
            raw_response=data,
        )
        return f"Rate limit synced: {snapshot.quota_usage}/{snapshot.quota_total} posts used."

    if automation.type == ThreadsAutomation.Type.DAILY_BRIEFING:
        return _generate_briefing(period_days=1, title="Daily Threads Briefing")

    if automation.type == ThreadsAutomation.Type.WEEKLY_REPORT:
        return _generate_briefing(period_days=7, title="Weekly Threads Report")

    raise ThreadsError(f"Unknown automation type: {automation.type}")


def _generate_briefing(*, period_days: int, title: str) -> str:
    cred = ThreadsCredential.current()
    if not cred.is_connected:
        raise ThreadsError("Threads isn't connected. Connect an account to generate briefings.")

    activity = activity_since(period_days)
    health = profile_health()
    recent_changes = list(
        ThreadsProfileChange.objects.filter(detected_at__gte=timezone.now() - timedelta(days=period_days))
    )

    facts = [
        f"Platform: Meta Threads (@{cred.username or cred.name})",
        f"Period: past {period_days} day(s)",
        f"Posts published through Mirabel: {activity['posts_published']}",
        f"Posts with images: {activity.get('posts_with_images', 0)}",
        f"Profile completeness: {health['score']}%",
        f"Profile changes detected: {len(recent_changes)}",
    ]
    if health.get("suggestions"):
        facts.append(f"Suggestions: {'; '.join(health['suggestions'])}")

    system_prompt = (
        "You are an intelligent executive assistant summarizing Meta Threads activity.\n"
        "Generate a concise, well-structured briefing (1-2 short paragraphs) strictly using the provided facts.\n"
        "Do not invent metrics or engagement numbers not present in the facts."
    )
    user_prompt = f"Facts for this {title}:\n" + "\n".join(f"- {f}" for f in facts)

    pref = ModelPreference.current()
    try:
        provider = get_provider(pref.provider)
        text = provider.generate_text(
            model=fast_model_for(pref),
            system=system_prompt,
            history=[{"role": "user", "content": user_prompt}],
            max_tokens=pref.max_tokens,
            temperature=0.3,
            call_site="threads.automation.briefing",
        )
        return text.strip()
    except Exception as exc:
        logger.error("threads automation briefing generation failed: %s", exc)
        return "\n".join(facts)
