"""Meta Threads agent tools.

Checking connection, rate limits, generating drafts/replies, and saving/listing drafts
are all safe. publish_threads_draft, post_threads_reply, and delete_threads_post are
sensitive/irreversible — they pause the agent run for human approval
(agent/tools/_common.py) before modifying real data on Meta Threads.
"""

from __future__ import annotations

from langchain_core.tools import tool

from agent.tools._common import rejected_message, require_confirmation
from core.services.text_utils import encode_compact_list
from threads.models import (
    ThreadsAutomation,
    ThreadsCredential,
    ThreadsDraft,
    ThreadsProfileChange,
    ThreadsRateLimitSnapshot,
)
from threads.services import client, oauth, publishing
from threads.services.activity import content_activity as _content_activity
from threads.services.generation import generate_post as _generate_post
from threads.services.generation import generate_reply as _generate_reply
from threads.services.oauth import ThreadsError
from threads.services.overview import build_overview as _build_overview
from threads.services.profile import latest_synced_at as _latest_synced_at
from threads.services.profile import profile_health as _profile_health


@tool
def check_threads_connection() -> dict:
    """Check whether a Meta Threads account is connected. Call this first if unsure —
    tools that interact with the live Threads API will fail if not connected."""
    cred = ThreadsCredential.current()
    return {
        "connected": cred.is_connected,
        "username": cred.username,
        "name": cred.name,
        "is_private_profile": cred.is_private_profile,
        "needs_reauth": cred.needs_reauth,
    }


@tool
def check_threads_rate_limit() -> dict:
    """Check remaining daily publishing quota on Meta Threads before attempting a write.
    Meta enforces a 250 post/24h limit."""
    cred = ThreadsCredential.current()
    if not cred.is_connected:
        return {"connected": False, "quota_usage": 0, "quota_total": 250, "is_exhausted": False}

    snapshot = ThreadsRateLimitSnapshot.latest()
    if not snapshot:
        try:
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
        except Exception:
            return {"quota_usage": 0, "quota_total": 250, "is_exhausted": False}

    return {
        "quota_usage": snapshot.quota_usage,
        "quota_total": snapshot.quota_total,
        "is_exhausted": snapshot.is_exhausted,
        "reply_quota_usage": snapshot.reply_quota_usage,
        "reply_quota_total": snapshot.reply_quota_total,
    }


@tool
def generate_threads_post(prompt: str, tone: str = "casual", length: str = "medium") -> dict:
    """Use AI to draft a Threads post body from a free-form prompt. Does not publish anything.
    Result will always be under 500 characters per Threads requirements.

    Args:
        prompt: What the post should be about.
        tone: Optional tone guidance: "casual", "insightful", "announcement", "question", or "professional".
        length: One of "short", "medium", "long".
    """
    return _generate_post(prompt=prompt, tone=tone, length=length)


@tool
def create_threads_draft(body: str, reply_control: str = "everyone", link_url: str = "") -> dict:
    """Save a Threads post as a draft locally. Does NOT publish it. Call publish_threads_draft
    afterward (which requires human confirmation) to actually publish.

    Args:
        body: The post text (maximum 500 characters).
        reply_control: Who can reply: "everyone", "accounts_you_follow", or "mentioned_only".
        link_url: Optional URL attachment for a rich link card preview.
    """
    if len(body) > 500:
        return {"error": f"Body exceeds 500 characters (length: {len(body)})."}

    if reply_control not in ThreadsDraft.ReplyControl.values:
        reply_control = ThreadsDraft.ReplyControl.EVERYONE

    draft = ThreadsDraft.objects.create(
        body=body,
        reply_control=reply_control,
        link_url=link_url,
    )
    return _serialize_draft(draft)


@tool
def list_threads_drafts() -> list[dict]:
    """List saved, not-yet-published Threads drafts, most recently updated first."""
    return [_serialize_draft(d) for d in ThreadsDraft.objects.filter(status=ThreadsDraft.Status.DRAFT)]


@tool
def publish_threads_draft(draft_id: int) -> dict:
    """Publish a saved Threads draft to Meta Threads, making it publicly visible immediately.
    IRREVERSIBLE — pauses the run to ask the human for approval first. If rejected,
    nothing is published; say so plainly, don't retry.

    Args:
        draft_id: The draft's ID (see list_threads_drafts / create_threads_draft).
    """
    try:
        draft = ThreadsDraft.objects.get(pk=draft_id, status=ThreadsDraft.Status.DRAFT)
    except ThreadsDraft.DoesNotExist:
        return {"error": f"No unpublished Threads draft with ID {draft_id}."}

    summary = f'Publish this Threads post: "{draft.body[:140]}"'
    decision = require_confirmation(tool="publish_threads_draft", summary=summary, args={"draft_id": draft_id})
    if not decision["approved"]:
        return {"published": False, "message": rejected_message(summary)}

    try:
        res = publishing.publish_draft(draft)
        return {"published": True, "post_id": res.get("post_id"), "permalink": res.get("permalink")}
    except ThreadsError as exc:
        return {"published": False, "error": str(exc)}


