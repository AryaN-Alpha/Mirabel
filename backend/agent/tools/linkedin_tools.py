"""LinkedIn tools. Checking connection, generating post/comment text, and
saving/listing drafts are all safe (local DB writes or read-only AI calls).
publish_linkedin_draft and post_linkedin_comment are sensitive — they pause
the agent run for human approval (agent/tools/_common.py) before publishing
anything to a real, connected LinkedIn account."""

from __future__ import annotations

from langchain_core.tools import tool

from agent.tools._common import rejected_message, require_confirmation
from core.services.text_utils import encode_compact_list
from linkedin.models import LinkedInAutomation, LinkedInCredential, LinkedInDraft, LinkedInProfileChange
from linkedin.services import client, oauth, publishing
from linkedin.services.activity import content_activity as _content_activity
from linkedin.services.generation import generate_comment_reply as _generate_comment_reply
from linkedin.services.generation import generate_post as _generate_post
from linkedin.services.oauth import LinkedInError
from linkedin.services.overview import build_overview as _build_overview
from linkedin.services.profile import latest_synced_at as _latest_synced_at
from linkedin.services.profile import profile_health as _profile_health


@tool
def check_linkedin_connection() -> dict:
    """Check whether a LinkedIn account is connected. Call this first if you're unsure —
    every other LinkedIn tool that touches the real API will fail if not connected."""
    cred = LinkedInCredential.current()
    return {"connected": cred.is_connected, "name": cred.name}


@tool
def generate_linkedin_post(prompt: str, tone: str = "", length: str = "medium") -> dict:
    """Use AI to draft a LinkedIn post body from a free-form prompt. Does not publish or save anything.

    Args:
        prompt: What the post should be about.
        tone: Optional tone guidance, e.g. "professional", "casual".
        length: One of "short", "medium", "long".
    """
    return _generate_post(prompt=prompt, tone=tone, length=length)


@tool
def create_linkedin_draft(body: str, visibility: str = "PUBLIC", link_url: str = "") -> dict:
    """Save a LinkedIn post as a draft. Does NOT publish it — call publish_linkedin_draft
    afterward (which requires human approval) to actually post it.

    Args:
        body: The post text.
        visibility: "PUBLIC" or "CONNECTIONS".
        link_url: Optional URL to attach to the post.
    """
    draft = LinkedInDraft.objects.create(body=body, visibility=visibility, link_url=link_url)
    return _serialize_draft(draft)


@tool
def list_linkedin_drafts() -> list[dict]:
    """List saved, not-yet-published LinkedIn drafts, most recently updated first."""
    return [_serialize_draft(d) for d in LinkedInDraft.objects.filter(status=LinkedInDraft.Status.DRAFT)]


@tool
def publish_linkedin_draft(draft_id: int) -> dict:
    """Publish a saved LinkedIn draft to the connected account, making it publicly visible
    immediately. IRREVERSIBLE — calling this pauses the run to ask the human for approval
    first. If they reject it, nothing is published; say so plainly, don't retry.

    Args:
        draft_id: The draft's id (see list_linkedin_drafts / create_linkedin_draft).
    """
    try:
        draft = LinkedInDraft.objects.get(pk=draft_id, status=LinkedInDraft.Status.DRAFT)
    except LinkedInDraft.DoesNotExist:
        return {"error": f"No unpublished LinkedIn draft with id {draft_id}."}

    summary = f'Publish this LinkedIn post: "{draft.body[:200]}"'
    decision = require_confirmation(tool="publish_linkedin_draft", summary=summary, args={"draft_id": draft_id})
    if not decision["approved"]:
        return {"published": False, "message": rejected_message(summary)}

    try:
        publishing.publish_draft(draft)
    except LinkedInError as exc:
        return {"published": False, "error": str(exc)}
    return {"published": True, "post_urn": draft.linkedin_post_urn}


@tool
def generate_linkedin_comment(post_context: str, instructions: str = "") -> dict:
    """Use AI to draft a reply comment to a LinkedIn post. Does not post anything.

    Args:
        post_context: The text/content of the post being replied to — paste it in, LinkedIn's
            API can't fetch an arbitrary post's content for you.
        instructions: Optional guidance for the reply.
    """
    return _generate_comment_reply(post_context=post_context, instructions=instructions)


@tool
def post_linkedin_comment(post_urn: str, message: str) -> dict:
    """Post a real comment on a LinkedIn post, visible to everyone immediately. IRREVERSIBLE
    — calling this pauses the run to ask the human for approval first. If they reject it,
    nothing is posted; say so plainly, don't retry.

    Args:
        post_urn: The LinkedIn post's URN to comment on.
        message: The comment text.
    """
    summary = f'Post this comment on LinkedIn: "{message[:200]}"'
    args = {"post_urn": post_urn, "message": message}
    decision = require_confirmation(tool="post_linkedin_comment", summary=summary, args=args)
    if not decision["approved"]:
        return {"posted": False, "message": rejected_message(summary)}
    final_args = decision.get("args") or args

    cred = LinkedInCredential.current()
    try:
        token = oauth.get_active_access_token()
        client.create_comment(token, actor_urn=cred.member_urn, **final_args)
    except LinkedInError as exc:
        return {"posted": False, "error": str(exc)}
    return {"posted": True}


