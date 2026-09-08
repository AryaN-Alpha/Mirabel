import logging
import os
from datetime import timedelta
from urllib.parse import urlencode

import requests
from django.conf import settings
from django.utils import timezone

from threads.models import ThreadsCredential

logger = logging.getLogger("threads")

TOKEN_URL = "https://graph.threads.net/oauth/access_token"
LONG_LIVED_TOKEN_URL = "https://graph.threads.net/access_token"
REFRESH_TOKEN_URL = "https://graph.threads.net/refresh_access_token"
USERINFO_URL = "https://graph.threads.net/v1.0/me"

_DEFAULT_EXPIRES_IN = 60 * 24 * 60 * 60  # 60 days
_TIMEOUT = 15


class ThreadsError(Exception):
    """Raised when Threads OAuth, token handling, or API calls fail."""

    def __init__(
        self,
        message: str,
        *,
        reason: str = "unknown",
        code: int | None = None,
        subcode: int | None = None,
        retry_after: int | None = None,
    ):
        super().__init__(message)
        self.reason = reason
        self.code = code
        self.subcode = subcode
        self.retry_after = retry_after


def _app_id() -> str:
    return os.environ.get("THREADS_APP_ID", "")


def _app_secret() -> str:
    return os.environ.get("THREADS_APP_SECRET", "")


def _require_client_credentials() -> tuple[str, str]:
    app_id = _app_id()
    app_secret = _app_secret()
    if not app_id or not app_secret:
        raise ThreadsError(
            "Meta Threads credentials aren't configured on the server (THREADS_APP_ID / THREADS_APP_SECRET).",
            reason="unconfigured",
        )
    return app_id, app_secret


def error_detail(resp: requests.Response) -> str:
    try:
        data = resp.json()
        err = data.get("error", {})
        if isinstance(err, dict):
            return err.get("message") or str(err)
        return data.get("message") or data.get("error_description") or resp.text
    except Exception:
        return resp.text


def parse_error_response(resp: requests.Response) -> tuple[str, int | None, int | None]:
    """Extracts message, error code, and error subcode from Meta Graph response."""
    msg = error_detail(resp)
    code = None
    subcode = None
    try:
        data = resp.json()
        err = data.get("error", {})
        if isinstance(err, dict):
            code = err.get("code")
            subcode = err.get("error_subcode")
    except Exception:
        pass
    return msg, code, subcode


def reason_for_status(status_code: int, code: int | None = None) -> str:
    # Meta specific error codes:
    # 190 -> Token expired / invalid
    # 4, 17, 32, 613 -> Rate limit exceeded
    # 10, 200..299 -> Permission / scope issues
    if code in (4, 17, 32, 613) or status_code == 429:
        return "rate_limited"
    if code == 190 or status_code == 401:
        return "token_expired"
    if code in (10, 200, 201, 202, 203) or status_code == 403:
        return "insufficient_scope"
    if 400 <= status_code < 500:
        return "post_rejected"
    return "unknown"


def get_auth_url(state: str) -> str:
    app_id, _ = _require_client_credentials()
    redirect_uri = getattr(settings, "THREADS_REDIRECT_URI", "")
    if not redirect_uri:
        raise ThreadsError("THREADS_REDIRECT_URI isn't configured on the server.", reason="unconfigured")

    authorize_url = getattr(settings, "THREADS_AUTHORIZE_URL", "https://www.threads.com/oauth/authorize")
    params = {
        "client_id": app_id,
        "redirect_uri": redirect_uri,
        "scope": getattr(settings, "THREADS_SCOPES", "threads_basic,threads_content_publish"),
        "response_type": "code",
        "state": state,
    }
    return f"{authorize_url}?{urlencode(params)}"


def exchange_code_for_token(code: str) -> dict:
    """Exchange authorization code for short-lived token, then exchange for long-lived 60-day token."""
    app_id, app_secret = _require_client_credentials()
    redirect_uri = getattr(settings, "THREADS_REDIRECT_URI", "")

    # Step 1: Exchange code for short-lived token
    try:
        resp = requests.post(
            TOKEN_URL,
            data={
                "client_id": app_id,
                "client_secret": app_secret,
                "grant_type": "authorization_code",
                "redirect_uri": redirect_uri,
                "code": code,
            },
            timeout=_TIMEOUT,
        )
    except requests.RequestException as exc:
        raise ThreadsError(f"Couldn't reach Meta Threads token endpoint: {exc}") from exc

    if not resp.ok:
        msg, code_val, subcode = parse_error_response(resp)
        raise ThreadsError(
            f"Failed exchanging code for Threads token ({resp.status_code}): {msg}",
            reason=reason_for_status(resp.status_code, code_val),
            code=code_val,
            subcode=subcode,
        )

    short_token_data = resp.json()
    short_token = short_token_data.get("access_token", "")
    user_id = short_token_data.get("user_id", "")

    # Step 2: Exchange short-lived token for long-lived 60-day token
    try:
        ll_resp = requests.get(
            LONG_LIVED_TOKEN_URL,
            params={
                "grant_type": "th_exchange_token",
                "client_secret": app_secret,
                "access_token": short_token,
            },
            timeout=_TIMEOUT,
        )
    except requests.RequestException as exc:
        logger.warning("threads.oauth: failed to exchange for long-lived token, falling back to short: %s", exc)
        return {"access_token": short_token, "user_id": user_id, "expires_in": 3600}

    if ll_resp.ok:
        ll_data = ll_resp.json()
        return {
            "access_token": ll_data.get("access_token", short_token),
            "user_id": user_id,
            "expires_in": ll_data.get("expires_in", _DEFAULT_EXPIRES_IN),
        }

    return {"access_token": short_token, "user_id": user_id, "expires_in": 3600}


