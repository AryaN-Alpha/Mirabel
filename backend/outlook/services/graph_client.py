import logging

import requests

from outlook.services.oauth import OutlookError

logger = logging.getLogger("outlook.services.graph_client")

GRAPH_BASE = "https://graph.microsoft.com/v1.0"

MESSAGE_LIST_FIELDS = "id,subject,from,receivedDateTime,bodyPreview,isRead"
THREAD_FIELDS = "id,subject,from,receivedDateTime,sentDateTime,body"

_TIMEOUT = 15


def _headers(token: str, *, prefer_text: bool = False, advanced_query: bool = False) -> dict:
    headers = {"Authorization": f"Bearer {token}"}
    if prefer_text:
        headers["Prefer"] = 'outlook.body-content-type="text"'
    if advanced_query:
        headers["ConsistencyLevel"] = "eventual"
    return headers


def _raise_for_response(resp: requests.Response) -> None:
    if resp.ok:
        return
    try:
        detail = resp.json().get("error", {}).get("message", resp.text)
    except ValueError:
        detail = resp.text
    raise OutlookError(f"Microsoft Graph request failed ({resp.status_code}): {detail}")


def get_me(token: str) -> dict:
    try:
        resp = requests.get(f"{GRAPH_BASE}/me", headers=_headers(token), timeout=_TIMEOUT)
    except requests.RequestException as exc:
        raise OutlookError(f"Couldn't reach Microsoft Graph: {exc}") from exc
    _raise_for_response(resp)
    return resp.json()


def _escape_odata_literal(value: str) -> str:
    """Escape a value bound for a single-quoted OData string literal.

    domain/sender here come straight from request query params, unlike the
    old hardcoded-domain-only version of this function — without this, a
    value like `x') or contains(subject,'secret` would break out of the
    intended filter clause.
    """
    return value.replace("'", "''")


def _fetch_unfiltered(token: str, params: dict) -> list[dict]:
    try:
        resp = requests.get(
            f"{GRAPH_BASE}/me/mailFolders/inbox/messages",
            headers=_headers(token),
            params=params,
            timeout=_TIMEOUT,
        )
    except requests.RequestException as exc:
        raise OutlookError(f"Couldn't reach Microsoft Graph: {exc}") from exc
    _raise_for_response(resp)
    return resp.json().get("value", [])


def list_inbox_messages(
    token: str, *, domain: str | None = None, sender: str | None = None, top: int = 10, skip: int = 0
) -> list[dict]:
    base_params = {
        "$select": MESSAGE_LIST_FIELDS,
        "$orderby": "receivedDateTime desc",
    }

    if not domain and not sender:
        return _fetch_unfiltered(token, {**base_params, "$top": top, "$skip": skip})

    if sender:
        escaped = _escape_odata_literal(sender)
        filter_clause = f"from/emailAddress/address eq '{escaped}'"
        matches_locally = lambda addr: addr.lower() == sender.lower()  # noqa: E731
    else:
        escaped = _escape_odata_literal(domain)
        filter_clause = f"contains(from/emailAddress/address,'{escaped}')"
        matches_locally = lambda addr: addr.lower().endswith(f"@{domain.lower()}")  # noqa: E731

    try:
        resp = requests.get(
            f"{GRAPH_BASE}/me/mailFolders/inbox/messages",
            headers=_headers(token, advanced_query=True),
            params={**base_params, "$top": top, "$skip": skip, "$filter": filter_clause, "$count": "true"},
            timeout=_TIMEOUT,
        )
    except requests.RequestException as exc:
        raise OutlookError(f"Couldn't reach Microsoft Graph: {exc}") from exc

    if resp.status_code == 400:
        # contains()/eq advanced-query support on from/emailAddress/address
        # isn't officially guaranteed the way it is for subject/body — fall
        # back to fetching unfiltered and filtering+paging locally. $skip
        # must be applied *after* the local filter, not before, or it would
        # skip past messages that don't even match.
        logger.warning("Graph rejected filter %r, falling back to client-side filter", filter_clause)
        messages = _fetch_unfiltered(token, {**base_params, "$top": 999})
        filtered = [m for m in messages if matches_locally(m.get("from", {}).get("emailAddress", {}).get("address", ""))]
        return filtered[skip : skip + top]

    _raise_for_response(resp)
    return resp.json().get("value", [])


def get_message(token: str, message_id: str, *, prefer_text: bool = False) -> dict:
    try:
        resp = requests.get(
            f"{GRAPH_BASE}/me/messages/{message_id}",
            headers=_headers(token, prefer_text=prefer_text),
            timeout=_TIMEOUT,
        )
    except requests.RequestException as exc:
        raise OutlookError(f"Couldn't reach Microsoft Graph: {exc}") from exc
    _raise_for_response(resp)
    return resp.json()


def list_conversation_messages(token: str, conversation_id: str) -> list[dict]:
    """Fetch every message in a conversation, across all folders.

    `/me/messages` (unlike `/me/mailFolders/inbox/messages`) is mailbox-wide,
    so this picks up the sent reply sitting in Sent Items alongside the
    original inbox message — that's what lets the UI render a real
    back-and-forth thread instead of just the one message that was opened.

    Graph rejects `$filter=conversationId eq ...` combined with `$orderby`
    ("The restriction or sort order is too complex for this operation"), so
    sorting is done client-side instead of asking Graph to do it.
    """
    escaped = _escape_odata_literal(conversation_id)
    params = {
        "$select": THREAD_FIELDS,
        "$filter": f"conversationId eq '{escaped}'",
        "$count": "true",
    }
    try:
        resp = requests.get(
            f"{GRAPH_BASE}/me/messages",
            headers=_headers(token, advanced_query=True),
            params=params,
            timeout=_TIMEOUT,
        )
    except requests.RequestException as exc:
        raise OutlookError(f"Couldn't reach Microsoft Graph: {exc}") from exc
    _raise_for_response(resp)

    messages = resp.json().get("value", [])
    messages.sort(key=lambda m: m.get("receivedDateTime") or m.get("sentDateTime") or "")
    return messages


def reply_to_message(token: str, message_id: str, comment: str) -> None:
    try:
        resp = requests.post(
            f"{GRAPH_BASE}/me/messages/{message_id}/reply",
            headers=_headers(token),
            json={"comment": comment},
            timeout=_TIMEOUT,
        )
    except requests.RequestException as exc:
        raise OutlookError(f"Couldn't reach Microsoft Graph: {exc}") from exc
    _raise_for_response(resp)


def send_mail(token: str, *, subject: str, body_html: str, to_recipients: list[str]) -> None:
    payload = {
        "message": {
            "subject": subject,
            "body": {"contentType": "HTML", "content": body_html},
            "toRecipients": [{"emailAddress": {"address": addr}} for addr in to_recipients],
        }
    }
    try:
        resp = requests.post(
            f"{GRAPH_BASE}/me/sendMail", headers=_headers(token), json=payload, timeout=_TIMEOUT
        )
    except requests.RequestException as exc:
        raise OutlookError(f"Couldn't reach Microsoft Graph: {exc}") from exc
    _raise_for_response(resp)