@tool
def delete_threads_post(post_id: str) -> dict:
    """Delete a published post from Meta Threads immediately. IRREVERSIBLE — pauses the run
    to ask the human for approval first. If rejected, nothing is deleted.

    Args:
        post_id: The ID of the Threads post to delete.
    """
    summary = f"Delete Threads post {post_id} permanently."
    args = {"post_id": post_id}
    decision = require_confirmation(tool="delete_threads_post", summary=summary, args=args)
    if not decision["approved"]:
        return {"deleted": False, "message": rejected_message(summary)}

    final_args = decision.get("args") or args
    target_post_id = final_args.get("post_id", post_id)
    try:
        token = oauth.get_active_access_token()
        success = client.delete_post(token, target_post_id)
        # Update local draft if present
        ThreadsDraft.objects.filter(threads_post_id=target_post_id).update(status=ThreadsDraft.Status.DRAFT)
        return {"deleted": success, "post_id": target_post_id}
    except ThreadsError as exc:
        return {"deleted": False, "error": str(exc)}


@tool
def generate_threads_reply(post_context: str, instructions: str = "") -> dict:
    """Use AI to draft a reply to an existing Threads post. Does not post anything.

    Args:
        post_context: The text/content of the Threads post being replied to.
        instructions: Optional guidance for the reply.
    """
    return _generate_reply(post_context=post_context, instructions=instructions)


@tool
def post_threads_reply(parent_thread_id: str, message: str) -> dict:
    """Post a live reply to an existing Threads post. IRREVERSIBLE — pauses the run
    to ask the human for approval first. If rejected, nothing is posted.

    Args:
        parent_thread_id: The ID of the Threads post you are replying to.
        message: The reply text (max 500 characters).
    """
    summary = f'Post this reply on Threads: "{message[:140]}"'
    args = {"parent_thread_id": parent_thread_id, "message": message}
    decision = require_confirmation(tool="post_threads_reply", summary=summary, args=args)
    if not decision["approved"]:
        return {"posted": False, "message": rejected_message(summary)}

    final_args = decision.get("args") or args
    try:
        res = publishing.publish_reply(final_args["parent_thread_id"], final_args["message"])
        return {"posted": True, "post_id": res.get("post_id"), "permalink": res.get("permalink")}
    except ThreadsError as exc:
        return {"posted": False, "error": str(exc)}


@tool
def get_threads_profile() -> dict:
    """Get the connected Threads profile: username, name, biography, picture URL,
    is_private flag, profile health score, and last synced timestamp."""
    cred = ThreadsCredential.current()
    synced_at = _latest_synced_at()
    return {
        "connected": cred.is_connected,
        "username": cred.username,
        "name": cred.name,
        "biography": cred.biography,
        "picture_url": cred.profile_picture_url,
        "is_private": cred.is_private_profile,
        "needs_reauth": cred.needs_reauth,
        "last_synced": synced_at.isoformat() if synced_at else None,
        "health": _profile_health(),
    }


@tool
def get_threads_profile_changes(limit: int = 10) -> dict:
    """Get recent changes detected in the connected Threads profile."""
    limit = max(1, min(limit, 50))
    changes = [
        {
            "field": c.field,
            "old_value": c.old_value,
            "new_value": c.new_value,
            "detected_at": c.detected_at.isoformat(),
        }
        for c in ThreadsProfileChange.objects.order_by("-detected_at")[:limit]
    ]
    compact = encode_compact_list(changes)
    return {"changes": compact if compact is not None else changes}


@tool
def get_threads_activity(period_days: int = 30) -> dict:
    """Get Mirabel's publishing activity record on Threads for the last N days (7, 30, or 90)."""
    result = _content_activity(period_days)
    compact = encode_compact_list(result["recent_posts"])
    if compact is not None:
        result["recent_posts"] = compact
    return result


@tool
def get_threads_automation_status() -> dict:
    """List configured Threads automations (profile sync, token refresh, briefings)
    and their latest execution statuses."""
    automations = [
        {
            "id": a.id,
            "name": a.name,
            "type": a.type,
            "enabled": a.enabled,
            "last_status": a.last_status,
            "last_run_at": a.last_run_at.isoformat() if a.last_run_at else None,
            "next_run_at": a.next_run_at.isoformat() if a.next_run_at else None,
            "failure_count": a.failure_count,
        }
        for a in ThreadsAutomation.objects.all()
    ]
    return {"automations": automations}


@tool
def get_threads_overview() -> dict:
    """Get a comprehensive overview of Meta Threads status: profile health, activity,
    recent profile changes, rate limit quota, and automation status."""
    return _build_overview(30)


def _serialize_draft(draft: ThreadsDraft) -> dict:
    return {
        "id": draft.id,
        "body": draft.body,
        "reply_control": draft.reply_control,
        "link_url": draft.link_url,
        "status": draft.status,
        "has_image": bool(draft.image),
    }


TOOLS = [
    check_threads_connection,
    check_threads_rate_limit,
    generate_threads_post,
    create_threads_draft,
    list_threads_drafts,
    publish_threads_draft,
    delete_threads_post,
    generate_threads_reply,
    post_threads_reply,
    get_threads_profile,
    get_threads_profile_changes,
    get_threads_activity,
    get_threads_automation_status,
    get_threads_overview,
]