def fetch_userinfo(access_token: str) -> dict:
    try:
        resp = requests.get(
            USERINFO_URL,
            params={
                "fields": "id,username,name,threads_profile_picture_url,threads_biography,is_private",
                "access_token": access_token,
            },
            timeout=_TIMEOUT,
        )
    except requests.RequestException as exc:
        raise ThreadsError(f"Couldn't reach Meta Threads profile endpoint: {exc}") from exc

    if not resp.ok:
        msg, code_val, subcode = parse_error_response(resp)
        raise ThreadsError(
            f"Failed fetching Threads profile ({resp.status_code}): {msg}",
            reason=reason_for_status(resp.status_code, code_val),
            code=code_val,
            subcode=subcode,
        )
    return resp.json()


def save_token_result(cred: ThreadsCredential, result: dict) -> None:
    access_token = result.get("access_token", "")
    cred.set_access_token(access_token)
    expires_in = int(result.get("expires_in", _DEFAULT_EXPIRES_IN))
    cred.token_expires_at = timezone.now() + timedelta(seconds=expires_in)
    # 90-day permission grant clock
    cred.permission_expires_at = timezone.now() + timedelta(days=90)
    cred.needs_reauth = False
    if result.get("user_id"):
        cred.threads_user_id = str(result["user_id"])
    cred.scope = getattr(settings, "THREADS_SCOPES", "")


def save_profile(cred: ThreadsCredential, profile: dict) -> None:
    if profile.get("id"):
        cred.threads_user_id = str(profile["id"])
    cred.username = profile.get("username") or cred.username
    cred.name = profile.get("name") or cred.name
    cred.biography = profile.get("threads_biography") or cred.biography
    cred.profile_picture_url = profile.get("threads_profile_picture_url") or cred.profile_picture_url
    if "is_private" in profile:
        cred.is_private_profile = bool(profile["is_private"])


def refresh_token(cred: ThreadsCredential, force: bool = False) -> bool:
    """Refresh long-lived access token.

    Rules per v2 specs:
    - Long-lived tokens can only be refreshed if at least 24 hours old.
      Refreshing earlier silently no-ops and returns False.
    - If user has a private profile, 90-day permission grant cannot be refreshed silently;
      if permission has expired, mark needs_reauth = True.
    """
    if not cred.access_token:
        return False

    now = timezone.now()
    if cred.is_private_profile and cred.is_permission_expired:
        cred.needs_reauth = True
        cred.save(update_fields=["needs_reauth"])
        logger.warning("threads.oauth: private profile permission expired; manual re-auth required")
        return False

    # Check 24-hour token age
    if not force and cred.token_age_hours < 24.0:
        logger.info("threads.oauth: token is younger than 24h (%.1fh), skipping refresh", cred.token_age_hours)
        return False

    current_token = cred.get_access_token()
    try:
        resp = requests.get(
            REFRESH_TOKEN_URL,
            params={
                "grant_type": "th_refresh_token",
                "access_token": current_token,
            },
            timeout=_TIMEOUT,
        )
    except requests.RequestException as exc:
        logger.error("threads.oauth: network failure during token refresh: %s", exc)
        return False

    if not resp.ok:
        msg, code_val, subcode = parse_error_response(resp)
        logger.error("threads.oauth: token refresh failed (%s): %s", resp.status_code, msg)
        if code_val == 190:
            cred.needs_reauth = True
            cred.save(update_fields=["needs_reauth"])
        return False

    data = resp.json()
    new_token = data.get("access_token", current_token)
    expires_in = int(data.get("expires_in", _DEFAULT_EXPIRES_IN))
    cred.set_access_token(new_token)
    cred.token_expires_at = now + timedelta(seconds=expires_in)
    if not cred.is_private_profile:
        cred.permission_expires_at = now + timedelta(days=90)
    cred.needs_reauth = False
    cred.save()
    logger.info("threads.oauth: token successfully refreshed, valid for %s days", expires_in // 86400)
    return True


def get_active_access_token() -> str:
    """Returns active, decrypted access token, auto-refreshing if near expiration."""
    cred = ThreadsCredential.current()
    if not cred.is_connected:
        raise ThreadsError("Threads account is not connected.", reason="not_connected")

    now = timezone.now()
    if cred.is_private_profile and cred.is_permission_expired:
        cred.needs_reauth = True
        cred.save(update_fields=["needs_reauth"])
        raise ThreadsError(
            "Your Threads account is private and requires manual reconnection every 90 days.",
            reason="needs_reauth",
        )

    # If expired or expiring within 5 days and >= 24h old, attempt refresh
    if cred.token_expires_at:
        days_left = (cred.token_expires_at - now).total_seconds() / 86400.0
        if days_left <= 5.0 and cred.token_age_hours >= 24.0:
            refresh_token(cred)

    if cred.is_expired:
        raise ThreadsError("Threads token has expired. Please reconnect in Settings.", reason="token_expired")

    token = cred.get_access_token()
    if not token:
        raise ThreadsError("Threads token is missing or corrupted.", reason="not_connected")
    return token
