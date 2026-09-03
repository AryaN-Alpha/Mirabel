"""Centralized Spotify Web API client. Every Spotify HTTP call in this app
goes through the _get/_post/_put/_delete helpers here — never scattered raw
`requests` calls in views.py or the agent tools (spec section 9 / this
repo's own outlook.services.graph_client / classroom.services.client
convention).

Endpoint compatibility note (spec section 46): audio-features,
audio-analysis, /recommendations and /artists/{id}/related-artists were
restricted by Spotify in Nov 2024 to apps with pre-existing extended API
access and are NOT available to new API integrations — this client
deliberately does not use them. The AI playlist generator
(spotify/services/ai_playlist via agent/tools/spotify_tools.py) builds
playlists from LLM-generated search queries against /v1/search instead of
/recommendations, which is the currently-supported approach.
"""

from __future__ import annotations

import base64

import requests

from spotify.services.oauth import API_BASE, SpotifyError, raise_for_response

_TIMEOUT = 15


def _headers(token: str, *, json_body: bool = False) -> dict:
    headers = {"Authorization": f"Bearer {token}"}
    if json_body:
        headers["Content-Type"] = "application/json"
    return headers


def _request(method: str, token: str, path: str, **kwargs) -> requests.Response:
    try:
        return requests.request(method, f"{API_BASE}{path}", timeout=_TIMEOUT, **kwargs)
    except requests.RequestException as exc:
        raise SpotifyError(f"Couldn't reach Spotify: {exc}") from exc


def _body(resp: requests.Response) -> dict:
    """Playback-control endpoints (play/pause/next/...) return 204 No Content
    on success, but Spotify occasionally sends a body that's non-empty (so
    `resp.content` is truthy) yet not valid JSON — e.g. stray whitespace.
    Treat any unparseable body on a successful response as "no content"
    instead of letting json.JSONDecodeError (not a SpotifyError) escape
    the view's `except SpotifyError` and surface as an unhandled 500."""
    if not resp.content:
        return {}
    try:
        return resp.json()
    except ValueError:
        return {}


def _get(token: str, path: str, params: dict | None = None) -> dict:
    resp = _request("GET", token, path, headers=_headers(token), params=params)
    raise_for_response(resp)
    return _body(resp)


def _post(token: str, path: str, body: dict | None = None, params: dict | None = None) -> dict:
    resp = _request(
        "POST", token, path, headers=_headers(token, json_body=True), json=body, params=params
    )
    raise_for_response(resp)
    return _body(resp)


def _put(token: str, path: str, body: dict | None = None, params: dict | None = None) -> dict:
    resp = _request(
        "PUT", token, path, headers=_headers(token, json_body=True), json=body, params=params
    )
    raise_for_response(resp)
    return _body(resp)


def _delete(token: str, path: str, body: dict | None = None, params: dict | None = None) -> dict:
    resp = _request(
        "DELETE", token, path, headers=_headers(token, json_body=True), json=body, params=params
    )
    raise_for_response(resp)
    return _body(resp)


# --- Profile -----------------------------------------------------------


def get_me(token: str) -> dict:
    return _get(token, "/me")


# --- Search --------------------------------------------------------------

DEFAULT_SEARCH_TYPES = "album,artist,playlist,track"


def search(token: str, query: str, *, types: str = DEFAULT_SEARCH_TYPES, limit: int = 20, offset: int = 0) -> dict:
    return _get(token, "/search", {"q": query, "type": types, "limit": limit, "offset": offset})


# --- Catalog: albums / artists / tracks -----------------------------------


def get_album(token: str, album_id: str) -> dict:
    return _get(token, f"/albums/{album_id}")


def get_album_tracks(token: str, album_id: str, *, limit: int = 50, offset: int = 0) -> dict:
    return _get(token, f"/albums/{album_id}/tracks", {"limit": limit, "offset": offset})


def get_artist(token: str, artist_id: str) -> dict:
    return _get(token, f"/artists/{artist_id}")


def get_artist_albums(token: str, artist_id: str, *, limit: int = 20, offset: int = 0) -> dict:
    return _get(
        token,
        f"/artists/{artist_id}/albums",
        {"include_groups": "album,single", "limit": limit, "offset": offset},
    )


def get_artist_top_tracks(token: str, artist_id: str, *, market: str = "from_token") -> dict:
    return _get(token, f"/artists/{artist_id}/top-tracks", {"market": market})


