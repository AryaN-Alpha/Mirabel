"""Orchestration for actually publishing content to LinkedIn.

Extracted from linkedin/views.py::_publish so the same upload-image ->
create-post sequence is reusable by both the REST views and the agent tools
(agent/tools/linkedin_tools.py) without duplicating it in two places.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from linkedin.models import LinkedInCredential
from linkedin.services import client, oauth

if TYPE_CHECKING:
    from linkedin.models import LinkedInDraft


def publish(*, body: str, visibility: str, link_url: str, image_field=None) -> str:
    """Publish a LinkedIn post now. Returns the new post's URN.

    image_field is a Django FileField (or None) — if present, the image is
    uploaded first and attached to the post. Raises LinkedInError on any
    failure (not connected, expired token, rejected post, etc.); nothing is
    published if it raises.
    """
    token = oauth.get_active_access_token()
    cred = LinkedInCredential.current()
    image_urn = None
    if image_field:
        upload = client.initialize_image_upload(token, cred.member_urn)
        image_field.open("rb")
        try:
            client.upload_image_binary(upload["uploadUrl"], token, image_field.read())
        finally:
            image_field.close()
        image_urn = upload["image"]
    return client.create_post(
        token,
        author_urn=cred.member_urn,
        commentary=body,
        visibility=visibility,
        image_urn=image_urn,
        link_url=link_url or None,
    )


def publish_draft(draft: "LinkedInDraft") -> str:
    """Publish an existing LinkedInDraft, then mark it published and save it.

    Raises LinkedInError on failure — draft is left unchanged (still
    "draft", still retryable) if publish() raises.
    """
    urn = publish(body=draft.body, visibility=draft.visibility, link_url=draft.link_url, image_field=draft.image)
    draft.status = draft.Status.PUBLISHED
    draft.linkedin_post_urn = urn
    draft.save()
    return urn
