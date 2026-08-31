import os
from datetime import timedelta
from unittest.mock import Mock, patch

from django.test import TestCase
from django.utils import timezone

from spotify.models import SpotifyCredential
from spotify.services import oauth
from spotify.services.oauth import SpotifyError

# SPOTIFY_CLIENT_ID/SECRET are read lazily from the environment (see
# oauth._require_client_credentials) rather than Django settings, so a dev
# without a Spotify app configured can still run the server — but these
# tests exercise the refresh path *past* that check, so they need something
# present regardless of what's actually in the developer's .env.
_ENV_PATCH = {"SPOTIFY_CLIENT_ID": "test-client-id", "SPOTIFY_CLIENT_SECRET": "test-client-secret"}


def _connected_credential(**overrides) -> SpotifyCredential:
    cred = SpotifyCredential.current()
    cred.set_access_token("old-access-token")
    cred.set_refresh_token("old-refresh-token")
    cred.spotify_user_id = "user123"
    cred.token_expires_at = timezone.now() - timedelta(minutes=1)  # already expired
    for key, value in overrides.items():
        setattr(cred, key, value)
    cred.save()
    return cred


class GetActiveAccessTokenTests(TestCase):
    """Regression coverage for the token refresh choke point every Spotify
    call goes through — mirrors outlook/classroom's equivalent tests. The
    real bug class this guards against (see CLAUDE.md's provider/retry
    conventions) is silently calling the Spotify API with a stale token
    instead of refreshing first."""

    def test_not_connected_raises_with_reason(self):
        with self.assertRaises(SpotifyError) as ctx:
            oauth.get_active_access_token()
        self.assertEqual(ctx.exception.reason, "not_connected")

    @patch.dict(os.environ, _ENV_PATCH)
    @patch("spotify.services.oauth.requests.post")
    def test_expired_token_is_refreshed_and_persisted(self, mock_post):
        _connected_credential()
        mock_post.return_value = Mock(
            ok=True,
            json=Mock(return_value={"access_token": "new-access-token", "expires_in": 3600}),
        )

        token = oauth.get_active_access_token()

        self.assertEqual(token, "new-access-token")
        refreshed = SpotifyCredential.current()
        self.assertEqual(refreshed.get_access_token(), "new-access-token")
        self.assertGreater(refreshed.token_expires_at, timezone.now())

    @patch.dict(os.environ, _ENV_PATCH)
    @patch("spotify.services.oauth.requests.post")
    def test_refresh_without_new_refresh_token_keeps_the_old_one(self, mock_post):
        _connected_credential()
        mock_post.return_value = Mock(
            ok=True,
            json=Mock(return_value={"access_token": "new-access-token", "expires_in": 3600}),
        )

        oauth.get_active_access_token()

        self.assertEqual(SpotifyCredential.current().get_refresh_token(), "old-refresh-token")

    @patch.dict(os.environ, _ENV_PATCH)
    @patch("spotify.services.oauth.requests.post")
    def test_refresh_failure_raises_token_expired(self, mock_post):
        _connected_credential()
        mock_post.return_value = Mock(ok=False, status_code=400, json=Mock(return_value={}), text="")

        with self.assertRaises(SpotifyError) as ctx:
            oauth.get_active_access_token()
        self.assertEqual(ctx.exception.reason, "token_expired")

    def test_no_refresh_token_raises_token_expired_without_network_call(self):
        _connected_credential(refresh_token="")

        with self.assertRaises(SpotifyError) as ctx:
            oauth.get_active_access_token()
        self.assertEqual(ctx.exception.reason, "token_expired")

    @patch("spotify.services.oauth.requests.post")
    def test_valid_unexpired_token_is_not_refreshed(self, mock_post):
        _connected_credential(token_expires_at=timezone.now() + timedelta(hours=1))

        token = oauth.get_active_access_token()

        mock_post.assert_not_called()
        self.assertEqual(token, "old-access-token")


class ReasonForStatusTests(TestCase):
    """error mapping drives spotify/views.py::_error_response's HTTP status
    choice — wrong here means every endpoint reports the wrong status."""

    def _resp(self, status_code, body=None, headers=None):
        return Mock(
            status_code=status_code,
            json=Mock(return_value=body or {}),
            text="",
            headers=headers or {},
        )

    def test_401_is_token_expired(self):
        self.assertEqual(oauth.reason_for_status(self._resp(401)), "token_expired")

    def test_403_is_insufficient_scope(self):
        resp = self._resp(403, {"error": {"status": 403, "message": "Insufficient client scope"}})
        self.assertEqual(oauth.reason_for_status(resp), "insufficient_scope")

    def test_403_with_premium_in_message_is_premium_required(self):
        """Regression: a Free-tier account hitting a Premium-only playback
        endpoint also gets a 403 from Spotify ("Player command failed:
        Premium required"), which used to be indistinguishable from a
        missing-OAuth-scope 403. Conflating them sent the UI's "Reconnect
        Spotify" fix-it action for a problem reconnecting can't solve."""
        resp = self._resp(403, {"error": {"status": 403, "message": "Player command failed: Premium required"}})
        self.assertEqual(oauth.reason_for_status(resp), "premium_required")

    def test_429_is_rate_limited(self):
        self.assertEqual(oauth.reason_for_status(self._resp(429)), "rate_limited")

    def test_404_with_device_in_message_is_no_active_device(self):
        resp = self._resp(404, {"error": {"status": 404, "message": "Device not found"}})
        self.assertEqual(oauth.reason_for_status(resp), "no_active_device")

    def test_retry_after_header_is_parsed(self):
        resp = self._resp(429, headers={"Retry-After": "12"})
        self.assertEqual(oauth._retry_after(resp), 12)

    def test_missing_retry_after_header_is_none(self):
        resp = self._resp(429)
        self.assertIsNone(oauth._retry_after(resp))
