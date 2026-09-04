import os
from datetime import timedelta
from unittest.mock import Mock, patch

from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APITestCase

from spotify.models import SpotifyCredential
from spotify.services import client, oauth
from spotify.services.oauth import API_BASE, SpotifyError

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

    def test_403_restriction_violated_is_playback_restricted(self):
        """Regression: pressing Play with no track loaded/resumable gets a
        403 "Player command failed: Restriction violated" from Spotify — an
        expected player-state condition, previously misclassified as
        insufficient_scope, which sent the UI's "Reconnect Spotify" action
        for a problem reconnecting can't fix."""
        resp = self._resp(403, {"error": {"status": 403, "message": "Player command failed: Restriction violated"}})
        self.assertEqual(oauth.reason_for_status(resp), "playback_restricted")

    def test_retry_after_header_is_parsed(self):
        resp = self._resp(429, headers={"Retry-After": "12"})
        self.assertEqual(oauth._retry_after(resp), 12)

    def test_missing_retry_after_header_is_none(self):
        resp = self._resp(429)
        self.assertIsNone(oauth._retry_after(resp))


class PlayDeviceFallbackTests(TestCase):
    """Regression coverage for "Player command failed: No active device
    found" — Spotify only resolves an omitted device_id against its own
    ambient "current active device", which stops resolving once a session
    goes idle even though a device (the desktop/mobile app) is still
    connected. client.play() now falls back to /me/player/devices instead of
    letting that 404 surface outright (see _resolve_play_device_id)."""

    def _response(self, body):
        return Mock(ok=True, status_code=200, content=b"1", json=Mock(return_value=body), headers={})

    @patch("spotify.services.client.requests.request")
    def test_explicit_device_id_skips_devices_lookup(self, mock_request):
        mock_request.return_value = self._response({})

        client.play("tok", device_id="explicit-device", uris=["spotify:track:1"], preserve_queue=False)

        mock_request.assert_called_once()
        method, url = mock_request.call_args[0]
        self.assertEqual((method, url), ("PUT", f"{API_BASE}/me/player/play"))
        self.assertEqual(mock_request.call_args[1]["params"], {"device_id": "explicit-device"})

    @patch("spotify.services.client.requests.request")
    def test_omitted_device_id_prefers_the_active_device(self, mock_request):
        mock_request.side_effect = [
            self._response({"devices": [{"id": "inactive-1", "is_active": False}, {"id": "active-1", "is_active": True}]}),
            self._response({}),
        ]

        client.play("tok", uris=["spotify:track:1"], preserve_queue=False)

        self.assertEqual(mock_request.call_count, 2)
        devices_call, play_call = mock_request.call_args_list
        self.assertEqual(devices_call[0], ("GET", f"{API_BASE}/me/player/devices"))
        self.assertEqual(play_call[1]["params"], {"device_id": "active-1"})

    @patch("spotify.services.client.requests.request")
    def test_omitted_device_id_falls_back_to_first_device_when_none_active(self, mock_request):
        mock_request.side_effect = [
            self._response({"devices": [{"id": "only-device", "is_active": False}]}),
            self._response({}),
        ]

        client.play("tok", uris=["spotify:track:1"], preserve_queue=False)

        play_call = mock_request.call_args_list[1]
        self.assertEqual(play_call[1]["params"], {"device_id": "only-device"})

    @patch("spotify.services.client.requests.request")
    def test_omitted_device_id_with_no_devices_sends_no_device_id(self, mock_request):
        mock_request.side_effect = [
            self._response({"devices": []}),
            self._response({}),
        ]

        client.play("tok", uris=["spotify:track:1"], preserve_queue=False)

        play_call = mock_request.call_args_list[1]
        self.assertIsNone(play_call[1]["params"])