@tool
def get_linkedin_profile() -> dict:
    """Get the connected LinkedIn account's profile: name, email, picture, connection
    status, a deterministic profile-completeness health score, and when it was last
    synchronized. Only returns fields LinkedIn actually exposes through this
    integration (name/email/picture) — it will never have headline, experience,
    education, skills, certifications, or location; this integration's OAuth scope
    (openid, profile, email) doesn't provide those, so don't imply otherwise."""
    cred = LinkedInCredential.current()
    synced_at = _latest_synced_at()
    return {
        "connected": cred.is_connected,
        "name": cred.name,
        "email": cred.email,
        "picture_url": cred.picture_url,
        "last_synced": synced_at.isoformat() if synced_at else None,
        "health": _profile_health(),
    }


@tool
def get_linkedin_profile_changes(limit: int = 10) -> dict:
    """Get the most recently detected changes to the connected LinkedIn profile
    (name, email, or picture), most recent first. Empty means no changes have been
    detected since profile syncing started, not that nothing ever changed.

    Args:
        limit: Max number of changes to return (default 10, capped at 50).
    """
    limit = max(1, min(limit, 50))
    changes = [
        {
            "field": c.field,
            "old_value": c.old_value,
            "new_value": c.new_value,
            "detected_at": c.detected_at.isoformat(),
        }
        for c in LinkedInProfileChange.objects.order_by("-detected_at")[:limit]
    ]
    compact = encode_compact_list(changes)
    return {"changes": compact if compact is not None else changes}


@tool
def get_linkedin_analytics() -> dict:
    """Check whether LinkedIn engagement analytics (profile views, search
    appearances, follower counts, post impressions/reactions/comments) are
    available. They are NOT — LinkedIn does not expose that data through this
    integration's OAuth scope (openid, profile, email, w_member_social), a standard
    self-serve developer product, not the partner-gated Marketing Developer
    Platform. ALWAYS call this instead of guessing at engagement numbers when asked
    about LinkedIn analytics; use get_linkedin_content_activity for the
    publishing-record data that IS available."""
    return {
        "available": False,
        "reason": (
            "LinkedIn does not provide profile views, search appearances, "
            "follower counts, or post-level impressions/reactions/comments "
            "through this integration's OAuth scope. That data requires "
            "LinkedIn's partner-gated Marketing Developer Platform / "
            "Community Management API, which this integration does not have "
            "access to."
        ),
    }


@tool
def get_linkedin_content_activity(period_days: int = 30) -> dict:
    """Get Mirabel's own record of LinkedIn posts published through this app in the
    last N days — this is NOT LinkedIn engagement analytics (LinkedIn doesn't expose
    those; call get_linkedin_analytics first if asked about engagement/impressions/
    reactions). Includes post count, visibility breakdown, and the most recent
    published posts.

    Args:
        period_days: One of 7, 30, or 90 (defaults to 30; any other value falls back to 30).
    """
    result = _content_activity(period_days)
    compact = encode_compact_list(result["recent_posts"])
    if compact is not None:
        result["recent_posts"] = compact
    return result


@tool
def get_linkedin_automation_status() -> dict:
    """List configured LinkedIn automations (profile sync, daily briefing, weekly
    report) with whether each is enabled and its last run's status."""
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
        for a in LinkedInAutomation.objects.all()
    ]
    return {"automations": automations}


@tool
def get_linkedin_activity_summary() -> dict:
    """Get a combined LinkedIn summary — profile health, recent profile changes,
    Mirabel's publishing activity for the last 30 days, and automation status. Use
    this for broad questions like "how is my LinkedIn doing" or "what should I focus
    on this week"."""
    return _build_overview(30)


def _serialize_draft(draft: LinkedInDraft) -> dict:
    return {
        "id": draft.id,
        "body": draft.body,
        "visibility": draft.visibility,
        "link_url": draft.link_url,
        "status": draft.status,
    }


TOOLS = [
    check_linkedin_connection,
    generate_linkedin_post,
    create_linkedin_draft,
    list_linkedin_drafts,
    publish_linkedin_draft,
    generate_linkedin_comment,
    post_linkedin_comment,
    get_linkedin_profile,
    get_linkedin_profile_changes,
    get_linkedin_analytics,
    get_linkedin_content_activity,
    get_linkedin_automation_status,
    get_linkedin_activity_summary,
]
