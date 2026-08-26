import os
from datetime import timedelta
from urllib.parse import urlencode

import requests
from django.conf import settings
from django.utils import timezone

from linkedin.models import LinkedInCredential

AUTHORIZE_URL = "https://www.linkedin.com/oauth/v2/authorization"
TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken"
USERINFO_URL = "https://api.linkedin.com/v2/userinfo"

# LinkedIn's default access token lifetime when a token response omits
# expires_in (shouldn't happen in practice, but keeps save_token_result safe).
_DEFAULT_EXPIRES_IN = 60 * 24 * 60 * 60  # 60 days, in seconds

_TIMEOUT = 15


class LinkedInError(Exception):
    """Raised when LinkedIn OAuth/token handling or an API call can't complete.

    `reason` is a coarse machine-readable code (unconfigured, not_connected,
    token_expired, insufficient_scope, rate_limited, post_rejected, unknown) so
    callers that need to distinguish — e.g. the frontend showing a "Reconnect"
    state on token_expired — can inspect it, while every view can still fall
    back to a flat {"error": str(exc)} the way outlook/core do.
    """

    def __init__(self, message: str, *, reason: str = "unknown", retry_after: int | None = None):
        super().__init__(message)
        self.reason = reason
        self.retry_after = retry_after


def _client_id() -> str:
    return os.environ.get("LINKEDIN_CLIENT_ID", "")


def _client_secret() -> str:
    return os.environ.get("LINKEDIN_CLIENT_SECRET", "")


def _require_client_credentials() -> tuple[str, str]:
    client_id = _client_id()
    client_secret = _client_secret()
    if not client_id or not client_secret:
        raise LinkedInError("LinkedIn credentials aren't configured on the server.", reason="unconfigured")
    return client_id, client_secret


def error_detail(resp: requests.Response) -> str:
    try:
        body = resp.json()
        return body.get("message") or body.get("error_description") or body.get("error") or resp.text
    except ValueError:
        return resp.text


def reason_for_status(status_code: int) -> str:
    if status_code == 401:
        return "token_expired"
    if status_code == 403:
        return "insufficient_scope"
    if status_code == 429:
        return "rate_limited"
    if 400 <= status_code < 500:
        return "post_rejected"
    return "unknown"


def get_auth_url(state: str) -> str:
    client_id, _ = _require_client_credentials()
    if not settings.LINKEDIN_REDIRECT_URI:
        raise LinkedInError("LINKEDIN_REDIRECT_URI isn't configured on the server.", reason="unconfigured")
    params = {
        "response_type": "code",
        "client_id": client_id,
        "redirect_uri": settings.LINKEDIN_REDIRECT_URI,
        "state": state,
        "scope": settings.LINKEDIN_SCOPES,
    }
    return f"{AUTHORIZE_URL}?{urlencode(params)}"


def exchange_code_for_token(code: str) -> dict:
    client_id, client_secret = _require_client_credentials()
    try:
        resp = requests.post(
            TOKEN_URL,
            data={
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": settings.LINKEDIN_REDIRECT_URI,
                "client_id": client_id,
                "client_secret": client_secret,
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            timeout=_TIMEOUT,
        )
    except requests.RequestException as exc:
        raise LinkedInError(f"Couldn't reach LinkedIn: {exc}") from exc
    if not resp.ok:
        raise LinkedInError(error_detail(resp), reason=reason_for_status(resp.status_code))
    return resp.json()


def fetch_userinfo(access_token: str) -> dict:
    try:
        resp = requests.get(
            USERINFO_URL, headers={"Authorization": f"Bearer {access_token}"}, timeout=_TIMEOUT
        )
    except requests.RequestException as exc:
        raise LinkedInError(f"Couldn't reach LinkedIn: {exc}") from exc
    if not resp.ok:
        raise LinkedInError(error_detail(resp), reason=reason_for_status(resp.status_code))
    return resp.json()


def save_token_result(cred: LinkedInCredential, result: dict) -> None:
    cred.set_access_token(result["access_token"])
    expires_in = int(result.get("expires_in") or _DEFAULT_EXPIRES_IN)
    cred.token_expires_at = timezone.now() + timedelta(seconds=expires_in)
    cred.scope = result.get("scope", "")

    refresh_token = result.get("refresh_token")
    if refresh_token:
        cred.set_refresh_token(refresh_token)
        refresh_expires_in = result.get("refresh_token_expires_in")
        if refresh_expires_in:
            cred.refresh_token_expires_at = timezone.now() + timedelta(seconds=int(refresh_expires_in))


def save_profile(cred: LinkedInCredential, userinfo: dict) -> None:
    cred.member_sub = userinfo.get("sub", "")
    cred.member_urn = f"urn:li:person:{cred.member_sub}" if cred.member_sub else ""
    cred.name = userinfo.get("name", "")
    cred.email = userinfo.get("email", "")
    cred.picture_url = userinfo.get("picture", "")


def _refresh(cred: LinkedInCredential) -> None:
    client_id, client_secret = _require_client_credentials()
    try:
        resp = requests.post(
            TOKEN_URL,
            data={
                "grant_type": "refresh_token",
                "refresh_token": cred.get_refresh_token(),
                "client_id": client_id,
                "client_secret": client_secret,
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            timeout=_TIMEOUT,
        )
    except requests.RequestException as exc:
        raise LinkedInError(f"Couldn't reach LinkedIn: {exc}") from exc
    if not resp.ok:
        raise LinkedInError(
            "LinkedIn token refresh failed. Reconnect to continue.", reason="token_expired"
        )
    save_token_result(cred, resp.json())
    cred.save()


def get_active_access_token() -> str:
    """The single place every LinkedIn-API-calling function goes through.

    Unlike outlook.services.oauth.get_valid_access_token(), this does NOT
    silently refresh by default — standard LinkedIn developer apps don't get
    refresh tokens (see settings.LINKEDIN_ENABLE_REFRESH_TOKEN), so an expired
    token normally means the user must go through the "Reconnect LinkedIn" UI
    flow again. If the flag is on and a refresh token is actually present
    (partner-tier app), a refresh is attempted first.
    """
    cred = LinkedInCredential.current()
    if not cred.is_connected:
        raise LinkedInError("LinkedIn isn't connected.", reason="not_connected")

    if cred.is_expired:
        if settings.LINKEDIN_ENABLE_REFRESH_TOKEN and cred.get_refresh_token():
            _refresh(cred)
        else:
            raise LinkedInError(
                "Your LinkedIn connection has expired. Reconnect to continue.",
                reason="token_expired",
            )

    return cred.get_access_token()
