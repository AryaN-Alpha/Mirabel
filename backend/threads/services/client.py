import logging
from typing import Any

import requests

from threads.services.oauth import ThreadsError, parse_error_response, reason_for_status

logger = logging.getLogger("threads")

API_BASE = "https://graph.threads.net/v1.0"
_TIMEOUT = 15


def _headers(access_token: str, *, json_body: bool = True) -> dict[str, str]:
    headers = {
        "Authorization": f"Bearer {access_token}",
    }
    if json_body:
        headers["Content-Type"] = "application/json"
    return headers


def _raise_for_response(resp: requests.Response) -> None:
    if resp.ok:
        return

    msg, code_val, subcode = parse_error_response(resp)
    retry_after = None
    if resp.status_code == 429:
        try:
            retry_after = int(resp.headers.get("Retry-After", "")) or None
        except ValueError:
            retry_after = None

    reason = reason_for_status(resp.status_code, code_val)
    raise ThreadsError(
        f"Meta Threads request failed ({resp.status_code}): {msg}",
        reason=reason,
        code=code_val,
        subcode=subcode,
        retry_after=retry_after,
    )


def create_media_container(
    access_token: str,
    user_id: str,
    *,
    text: str,
    media_type: str = "TEXT",
    image_url: str | None = None,
    reply_to_id: str | None = None,
    reply_control: str | None = None,
    link_attachment: str | None = None,
) -> str:
    """Creates a Threads media container. Returns creation_id."""
    url = f"{API_BASE}/{user_id}/threads"
    payload: dict[str, Any] = {
        "media_type": media_type,
        "text": text,
    }
    if image_url:
        payload["image_url"] = image_url
    if reply_to_id:
        payload["reply_to_id"] = reply_to_id
    if reply_control:
        payload["reply_control"] = reply_control
    if link_attachment:
        payload["link_attachment"] = link_attachment

    try:
        resp = requests.post(url, headers=_headers(access_token), json=payload, timeout=_TIMEOUT)
    except requests.RequestException as exc:
        raise ThreadsError(f"Network error creating Threads container: {exc}") from exc

    _raise_for_response(resp)
    data = resp.json()
    container_id = data.get("id")
    if not container_id:
        raise ThreadsError("Meta Threads did not return a container ID.", reason="unknown")
    return str(container_id)


def get_container_status(access_token: str, container_id: str) -> dict:
    """Polls container processing status: returns dict with 'status' and 'error_message'."""
    url = f"{API_BASE}/{container_id}"
    params = {"fields": "status,error_message"}
    try:
        resp = requests.get(url, headers=_headers(access_token, json_body=False), params=params, timeout=_TIMEOUT)
    except requests.RequestException as exc:
        raise ThreadsError(f"Network error checking container status: {exc}") from exc

    _raise_for_response(resp)
    return resp.json()


def publish_container(access_token: str, user_id: str, creation_id: str) -> str:
    """Publishes a prepared container. Returns published post ID."""
    url = f"{API_BASE}/{user_id}/threads_publish"
    payload = {"creation_id": creation_id}
    try:
        resp = requests.post(url, headers=_headers(access_token), json=payload, timeout=_TIMEOUT)
    except requests.RequestException as exc:
        raise ThreadsError(f"Network error publishing Threads container: {exc}") from exc

    _raise_for_response(resp)
    data = resp.json()
    post_id = data.get("id")
    if not post_id:
        raise ThreadsError("Meta Threads did not return a post ID on publish.", reason="unknown")
    return str(post_id)


def delete_post(access_token: str, post_id: str) -> bool:
    """Deletes a published Threads post via DELETE /{post_id}."""
    url = f"{API_BASE}/{post_id}"
    try:
        resp = requests.delete(url, headers=_headers(access_token, json_body=False), timeout=_TIMEOUT)
    except requests.RequestException as exc:
        raise ThreadsError(f"Network error deleting Threads post: {exc}") from exc

    _raise_for_response(resp)
    data = resp.json()
    return bool(data.get("success", True))


def get_publishing_limit(access_token: str, user_id: str) -> dict:
    """Fetches dynamic rate-limit status from GET /{user_id}/threads_publishing_limit."""
    url = f"{API_BASE}/{user_id}/threads_publishing_limit"
    params = {"fields": "quota_usage,config,reply_quota_usage,reply_config"}
    try:
        resp = requests.get(url, headers=_headers(access_token, json_body=False), params=params, timeout=_TIMEOUT)
    except requests.RequestException as exc:
        raise ThreadsError(f"Network error reading Threads publishing limits: {exc}") from exc

    _raise_for_response(resp)
    return resp.json()


def get_user_threads(access_token: str, user_id: str = "me", limit: int = 20) -> list[dict]:
    """Lists recent threads published by user."""
    url = f"{API_BASE}/{user_id}/threads"
    params = {
        "fields": "id,media_product_type,media_type,text,permalink,timestamp,username,is_quote_post,has_replies",
        "limit": min(limit, 50),
    }
    try:
        resp = requests.get(url, headers=_headers(access_token, json_body=False), params=params, timeout=_TIMEOUT)
    except requests.RequestException as exc:
        raise ThreadsError(f"Network error fetching user threads: {exc}") from exc

    _raise_for_response(resp)
    data = resp.json()
    return data.get("data", [])


def get_thread_replies(access_token: str, thread_id: str, limit: int = 20) -> list[dict]:
    """Retrieves conversation replies to a thread."""
    url = f"{API_BASE}/{thread_id}/conversation"
    params = {
        "fields": "id,text,timestamp,username,permalink",
        "limit": min(limit, 50),
    }
    try:
        resp = requests.get(url, headers=_headers(access_token, json_body=False), params=params, timeout=_TIMEOUT)
    except requests.RequestException as exc:
        raise ThreadsError(f"Network error fetching thread replies: {exc}") from exc

    _raise_for_response(resp)
    data = resp.json()
    return data.get("data", [])


def get_post_insights(access_token: str, post_id: str) -> dict:
    """Retrieves metrics (views, likes, replies, reposts, quotes) for a post."""
    url = f"{API_BASE}/{post_id}/insights"
    params = {"metric": "views,likes,replies,reposts,quotes"}
    try:
        resp = requests.get(url, headers=_headers(access_token, json_body=False), params=params, timeout=_TIMEOUT)
    except requests.RequestException as exc:
        raise ThreadsError(f"Network error fetching post insights: {exc}") from exc

    _raise_for_response(resp)
    data = resp.json()
    metrics = {}
    for item in data.get("data", []):
        metrics[item.get("name")] = item.get("values", [{}])[0].get("value", 0)
    return metrics


def get_account_insights(access_token: str, user_id: str = "me") -> dict:
    """Retrieves account-level insights from Threads API."""
    url = f"{API_BASE}/{user_id}/threads_insights"
    params = {"metric": "views,likes,replies,reposts,quotes,followers_count"}
    try:
        resp = requests.get(url, headers=_headers(access_token, json_body=False), params=params, timeout=_TIMEOUT)
    except requests.RequestException as exc:
        raise ThreadsError(f"Network error fetching account insights: {exc}") from exc

    _raise_for_response(resp)
    data = resp.json()
    metrics = {}
    for item in data.get("data", []):
        metrics[item.get("name")] = item.get("total_value", {}).get("value", 0)
    return metrics
