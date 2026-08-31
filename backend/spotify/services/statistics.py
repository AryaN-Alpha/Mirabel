"""Aggregation for the Statistics dashboard and the personalized Home
dashboard. Spotify has no single endpoint for "everything about my
listening" (spec section 24/29), so this fans out several independent,
already-cached-per-request-cycle Web API calls concurrently rather than
sequentially — same pattern as classroom.services.client.get_courses_with_coursework,
which had the identical N-sequential-round-trips problem.

Nothing here is persisted: every value is freshly fetched per request and
reflects Spotify's state at call time (spec section 37 — currently-playing/
playback-adjacent data must never be served stale).
"""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor

from spotify.services import client
from spotify.services.oauth import SpotifyError


def _safe(fn, *args, **kwargs):
    """Statistics is a best-effort aggregate view — one failing sub-call
    (e.g. no top-tracks history yet for a brand-new account) shouldn't take
    down the whole dashboard. Mirrors memory/services/retrieval's
    fall-back-to-empty-on-failure convention for non-critical reads."""
    try:
        return fn(*args, **kwargs)
    except SpotifyError:
        return None


def get_dashboard_stats(token: str) -> dict:
    with ThreadPoolExecutor(max_workers=6) as pool:
        top_artists_f = pool.submit(_safe, client.get_top_artists, token, limit=5)
        top_tracks_f = pool.submit(_safe, client.get_top_tracks, token, limit=5)
        playlists_f = pool.submit(_safe, client.get_current_user_playlists, token, limit=1)
        saved_tracks_f = pool.submit(_safe, client.get_saved_tracks, token, limit=1)
        saved_albums_f = pool.submit(_safe, client.get_saved_albums, token, limit=1)
        following_f = pool.submit(_safe, client.get_followed_artists, token, limit=1)

        top_artists = top_artists_f.result()
        top_tracks = top_tracks_f.result()
        playlists = playlists_f.result()
        saved_tracks = saved_tracks_f.result()
        saved_albums = saved_albums_f.result()
        following = following_f.result()

    return {
        "top_artists": (top_artists or {}).get("items", []),
        "top_tracks": (top_tracks or {}).get("items", []),
        "playlist_count": (playlists or {}).get("total", 0),
        "saved_track_count": (saved_tracks or {}).get("total", 0),
        "saved_album_count": (saved_albums or {}).get("total", 0),
        "followed_artist_count": ((following or {}).get("artists") or {}).get("total", 0),
    }


def get_home_dashboard(token: str) -> dict:
    with ThreadPoolExecutor(max_workers=5) as pool:
        top_artists_f = pool.submit(_safe, client.get_top_artists, token, limit=8)
        top_tracks_f = pool.submit(_safe, client.get_top_tracks, token, limit=8)
        playlists_f = pool.submit(_safe, client.get_current_user_playlists, token, limit=8)
        recent_f = pool.submit(_safe, client.get_recently_played, token, limit=8)
        saved_albums_f = pool.submit(_safe, client.get_saved_albums, token, limit=8)

        top_artists = top_artists_f.result()
        top_tracks = top_tracks_f.result()
        playlists = playlists_f.result()
        recent = recent_f.result()
        saved_albums = saved_albums_f.result()

    return {
        "top_artists": (top_artists or {}).get("items", []),
        "top_tracks": (top_tracks or {}).get("items", []),
        "playlists": (playlists or {}).get("items", []),
        "recently_played": [item.get("track") for item in (recent or {}).get("items", []) if item.get("track")],
        "saved_albums": [item.get("album") for item in (saved_albums or {}).get("items", []) if item.get("album")],
    }
