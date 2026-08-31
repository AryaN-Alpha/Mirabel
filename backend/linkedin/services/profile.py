"""Profile snapshot/diff/health scoring.

Everything here operates ONLY on the fields LinkedIn actually returns from
/v2/userinfo under this integration's OAuth scope (openid profile email) —
see TRACKED_FIELDS below and LinkedInProfileTab.jsx's existing disclaimer.
Headline, about, experience, education, skills, certifications, languages,
location, and industry are NOT available and must never be fabricated here.
"""

from __future__ import annotations

import hashlib
import json
import logging
from datetime import datetime

from linkedin.models import LinkedInCredential, LinkedInProfileChange, LinkedInProfileSnapshot
from linkedin.services import oauth

logger = logging.getLogger("linkedin.services.profile")

TRACKED_FIELDS = ("name", "email", "picture_url")


def _fields_from_credential(cred: LinkedInCredential) -> dict:
    return {field: getattr(cred, field) for field in TRACKED_FIELDS}


def _content_hash(fields: dict) -> str:
    return hashlib.sha256(json.dumps(fields, sort_keys=True).encode()).hexdigest()


def latest_synced_at() -> datetime | None:
    """The timestamp of the most recent profile snapshot, or None if the
    profile has never been synced. This is a more accurate "last synced"
    signal than LinkedInCredential.updated_at, which bumps on ANY credential
    save (e.g. a token refresh) — not just a profile data pull."""
    latest = LinkedInProfileSnapshot.objects.order_by("-created_at").first()
    return latest.created_at if latest else None


def record_snapshot(cred: LinkedInCredential) -> dict:
    """Diff the credential's current TRACKED_FIELDS against the latest
    stored snapshot and persist a new snapshot (+ change rows) only if
    something actually changed. Pure DB operation, no network call — shared
    by sync_profile() (which first refreshes cred from LinkedIn) and the
    OAuth callback (which already has fresh cred fields from the
    just-completed connect, so re-fetching userinfo again would be a
    redundant LinkedIn API call).

    Returns {"changed": bool, "changes": [{"field", "old_value", "new_value"}]}.
    The very first snapshot (no prior one) creates a baseline with
    changed=False — there's nothing to diff against yet.
    """
    fields = _fields_from_credential(cred)
    new_hash = _content_hash(fields)

    latest = LinkedInProfileSnapshot.objects.order_by("-created_at").first()
    if latest is not None and latest.content_hash == new_hash:
        return {"changed": False, "changes": []}

    changes = []
    if latest is not None:
        for field in TRACKED_FIELDS:
            old_value = getattr(latest, field)
            new_value = fields[field]
            if old_value != new_value:
                changes.append((field, old_value, new_value))

    snapshot = LinkedInProfileSnapshot.objects.create(content_hash=new_hash, **fields)
    if changes:
        LinkedInProfileChange.objects.bulk_create(
            [
                LinkedInProfileChange(snapshot=snapshot, field=field, old_value=old, new_value=new)
                for field, old, new in changes
            ]
        )
        logger.info("linkedin.sync.completed: %d change(s) detected", len(changes))
    else:
        logger.info("linkedin.sync.completed: baseline snapshot created" if latest is None else "no changes")

    return {
        "changed": bool(changes),
        "changes": [{"field": f, "old_value": o, "new_value": n} for f, o, n in changes],
    }


def sync_profile() -> dict:
    """Fetch the current LinkedIn profile and record a snapshot of it.
    Raises LinkedInError if not connected / token expired — nothing is
    written on failure. See record_snapshot() for the diff/store contract."""
    token = oauth.get_active_access_token()
    cred = LinkedInCredential.current()
    userinfo = oauth.fetch_userinfo(token)
    oauth.save_profile(cred, userinfo)
    cred.save()
    return record_snapshot(cred)


def profile_health() -> dict:
    """Deterministic, explainable completeness score over ONLY the fields
    this integration can actually see. Each recommendation follows the
    Issue / Why it matters / Recommendation / Priority shape.

    Deliberately scores completeness only (is each field populated) — NOT
    sync freshness. Those are different questions: a fully-populated
    profile that simply hasn't been re-synced today shouldn't score lower
    than one that has. Freshness is already reported separately via
    latest_synced_at() (see views.profile() / get_linkedin_profile tool).
    """
    cred = LinkedInCredential.current()
    breakdown = {}
    recommendations = []

    for field in TRACKED_FIELDS:
        present = bool(getattr(cred, field))
        breakdown[field] = 100 if present else 0
        if not present:
            recommendations.append(_recommendation_for(field))

    score = round(sum(breakdown.values()) / len(breakdown))

    return {
        "score": score,
        "breakdown": breakdown,
        "recommendations": recommendations,
        "unscored_fields_note": (
            "Headline, About, Experience, Education, Skills, Certifications, "
            "Languages, Location, and Industry aren't scored — LinkedIn's Sign "
            "In with OpenID Connect scopes (openid, profile, email) used by "
            "this integration don't expose them; that requires a separate "
            "partner-approved LinkedIn product."
        ),
    }


def _recommendation_for(field: str) -> dict:
    copy = {
        "name": {
            "issue": "No name on file for the connected LinkedIn account.",
            "why_it_matters": "Mirabel can't personalize generated posts or comments without it.",
            "recommendation": "Reconnect LinkedIn — your name is pulled directly from your LinkedIn account at connect time.",
            "priority": "HIGH",
        },
        "email": {
            "issue": "No email on file for the connected LinkedIn account.",
            "why_it_matters": "Used only to confirm which account is connected; doesn't affect posting.",
            "recommendation": "Reconnect LinkedIn if this looks wrong — it comes directly from your LinkedIn account.",
            "priority": "LOW",
        },
        "picture_url": {
            "issue": "No profile photo on file for the connected LinkedIn account.",
            "why_it_matters": "Shown in the LinkedIn tab so you can confirm you're connected to the right account.",
            "recommendation": "Add a profile photo on LinkedIn directly, then reconnect.",
            "priority": "MEDIUM",
        },
    }[field]
    return {"field": field, **copy}