class TransportDeviceFallbackTests(TestCase):
    """The same "current active device" staleness _resolve_play_device_id
    already guards play() against (see PlayDeviceFallbackTests) applies
    identically to every other playback-control endpoint — Spotify resolves
    an omitted device_id the same ambiguous way everywhere. Regression
    coverage for extending that fallback to pause/next/previous/seek/
    volume/shuffle/repeat/add_to_queue."""

    def _response(self, body):
        return Mock(ok=True, status_code=200, content=b"1", json=Mock(return_value=body), headers={})

    @patch("spotify.services.client.requests.request")
    def test_pause_falls_back_to_active_device(self, mock_request):
        mock_request.side_effect = [
            self._response({"devices": [{"id": "active-1", "is_active": True}]}),
            self._response({}),
        ]

        client.pause("tok")

        devices_call, pause_call = mock_request.call_args_list
        self.assertEqual(devices_call[0], ("GET", f"{API_BASE}/me/player/devices"))
        self.assertEqual(pause_call[1]["params"], {"device_id": "active-1"})

    @patch("spotify.services.client.requests.request")
    def test_next_track_falls_back_to_active_device(self, mock_request):
        mock_request.side_effect = [
            self._response({"devices": [{"id": "active-1", "is_active": True}]}),
            self._response({}),
        ]

        client.next_track("tok")

        next_call = mock_request.call_args_list[1]
        self.assertEqual(next_call[1]["params"], {"device_id": "active-1"})

    @patch("spotify.services.client.requests.request")
    def test_previous_track_falls_back_to_active_device(self, mock_request):
        mock_request.side_effect = [
            self._response({"devices": [{"id": "active-1", "is_active": True}]}),
            self._response({}),
        ]

        client.previous_track("tok")

        previous_call = mock_request.call_args_list[1]
        self.assertEqual(previous_call[1]["params"], {"device_id": "active-1"})

    @patch("spotify.services.client.requests.request")
    def test_seek_falls_back_to_active_device(self, mock_request):
        mock_request.side_effect = [
            self._response({"devices": [{"id": "active-1", "is_active": True}]}),
            self._response({}),
        ]

        client.seek("tok", 5000)

        seek_call = mock_request.call_args_list[1]
        self.assertEqual(seek_call[1]["params"], {"position_ms": 5000, "device_id": "active-1"})

    @patch("spotify.services.client.requests.request")
    def test_set_volume_falls_back_to_active_device(self, mock_request):
        mock_request.side_effect = [
            self._response({"devices": [{"id": "active-1", "is_active": True}]}),
            self._response({}),
        ]

        client.set_volume("tok", 50)

        volume_call = mock_request.call_args_list[1]
        self.assertEqual(volume_call[1]["params"], {"volume_percent": 50, "device_id": "active-1"})

    @patch("spotify.services.client.requests.request")
    def test_set_shuffle_falls_back_to_active_device(self, mock_request):
        mock_request.side_effect = [
            self._response({"devices": [{"id": "active-1", "is_active": True}]}),
            self._response({}),
        ]

        client.set_shuffle("tok", True)

        shuffle_call = mock_request.call_args_list[1]
        self.assertEqual(shuffle_call[1]["params"], {"state": "true", "device_id": "active-1"})

    @patch("spotify.services.client.requests.request")
    def test_set_repeat_falls_back_to_active_device(self, mock_request):
        mock_request.side_effect = [
            self._response({"devices": [{"id": "active-1", "is_active": True}]}),
            self._response({}),
        ]

        client.set_repeat("tok", "context")

        repeat_call = mock_request.call_args_list[1]
        self.assertEqual(repeat_call[1]["params"], {"state": "context", "device_id": "active-1"})

    @patch("spotify.services.client.requests.request")
    def test_add_to_queue_falls_back_to_active_device(self, mock_request):
        mock_request.side_effect = [
            self._response({"devices": [{"id": "active-1", "is_active": True}]}),
            self._response({}),
        ]

        client.add_to_queue("tok", "spotify:track:1")

        queue_call = mock_request.call_args_list[1]
        self.assertEqual(queue_call[1]["params"], {"uri": "spotify:track:1", "device_id": "active-1"})

    @patch("spotify.services.client.requests.request")
    def test_explicit_device_id_skips_devices_lookup(self, mock_request):
        mock_request.return_value = self._response({})

        client.pause("tok", device_id="explicit-device")

        mock_request.assert_called_once()
        self.assertEqual(mock_request.call_args[1]["params"], {"device_id": "explicit-device"})

    @patch("spotify.services.client.requests.request")
    def test_pause_does_not_fall_back_to_a_non_active_device(self, mock_request):
        """Unlike play()/add_to_queue(), pause() (and the other transport
        controls) must not target an arbitrary connected-but-idle device
        when nothing is actively playing — see
        _resolve_active_device_id's docstring. Silently controlling a
        random other device would be worse than a clear no_active_device
        error."""
        mock_request.side_effect = [
            self._response({"devices": [{"id": "idle-device", "is_active": False}]}),
            self._response({}),
        ]

        client.pause("tok")

        pause_call = mock_request.call_args_list[1]
        self.assertIsNone(pause_call[1]["params"])