def get_track(token: str, track_id: str) -> dict:
    return _get(token, f"/tracks/{track_id}")


# --- Library: saved tracks / albums --------------------------------------


def get_saved_tracks(token: str, *, limit: int = 20, offset: int = 0) -> dict:
    return _get(token, "/me/tracks", {"limit": limit, "offset": offset})


def save_tracks(token: str, track_ids: list[str]) -> None:
    _put(token, "/me/tracks", {"ids": track_ids})


def remove_saved_tracks(token: str, track_ids: list[str]) -> None:
    _delete(token, "/me/tracks", {"ids": track_ids})


def check_saved_tracks(token: str, track_ids: list[str]) -> list[bool]:
    return _get(token, "/me/tracks/contains", {"ids": ",".join(track_ids)})


def get_saved_albums(token: str, *, limit: int = 20, offset: int = 0) -> dict:
    return _get(token, "/me/albums", {"limit": limit, "offset": offset})


def save_albums(token: str, album_ids: list[str]) -> None:
    _put(token, "/me/albums", {"ids": album_ids})


def remove_saved_albums(token: str, album_ids: list[str]) -> None:
    _delete(token, "/me/albums", {"ids": album_ids})


# --- Playlists + track CRUD -----------------------------------------------


def get_current_user_playlists(token: str, *, limit: int = 20, offset: int = 0) -> dict:
    return _get(token, "/me/playlists", {"limit": limit, "offset": offset})


def get_playlist(token: str, playlist_id: str) -> dict:
    return _get(token, f"/playlists/{playlist_id}")


def create_playlist(
    token: str, user_id: str, name: str, *, description: str = "", public: bool = False
) -> dict:
    return _post(
        token,
        f"/users/{user_id}/playlists",
        {"name": name, "description": description, "public": public},
    )


def update_playlist_details(
    token: str,
    playlist_id: str,
    *,
    name: str | None = None,
    description: str | None = None,
    public: bool | None = None,
) -> None:
    body = {}
    if name is not None:
        body["name"] = name
    if description is not None:
        body["description"] = description
    if public is not None:
        body["public"] = public
    _put(token, f"/playlists/{playlist_id}", body)


def get_playlist_tracks(token: str, playlist_id: str, *, limit: int = 50, offset: int = 0) -> dict:
    return _get(token, f"/playlists/{playlist_id}/tracks", {"limit": limit, "offset": offset})


def add_playlist_tracks(token: str, playlist_id: str, track_uris: list[str], *, position: int | None = None) -> dict:
    body: dict = {"uris": track_uris}
    if position is not None:
        body["position"] = position
    return _post(token, f"/playlists/{playlist_id}/tracks", body)


def remove_playlist_tracks(token: str, playlist_id: str, track_uris: list[str]) -> dict:
    return _delete(token, f"/playlists/{playlist_id}/tracks", {"tracks": [{"uri": uri} for uri in track_uris]})


def reorder_playlist_tracks(
    token: str, playlist_id: str, range_start: int, insert_before: int, *, range_length: int = 1
) -> dict:
    return _put(
        token,
        f"/playlists/{playlist_id}/tracks",
        {"range_start": range_start, "range_length": range_length, "insert_before": insert_before},
    )


# --- Custom playlist covers ------------------------------------------------

# Spotify caps the custom cover upload at 256KB, base64-encoded JPEG.
MAX_COVER_IMAGE_BYTES = 256 * 1024


def upload_playlist_cover(token: str, playlist_id: str, jpeg_bytes: bytes) -> None:
    if len(jpeg_bytes) > MAX_COVER_IMAGE_BYTES:
        raise SpotifyError(
            f"Cover image must be under {MAX_COVER_IMAGE_BYTES // 1024}KB once encoded.",
            reason="invalid_image",
        )
    b64 = base64.b64encode(jpeg_bytes).decode("ascii")
    try:
        resp = requests.put(
            f"{API_BASE}/playlists/{playlist_id}/images",
            headers={"Authorization": f"Bearer {token}", "Content-Type": "image/jpeg"},
            data=b64,
            timeout=_TIMEOUT,
        )
    except requests.RequestException as exc:
        raise SpotifyError(f"Couldn't reach Spotify: {exc}") from exc
    raise_for_response(resp)


def get_playlist_cover(token: str, playlist_id: str) -> list[dict]:
    return _get(token, f"/playlists/{playlist_id}/images")


# --- Followed artists -------------------------------------------------------


