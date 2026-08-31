"""Spotify OAuth (Authorization Code flow, confidential client). Same shape
as classroom.services.oauth — generic requests-based OAuth2, not a vendor
SDK — because Spotify's Accounts service is a plain OAuth2 authorization
server with no Python SDK worth adding as a dependency.

get_active_access_token() is the single choke point every Spotify Web API
call goes through (mirrors outlook.services.oauth.get_valid_access_token()
and classroom.services.oauth.get_active_access_token()): it loads the
stored credential, refreshes via the refresh_token grant if the access
token is expired or within _REFRESH_SKEW of expiring, persists the
refreshed token, and returns a ready-to-use access token. No individual
Spotify service function implements its own refresh logic.
"""

from __future__ import annotations

import os
from datetime import timedelta
from urllib.parse import urlencode

import requests
from django.conf import settings
from django.utils import timezone

from spotify.models import SpotifyCredential

AUTHORIZE_URL = "https://accounts.spotify.com/authorize"
TOKEN_URL = "https://accounts.spotify.com/api/token"
API_BASE = "https://api.spotify.com/v1"

# Centralized scope list (spec section 8) — only what the implemented
# features actually use, so this list is auditable against the feature set:
#   user-read-private/email      -> connect + profile (product/display name)
#   user-library-read/modify     -> saved tracks & albums
#   playlist-read-private/collaborative, playlist-modify-public/private
#                                 -> playlists + playlist track CRUD
#   ugc-image-upload             -> custom playlist covers
#   user-follow-read/modify      -> followed artists
#   user-top-read                -> top artists/tracks
#   user-read-playback-state, user-modify-playback-state,
#   user-read-currently-playing  -> now playing, playback controls, devices, queue
SCOPES = (
    "user-read-private",
    "user-read-email",
    "user-library-read",
    "user-library-modify",
    "playlist-read-private",
    "playlist-read-collaborative",
    "playlist-modify-public",
    "playlist-modify-private",
    "ugc-image-upload",
    "user-follow-read",
    "user-follow-modify",
    "user-top-read",
    "user-read-playback-state",
    "user-modify-playback-state",
    "user-read-currently-playing",
)

_REFRESH_SKEW = timedelta(minutes=5)
_TIMEOUT = 15


class SpotifyError(Exception):
    """Raised when Spotify OAuth/token handling or a Web API call can't
    complete. `reason` is a coarse machine-readable code (unconfigured,
    not_connected, token_expired, insufficient_scope, no_active_device,
    premium_required, rate_limited, unknown) that views/tools map to a
    user-facing message — same convention as classroom.services.oauth.ClassroomError.
    `retry_after` (seconds) is set from Spotify's Retry-After header on 429s.
    """

    def __init__(
        self, message: str, *, reason: str = "unknown", retry_after: int | None = None
    ):
        super().__init__(message)
        self.reason = reason
        self.retry_after = retry_after


def _client_id() -> str:
    return os.environ.get("SPOTIFY_CLIENT_ID", "")


def _client_secret() -> str:
    return os.environ.get("SPOTIFY_CLIENT_SECRET", "")


def _require_client_credentials() -> tuple[str, str]:
    client_id = _client_id()
    client_secret = _client_secret()
    if not client_id or not client_secret:
        raise SpotifyError(
            "Spotify credentials aren't configured on the server.", reason="unconfigured"
        )
    return client_id, client_secret


def error_detail(resp: requests.Response) -> str:
    try:
        body = resp.json()
        # Spotify's two error shapes: {"error": "...", "error_description": "..."}
        # from the Accounts/token endpoint, {"error": {"status": ., "message": "."}}
        # from the Web API.
        if isinstance(body.get("error"), dict):
            return body["error"].get("message") or resp.text
        return body.get("error_description") or body.get("error") or resp.text
    except ValueError:
        return resp.text