class PlayPreserveQueueTests(TestCase):
    """Regression coverage for the queue-wiping bug: starting playback with
    a bare `uris` play replaces Spotify's active context, which silently
    drops any manually-queued "Up Next" tracks. play()'s preserve_queue
    (default True) snapshots /me/player/queue before the play call and
    re-adds each track afterward — but ONLY when nothing was already
    playing from a context, since /me/player/queue can't distinguish a
    context's own upcoming tracks from manually-queued ones (see play()'s
    docstring) — restoring an old context's tail would be a worse bug than
    the one being fixed."""

    def _response(self, body):
        return Mock(ok=True, status_code=200, content=b"1", json=Mock(return_value=body), headers={})

    @patch("spotify.services.client.requests.request")
    def test_uris_play_snapshots_and_restores_the_queue_when_no_prior_context(self, mock_request):
        mock_request.side_effect = [
            self._response({"item": {"name": "Old Track"}, "context": None}),  # GET currently-playing
            self._response({"queue": [{"uri": "spotify:track:A"}, {"uri": "spotify:track:B"}]}),  # GET queue
            self._response({}),  # PUT play
            self._response({}),  # POST queue A
            self._response({}),  # POST queue B
        ]

        client.play("tok", device_id="dev-1", uris=["spotify:track:X"])

        methods_and_paths = [call[0] for call in mock_request.call_args_list]
        self.assertEqual(
            methods_and_paths,
            [
                ("GET", f"{API_BASE}/me/player/currently-playing"),
                ("GET", f"{API_BASE}/me/player/queue"),
                ("PUT", f"{API_BASE}/me/player/play"),
                ("POST", f"{API_BASE}/me/player/queue"),
                ("POST", f"{API_BASE}/me/player/queue"),
            ],
        )
        requeue_uris = [c[1]["params"]["uri"] for c in mock_request.call_args_list[3:]]
        self.assertEqual(requeue_uris, ["spotify:track:A", "spotify:track:B"])

    @patch("spotify.services.client.requests.request")
    def test_uris_play_skips_preservation_when_a_context_was_already_active(self, mock_request):
        """An active context (album/playlist) means /me/player/queue would
        return that context's own upcoming tracks, not manually-queued
        ones — snapshotting it would wrongly pin them onto the new track."""
        mock_request.side_effect = [
            self._response({"item": {"name": "Old Track"}, "context": {"uri": "spotify:album:old"}}),
            self._response({}),  # PUT play
        ]

        client.play("tok", device_id="dev-1", uris=["spotify:track:X"])

        methods = [call[0][0] for call in mock_request.call_args_list]
        self.assertEqual(methods, ["GET", "PUT"])

    @patch("spotify.services.client.requests.request")
    def test_context_uri_play_never_preserves_the_queue(self, mock_request):
        """A context_uri play has no "queue" to preserve — only a context
        to replace — so it must never attempt the snapshot at all."""
        mock_request.return_value = self._response({})

        client.play("tok", device_id="dev-1", context_uri="spotify:album:1")

        mock_request.assert_called_once()
        method, url = mock_request.call_args[0]
        self.assertEqual((method, url), ("PUT", f"{API_BASE}/me/player/play"))

    @patch("spotify.services.client.requests.request")
    def test_preserve_queue_false_skips_snapshot_and_restore(self, mock_request):
        mock_request.return_value = self._response({})

        client.play("tok", device_id="dev-1", uris=["spotify:track:X"], preserve_queue=False)

        mock_request.assert_called_once()
        method, url = mock_request.call_args[0]
        self.assertEqual((method, url), ("PUT", f"{API_BASE}/me/player/play"))

    @patch("spotify.services.client.requests.request")
    def test_plain_resume_does_not_snapshot_the_queue(self, mock_request):
        """No context_uri/uris means this is a bare resume — nothing is
        being replaced, so there's nothing to preserve; skip the extra
        GET even though preserve_queue defaults True."""
        mock_request.return_value = self._response({})

        client.play("tok", device_id="dev-1")

        mock_request.assert_called_once()
        method, url = mock_request.call_args[0]
        self.assertEqual((method, url), ("PUT", f"{API_BASE}/me/player/play"))

    @patch("spotify.services.client.requests.request")
    def test_currently_playing_lookup_failure_does_not_block_playback(self, mock_request):
        """A failed GET /me/player/currently-playing (e.g. nothing was
        playing before) must not prevent the play call itself from going
        out."""

        def side_effect(method, url, **kwargs):
            if method == "GET":
                return Mock(ok=False, status_code=404, json=Mock(return_value={}), text="", headers={})
            return self._response({})

        mock_request.side_effect = side_effect

        client.play("tok", device_id="dev-1", uris=["spotify:track:X"])

        methods = [call[0][0] for call in mock_request.call_args_list]
        self.assertEqual(methods, ["GET", "PUT"])

    @patch("spotify.services.client.requests.request")
    def test_requeue_failure_does_not_raise_and_continues_the_rest(self, mock_request):
        """Playback already succeeded by the time re-queueing runs — a
        failure restoring one track (e.g. a transient rate limit) is
        best-effort and must not stop the remaining tracks from being
        restored or surface as a failed play call."""
        mock_request.side_effect = [
            self._response({"item": {"name": "Old Track"}, "context": None}),
            self._response({"queue": [{"uri": "spotify:track:A"}, {"uri": "spotify:track:B"}]}),
            self._response({}),  # PUT play
            Mock(ok=False, status_code=500, json=Mock(return_value={}), text="", headers={}),  # requeue A fails
            self._response({}),  # requeue B still attempted
        ]

        client.play("tok", device_id="dev-1", uris=["spotify:track:X"])  # must not raise

        self.assertEqual(mock_request.call_count, 5)


class PlayerPlayViewTests(APITestCase):
    """player_play is a thin view — the preserve_queue snapshot/restore
    logic lives in client.play() (see PlayPreserveQueueTests) so it also
    covers agent/tools/spotify_tools.py's play_spotify_item, which calls
    client.play() directly and never goes through this view. This class
    only checks the view correctly passes the flag through."""

    def setUp(self):
        _connected_credential(token_expires_at=timezone.now() + timedelta(hours=1))

    @patch("spotify.views.client.play")
    def test_preserve_queue_defaults_true(self, mock_play):
        response = self.client.put(
            reverse("spotify-player-play"), {"uris": ["spotify:track:1"]}, format="json"
        )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(mock_play.call_args.kwargs["preserve_queue"])

    @patch("spotify.views.client.play")
    def test_preserve_queue_false_is_passed_through(self, mock_play):
        response = self.client.put(
            reverse("spotify-player-play"),
            {"uris": ["spotify:track:1"], "preserve_queue": False},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertFalse(mock_play.call_args.kwargs["preserve_queue"])
