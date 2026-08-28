"""LinkedIn tools. Checking connection, generating post/comment text, and
saving/listing drafts are all safe (local DB writes or read-only AI calls).
publish_linkedin_draft and post_linkedin_comment are sensitive — they pause
the agent run for human approval (agent/tools/_common.py) before publishing
anything to a real, connected LinkedIn account."""

from __future__ import annotations

from langchain_core.tools import tool

from agent.tools._common import rejected_message, require_confirmation
from linkedin.models import LinkedInCredential, LinkedInDraft
from linkedin.services import client, oauth, publishing
from linkedin.services.generation import generate_comment_reply as _generate_comment_reply
from linkedin.services.generation import generate_post as _generate_post
from linkedin.services.oauth import LinkedInError


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
]
