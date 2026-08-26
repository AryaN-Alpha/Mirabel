import os
from datetime import timedelta
from urllib.parse import urlencode

import requests
from django.conf import settings
from django.utils import timezone

from classroom.models import ClassroomCredential

AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo"

_REFRESH_SKEW = timedelta(minutes=5)
_TIMEOUT = 15


class ClassroomError(Exception):
    """Raised when Google OAuth/token handling or a Classroom/Drive/Docs API
    call can't complete. `reason` is a coarse machine-readable code
    (unconfigured, not_connected, token_expired, insufficient_scope,
    rate_limited, unknown) — same convention as linkedin.services.oauth.LinkedInError.
    """

    def __init__(
        self, message: str, *, reason: str = "unknown", retry_after: int | None = None
    ):
        super().__init__(message)
        self.reason = reason
        self.retry_after = retry_after


def _client_id() -> str:
    return os.environ.get("GOOGLE_CLASSROOM_CLIENT_ID", "")


def _client_secret() -> str:
    return os.environ.get("GOOGLE_CLASSROOM_CLIENT_SECRET", "")


def _require_client_credentials() -> tuple[str, str]:
    client_id = _client_id()
    client_secret = _client_secret()
    if not client_id or not client_secret:
        raise ClassroomError(
            "Google Classroom credentials aren't configured on the server.",
            reason="unconfigured",
        )
    return client_id, client_secret


def error_detail(resp: requests.Response) -> str:
    try:
        body = resp.json()
        return body.get("error_description") or body.get("error") or resp.text
    except ValueError:
        return resp.text


def reason_for_status(status_code: int) -> str:
    if status_code == 401:
        return "token_expired"
    if status_code == 403:
        return "insufficient_scope"
    if status_code == 429:
        return "rate_limited"
    return "unknown"


def get_auth_url(state: str) -> str:
    client_id, _ = _require_client_credentials()
    if not settings.GOOGLE_CLASSROOM_REDIRECT_URI:
        raise ClassroomError(
            "GOOGLE_CLASSROOM_REDIRECT_URI isn't configured on the server.",
            reason="unconfigured",
        )
    params = {
        "response_type": "code",
        "client_id": client_id,
        "redirect_uri": settings.GOOGLE_CLASSROOM_REDIRECT_URI,
        "state": state,
        "scope": settings.GOOGLE_CLASSROOM_SCOPES,
        # access_type=offline + prompt=consent are required to reliably get a
        # refresh_token back from Google on every consent, not just the first
        # ever authorization for this user+client+scope combination.
        "access_type": "offline",
        "prompt": "consent",
        "include_granted_scopes": "true",
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
                "redirect_uri": settings.GOOGLE_CLASSROOM_REDIRECT_URI,
                "client_id": client_id,
                "client_secret": client_secret,
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            timeout=_TIMEOUT,
        )
    except requests.RequestException as exc:
        raise ClassroomError(f"Couldn't reach Google: {exc}") from exc
    if not resp.ok:
        raise ClassroomError(
            error_detail(resp), reason=reason_for_status(resp.status_code)
        )
    return resp.json()


def fetch_userinfo(access_token: str) -> dict:
    try:
        resp = requests.get(
            USERINFO_URL,
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=_TIMEOUT,
        )
    except requests.RequestException as exc:
        raise ClassroomError(f"Couldn't reach Google: {exc}") from exc
    if not resp.ok:
        raise ClassroomError(
            error_detail(resp), reason=reason_for_status(resp.status_code)
        )
    return resp.json()


def save_token_result(cred: ClassroomCredential, result: dict) -> None:
    cred.set_access_token(result["access_token"])
    expires_in = int(result.get("expires_in") or 3600)
    cred.token_expires_at = timezone.now() + timedelta(seconds=expires_in)
    if result.get("scope"):
        cred.scope = result["scope"]

    # Google's refresh-grant response typically omits refresh_token entirely —
    # only overwrite when one is actually present, never null out a
    # previously stored token just because a renewal response lacks it.
    refresh_token = result.get("refresh_token")
    if refresh_token:
        cred.set_refresh_token(refresh_token)


def save_profile(cred: ClassroomCredential, userinfo: dict) -> None:
    cred.google_sub = userinfo.get("sub", "")
    cred.email = userinfo.get("email", "")
    cred.name = userinfo.get("name", "")
    cred.picture_url = userinfo.get("picture", "")


def _refresh(cred: ClassroomCredential) -> None:
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
        raise ClassroomError(f"Couldn't reach Google: {exc}") from exc
    if not resp.ok:
        raise ClassroomError(
            "Your Google Classroom connection has expired. Reconnect to continue.",
            reason="token_expired",
        )
    save_token_result(cred, resp.json())
    cred.save()


def get_active_access_token() -> str:
    """The single choke point every Classroom/Drive/Docs-calling function goes
    through — mirrors outlook.services.oauth.get_valid_access_token()'s
    auto-refresh model (5-min expiry skew), not linkedin's refuse-and-reconnect
    model, since Google reliably issues refresh tokens for this app."""
    cred = ClassroomCredential.current()
    if not cred.is_connected:
        raise ClassroomError(
            "Google Classroom isn't connected.", reason="not_connected"
        )

    needs_refresh = cred.token_expires_at is None or timezone.now() >= (
        cred.token_expires_at - _REFRESH_SKEW
    )
    if needs_refresh:
        if not cred.get_refresh_token():
            raise ClassroomError(
                "Your Google Classroom connection has expired. Reconnect to continue.",
                reason="token_expired",
            )
        _refresh(cred)

    return cred.get_access_token()
