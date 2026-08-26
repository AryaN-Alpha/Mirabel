from urllib.parse import quote

import requests
from django.conf import settings

from linkedin.services.oauth import LinkedInError, error_detail, reason_for_status

API_BASE = "https://api.linkedin.com"

_TIMEOUT = 15


def _headers(access_token: str, *, json_body: bool = True) -> dict:
    headers = {
        "Authorization": f"Bearer {access_token}",
        "LinkedIn-Version": settings.LINKEDIN_API_VERSION,
        "X-Restli-Protocol-Version": "2.0.0",
    }
    if json_body:
        headers["Content-Type"] = "application/json"
    return headers


def _raise_for_response(resp: requests.Response) -> None:
    if resp.ok:
        return
    retry_after = None
    if resp.status_code == 429:
        try:
            retry_after = int(resp.headers.get("Retry-After", "")) or None
        except ValueError:
            retry_after = None
    raise LinkedInError(
        f"LinkedIn request failed ({resp.status_code}): {error_detail(resp)}",
        reason=reason_for_status(resp.status_code),
        retry_after=retry_after,
    )


def initialize_image_upload(access_token: str, owner_urn: str) -> dict:
    """Returns {"uploadUrl": ..., "image": "urn:li:image:..."}."""
    try:
        resp = requests.post(
            f"{API_BASE}/rest/images?action=initializeUpload",
            headers=_headers(access_token),
            json={"initializeUploadRequest": {"owner": owner_urn}},
            timeout=_TIMEOUT,
        )
    except requests.RequestException as exc:
        raise LinkedInError(f"Couldn't reach LinkedIn: {exc}") from exc
    _raise_for_response(resp)
    value = resp.json().get("value", {})
    return {"uploadUrl": value.get("uploadUrl", ""), "image": value.get("image", "")}


def upload_image_binary(upload_url: str, access_token: str, file_bytes: bytes) -> None:
    try:
        resp = requests.put(
            upload_url,
            headers={"Authorization": f"Bearer {access_token}"},
            data=file_bytes,
            timeout=_TIMEOUT,
        )
    except requests.RequestException as exc:
        raise LinkedInError(f"Couldn't reach LinkedIn: {exc}") from exc
    _raise_for_response(resp)


def create_post(
    access_token: str,
    *,
    author_urn: str,
    commentary: str,
    visibility: str = "PUBLIC",
    image_urn: str | None = None,
    link_url: str | None = None,
) -> str:
    """Publishes a post via POST /rest/posts, returns the created post's URN."""
    payload = {
        "author": author_urn,
        "commentary": commentary,
        "visibility": visibility,
        "distribution": {
            "feedDistribution": "MAIN_FEED",
            "targetEntities": [],
            "thirdPartyDistributionChannels": [],
        },
        "lifecycleState": "PUBLISHED",
        "isReshareDisabledByAuthor": False,
    }
    if image_urn:
        payload["content"] = {"media": {"id": image_urn}}
    elif link_url:
        payload["content"] = {"article": {"source": link_url}}

    try:
        resp = requests.post(
            f"{API_BASE}/rest/posts", headers=_headers(access_token), json=payload, timeout=_TIMEOUT
        )
    except requests.RequestException as exc:
        raise LinkedInError(f"Couldn't reach LinkedIn: {exc}") from exc
    _raise_for_response(resp)
    return resp.headers.get("x-restli-id") or resp.headers.get("x-linkedin-id") or ""


def create_comment(access_token: str, *, post_urn: str, actor_urn: str, message: str) -> None:
    encoded_urn = quote(post_urn, safe="")
    try:
        resp = requests.post(
            f"{API_BASE}/rest/socialActions/{encoded_urn}/comments",
            headers=_headers(access_token),
            json={"actor": actor_urn, "message": {"text": message}},
            timeout=_TIMEOUT,
        )
    except requests.RequestException as exc:
        raise LinkedInError(f"Couldn't reach LinkedIn: {exc}") from exc
    _raise_for_response(resp)