def reason_for_status(resp: requests.Response) -> str:
    status_code = resp.status_code
    if status_code == 401:
        return "token_expired"
    if status_code == 403:
        # Spotify returns 403 for two very different causes: a missing OAuth
        # scope, and a Free-tier account hitting a Premium-only playback
        # endpoint ("Player command failed: Premium required"). Conflating
        # them was a real bug — the UI's fix-it action for insufficient_scope
        # is "Reconnect Spotify" (spec section 35), which does nothing for a
        # Free account and would just confuse the user.
        if "premium" in error_detail(resp).lower():
            return "premium_required"
        return "insufficient_scope"
    if status_code == 404:
        detail = error_detail(resp)
        if "device" in detail.lower():
            return "no_active_device"
        return "not_found"
    if status_code == 429:
        return "rate_limited"
    if status_code == 502 or status_code == 503:
        return "unavailable"
    return "unknown"


def _retry_after(resp: requests.Response) -> int | None:
    raw = resp.headers.get("Retry-After")
    if not raw:
        return None
    try:
        return int(raw)
    except ValueError:
        return None


def raise_for_response(resp: requests.Response) -> None:
    if resp.ok:
        return
    raise SpotifyError(
        error_detail(resp), reason=reason_for_status(resp), retry_after=_retry_after(resp)
    )


def get_auth_url(state: str) -> str:
    client_id, _ = _require_client_credentials()
    if not settings.SPOTIFY_REDIRECT_URI:
        raise SpotifyError(
            "SPOTIFY_REDIRECT_URI isn't configured on the server.", reason="unconfigured"
        )
    params = {
        "response_type": "code",
        "client_id": client_id,
        "redirect_uri": settings.SPOTIFY_REDIRECT_URI,
        "state": state,
        "scope": " ".join(SCOPES),
        "show_dialog": "false",
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
                "redirect_uri": settings.SPOTIFY_REDIRECT_URI,
            },
            auth=(client_id, client_secret),
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            timeout=_TIMEOUT,
        )
    except requests.RequestException as exc:
        raise SpotifyError(f"Couldn't reach Spotify: {exc}") from exc
    raise_for_response(resp)
    return resp.json()


def save_token_result(cred: SpotifyCredential, result: dict) -> None:
    cred.set_access_token(result["access_token"])
    expires_in = int(result.get("expires_in") or 3600)
    cred.token_expires_at = timezone.now() + timedelta(seconds=expires_in)
    if result.get("scope"):
        cred.scope = result["scope"]

    # Spotify's refresh-grant response may or may not include a new
    # refresh_token (token rotation is enabled per-app) — only overwrite
    # when one is actually present, same as classroom.services.oauth.
    refresh_token = result.get("refresh_token")
    if refresh_token:
        cred.set_refresh_token(refresh_token)


def save_profile(cred: SpotifyCredential, me: dict) -> None:
    cred.spotify_user_id = me.get("id", "")
    cred.display_name = me.get("display_name") or me.get("id", "")
    cred.email = me.get("email", "")
    cred.product = me.get("product", "")
    images = me.get("images") or []
    cred.image_url = images[0]["url"] if images else ""


def _refresh(cred: SpotifyCredential) -> None:
    client_id, client_secret = _require_client_credentials()
    try:
        resp = requests.post(
            TOKEN_URL,
            data={"grant_type": "refresh_token", "refresh_token": cred.get_refresh_token()},
            auth=(client_id, client_secret),
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            timeout=_TIMEOUT,
        )
    except requests.RequestException as exc:
        raise SpotifyError(f"Couldn't reach Spotify: {exc}") from exc
    if not resp.ok:
        raise SpotifyError(
            "Your Spotify connection has expired. Reconnect to continue.",
            reason="token_expired",
        )
    save_token_result(cred, resp.json())
    cred.save()


def get_active_access_token() -> str:
    cred = SpotifyCredential.current()
    if not cred.is_connected:
        raise SpotifyError("Spotify isn't connected.", reason="not_connected")

    needs_refresh = cred.token_expires_at is None or timezone.now() >= (
        cred.token_expires_at - _REFRESH_SKEW
    )
    if needs_refresh:
        if not cred.get_refresh_token():
            raise SpotifyError(
                "Your Spotify connection has expired. Reconnect to continue.",
                reason="token_expired",
            )
        _refresh(cred)

    return cred.get_access_token()