def get_followed_artists(token: str, *, limit: int = 20, after: str | None = None) -> dict:
    params = {"type": "artist", "limit": limit}
    if after:
        params["after"] = after
    return _get(token, "/me/following", params)


def follow_artists(token: str, artist_ids: list[str]) -> None:
    _put(token, "/me/following", {"ids": artist_ids}, {"type": "artist"})


def unfollow_artists(token: str, artist_ids: list[str]) -> None:
    _delete(token, "/me/following", {"ids": artist_ids}, {"type": "artist"})


def check_following_artists(token: str, artist_ids: list[str]) -> list[bool]:
    return _get(token, "/me/following/contains", {"type": "artist", "ids": ",".join(artist_ids)})


# --- Top artists / tracks ---------------------------------------------------

VALID_TIME_RANGES = ("short_term", "medium_term", "long_term")


def get_top_artists(token: str, *, time_range: str = "medium_term", limit: int = 20, offset: int = 0) -> dict:
    return _get(token, "/me/top/artists", {"time_range": time_range, "limit": limit, "offset": offset})


def get_top_tracks(token: str, *, time_range: str = "medium_term", limit: int = 20, offset: int = 0) -> dict:
    return _get(token, "/me/top/tracks", {"time_range": time_range, "limit": limit, "offset": offset})


# --- Playback: state / currently playing ------------------------------------


def get_playback_state(token: str) -> dict:
    return _get(token, "/me/player")


def get_currently_playing(token: str) -> dict:
    return _get(token, "/me/player/currently-playing")


def get_recently_played(token: str, *, limit: int = 20) -> dict:
    return _get(token, "/me/player/recently-played", {"limit": limit})


# --- Playback controls -------------------------------------------------------


def play(
    token: str,
    *,
    device_id: str | None = None,
    context_uri: str | None = None,
    uris: list[str] | None = None,
    offset: dict | None = None,
) -> None:
    """offset starts playback partway into a context_uri (an album/playlist)
    instead of from track 1 — either {"position": N} or {"uri": track_uri}.
    Only meaningful alongside context_uri; Spotify ignores it otherwise."""
    params = {"device_id": device_id} if device_id else None
    body = {}
    if context_uri:
        body["context_uri"] = context_uri
    if uris:
        body["uris"] = uris
    if offset:
        body["offset"] = offset
    _put(token, "/me/player/play", body or None, params)


def pause(token: str, *, device_id: str | None = None) -> None:
    _put(token, "/me/player/pause", None, {"device_id": device_id} if device_id else None)


def next_track(token: str, *, device_id: str | None = None) -> None:
    _post(token, "/me/player/next", None, {"device_id": device_id} if device_id else None)


def previous_track(token: str, *, device_id: str | None = None) -> None:
    _post(token, "/me/player/previous", None, {"device_id": device_id} if device_id else None)


def seek(token: str, position_ms: int, *, device_id: str | None = None) -> None:
    params = {"position_ms": position_ms}
    if device_id:
        params["device_id"] = device_id
    _put(token, "/me/player/seek", None, params)


def set_volume(token: str, volume_percent: int, *, device_id: str | None = None) -> None:
    params = {"volume_percent": max(0, min(100, volume_percent))}
    if device_id:
        params["device_id"] = device_id
    _put(token, "/me/player/volume", None, params)


def set_shuffle(token: str, state: bool, *, device_id: str | None = None) -> None:
    params = {"state": "true" if state else "false"}
    if device_id:
        params["device_id"] = device_id
    _put(token, "/me/player/shuffle", None, params)


def set_repeat(token: str, state: str, *, device_id: str | None = None) -> None:
    """state: 'track' | 'context' | 'off'."""
    params = {"state": state}
    if device_id:
        params["device_id"] = device_id
    _put(token, "/me/player/repeat", None, params)


# --- Devices ------------------------------------------------------------


def get_devices(token: str) -> dict:
    return _get(token, "/me/player/devices")


def transfer_playback(token: str, device_id: str, *, play: bool = False) -> None:
    _put(token, "/me/player", {"device_ids": [device_id], "play": play})


# --- Queue ----------------------------------------------------------------


def get_queue(token: str) -> dict:
    return _get(token, "/me/player/queue")


def add_to_queue(token: str, track_uri: str, *, device_id: str | None = None) -> None:
    params = {"uri": track_uri}
    if device_id:
        params["device_id"] = device_id
    _post(token, "/me/player/queue", None, params)
