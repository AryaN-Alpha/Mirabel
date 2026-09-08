"""Threads profile snapshot, change tracking, and health scoring."""

from __future__ import annotations

import hashlib
import json
import logging
from datetime import datetime

from threads.models import ThreadsCredential, ThreadsProfileChange, ThreadsProfileSnapshot
from threads.services import oauth

logger = logging.getLogger("threads")

TRACKED_FIELDS = ("username", "name", "biography", "profile_picture_url", "is_private_profile")


def _fields_from_credential(cred: ThreadsCredential) -> dict:
    return {field: getattr(cred, field) for field in TRACKED_FIELDS}


def _content_hash(fields: dict) -> str:
    return hashlib.sha256(json.dumps(fields, sort_keys=True).encode()).hexdigest()


def latest_synced_at() -> datetime | None:
    latest = ThreadsProfileSnapshot.objects.order_by("-created_at").first()
    return latest.created_at if latest else None


def record_snapshot(cred: ThreadsCredential) -> dict:
    """Diffs the credential's current TRACKED_FIELDS against latest snapshot and records changes."""
    fields = _fields_from_credential(cred)
    new_hash = _content_hash(fields)

    latest = ThreadsProfileSnapshot.objects.order_by("-created_at").first()
    if latest is not None and latest.content_hash == new_hash:
        return {"changed": False, "changes": []}

    changes = []
    if latest is not None:
        for field in TRACKED_FIELDS:
            old_value = str(getattr(latest, field, ""))
            new_value = str(fields[field])
            if old_value != new_value:
                changes.append((field, old_value, new_value))

    snapshot = ThreadsProfileSnapshot.objects.create(content_hash=new_hash, **fields)
    if changes:
        ThreadsProfileChange.objects.bulk_create(
            [
                ThreadsProfileChange(snapshot=snapshot, field=field, old_value=old, new_value=new)
                for field, old, new in changes
            ]
        )
        logger.info("threads.sync.completed: %d change(s) detected", len(changes))
    else:
        logger.info("threads.sync.completed: baseline snapshot created" if latest is None else "no changes")

    return {
        "changed": bool(changes),
        "changes": [{"field": f, "old_value": o, "new_value": n} for f, o, n in changes],
    }


def sync_profile() -> dict:
    """Fetches latest profile from Threads Graph API and updates snapshot."""
    token = oauth.get_active_access_token()
    cred = ThreadsCredential.current()
    userinfo = oauth.fetch_userinfo(token)
    oauth.save_profile(cred, userinfo)
    cred.save()
    return record_snapshot(cred)


def profile_health() -> dict:
    """Calculates profile completeness score and improvement suggestions."""
    cred = ThreadsCredential.current()
    if not cred.is_connected:
        return {"score": 0, "suggestions": ["Connect your Threads account."]}

    score = 0
    suggestions = []

    if cred.username:
        score += 25
    else:
        suggestions.append("Set a Threads username.")

    if cred.name:
        score += 25
    else:
        suggestions.append("Add your display name on Threads.")

    if cred.biography:
        score += 25
    else:
        suggestions.append("Add a biography describing who you are or what you do.")

    if cred.profile_picture_url:
        score += 25
    else:
        suggestions.append("Upload a profile picture to enhance discoverability.")

    return {
        "score": score,
        "suggestions": suggestions,
        "is_complete": score == 100,
        "is_private": cred.is_private_profile,
        "needs_reauth": cred.needs_reauth,
    }
