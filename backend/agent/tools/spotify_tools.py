"""Spotify tools. Search, reading playlists/top items/currently-playing, and
playback transport controls (play/pause/skip) are safe and low-stakes — they
either only read, or are trivially reversible (pause again, skip back) — so
they run without confirmation, the same way check_outlook_connection and
list_outlook_inbox do.

Creating a playlist, adding tracks to one, or removing tracks from one are
different: they write a persistent, externally-visible change to the user's
real Spotify account (spec section 48 — AI playlist generation must not
create playlists or modify existing ones without explicit confirmation), so
each pauses the run for human approval first, mirroring
send_outlook_email_now / reply_outlook_message_now exactly.

This is the backbone of the AI Playlist Generator (spec section 25): the
agent turns a free-form prompt into search queries via search_spotify,
picks tracks from the results, then calls create_spotify_playlist — no
separate bespoke AI pipeline, per CLAUDE.md's "integrate with existing
AI/agent architecture" instruction. It does NOT use Spotify's
/recommendations endpoint (restricted to apps with pre-existing extended
access since Nov 2024 — see spotify/services/client.py's module docstring).
"""

from __future__ import annotations

from langchain_core.tools import tool

from agent.tools._common import rejected_message, require_confirmation
from core.services.text_utils import encode_compact_list
from spotify.models import SpotifyCredential
from spotify.services import client
from spotify.services.oauth import SpotifyError, get_active_access_token

# Spotify's actual cap on /playlists/{id}/tracks add/remove is 100 URIs per
# call (distinct from the 50-id cap on /me/tracks, /me/albums, /me/following
# — see spotify/views.py::MAX_IDS_PER_REQUEST for that one).
_MAX_TRACKS_PER_PLAYLIST_OP = 100


@tool
def check_spotify_connection() -> dict:
    """Check whether a Spotify account is connected. Call this first if you're unsure —
    every other Spotify tool will fail if not connected."""
    cred = SpotifyCredential.current()
    return {"connected": cred.is_connected, "display_name": cred.display_name, "is_premium": cred.is_premium}


@tool
def search_spotify(query: str, types: str = "track,artist,album", limit: int = 10) -> dict:
    """Search Spotify's catalog for tracks, artists, albums, and/or playlists.

    Args:
        query: Free-text search, e.g. "energetic pop workout" or an artist/track name.
        types: Comma-separated subset of track,artist,album,playlist (default "track,artist,album").
        limit: Max results per type (default 10, max 50).
    """
    try:
        token = get_active_access_token()
        results = client.search(token, query, types=types, limit=min(limit, 50))
    except SpotifyError as exc:
        return {"error": str(exc)}
    out = {}
    for key, block in results.items():
        items = [
            {"id": item.get("id"), "uri": item.get("uri"), "name": item.get("name")}
            | ({"artists": ", ".join(a["name"] for a in item.get("artists", []))} if "artists" in item else {})
            for item in block.get("items", [])
            if item
        ]
        # encode_compact_list needs uniform string/scalar values per column
        # (it writes each item.get(k) through str()) — artists is joined into
        # one string above rather than left as a list so the compact CSV-ish
        # encoding doesn't mangle it. No-ops back to the plain list below
        # _MIN_ITEMS_FOR_COMPACT_FORMAT (5 items), e.g. most artist/playlist
        # result sets, so the shape callers see doesn't change for those.
        compact = encode_compact_list(items)
        out[key] = compact if compact is not None else items
    return out


@tool
def get_spotify_top_items(item_type: str = "tracks", time_range: str = "medium_term", limit: int = 10) -> dict:
    """Get the connected user's top tracks or artists.

    Args:
        item_type: "tracks" or "artists".
        time_range: "short_term" (~4 weeks), "medium_term" (~6 months), or "long_term" (years).
        limit: Max items to return (default 10, max 50).
    """
    if time_range not in client.VALID_TIME_RANGES:
        return {"error": "time_range must be short_term, medium_term, or long_term"}
    try:
        token = get_active_access_token()
        if item_type == "artists":
            result = client.get_top_artists(token, time_range=time_range, limit=min(limit, 50))
        else:
            result = client.get_top_tracks(token, time_range=time_range, limit=min(limit, 50))
    except SpotifyError as exc:
        return {"error": str(exc)}
    items = [{"id": i.get("id"), "uri": i.get("uri"), "name": i.get("name")} for i in result.get("items", [])]
    compact = encode_compact_list(items)
    return {"items": compact if compact is not None else items}


@tool
def get_spotify_playlists() -> dict:
    """List the connected user's Spotify playlists (id, name, track count)."""
    try:
        token = get_active_access_token()
        result = client.get_current_user_playlists(token, limit=50)
    except SpotifyError as exc:
        return {"error": str(exc)}
    playlists = [
        {"id": p.get("id"), "name": p.get("name"), "track_count": (p.get("tracks") or {}).get("total", 0)}
        for p in result.get("items", [])
    ]
    compact = encode_compact_list(playlists)
    return {"playlists": compact if compact is not None else playlists}


@tool
def get_spotify_currently_playing() -> dict:
    """Get what's currently playing on the connected Spotify account, if anything."""
    try:
        token = get_active_access_token()
        current = client.get_currently_playing(token)
    except SpotifyError as exc:
        return {"error": str(exc)}
    if not current or not current.get("item"):
        return {"is_playing": False}
    item = current["item"]
    return {
        "is_playing": current.get("is_playing", False),
        "track": item.get("name"),
        "artists": [a["name"] for a in item.get("artists", [])],
        "progress_ms": current.get("progress_ms"),
        "duration_ms": item.get("duration_ms"),
    }


@tool
def get_spotify_devices() -> dict:
    """List devices currently available for Spotify playback (needed before controlling playback
    if it's unclear whether any device is active)."""
    try:
        token = get_active_access_token()
        result = client.get_devices(token)
    except SpotifyError as exc:
        return {"error": str(exc)}
    return {
        "devices": [
            {"id": d.get("id"), "name": d.get("name"), "type": d.get("type"), "is_active": d.get("is_active")}
            for d in result.get("devices", [])
        ]
    }


@tool
def control_spotify_playback(action: str, device_id: str = "") -> dict:
    """Control Spotify playback transport. Trivially reversible (pause again, skip back), so this
    does not require confirmation.

    Args:
        action: One of "play", "pause", "next", "previous".
        device_id: Optional target device id (see get_spotify_devices); uses the active device if omitted.
    """
    if action not in ("play", "pause", "next", "previous"):
        return {"error": "action must be play, pause, next, or previous"}
    try:
        token = get_active_access_token()
        did = device_id or None
        if action == "play":
            client.play(token, device_id=did)
        elif action == "pause":
            client.pause(token, device_id=did)
        elif action == "next":
            client.next_track(token, device_id=did)
        else:
            client.previous_track(token, device_id=did)
    except SpotifyError as exc:
        return {"ok": False, "error": str(exc)}
    return {"ok": True}


@tool
def create_spotify_playlist(name: str, description: str, track_uris: list[str]) -> dict:
    """Create a new Spotify playlist in the connected user's account, optionally seeded with
    tracks. This is the core action behind AI playlist generation. IRREVERSIBLE-ish (it's a real,
    visible playlist in the user's account) — calling this pauses the run to ask the human for
    approval first. If they reject it, nothing is created; say so plainly, don't retry.

    Args:
        name: Playlist name.
        description: Playlist description (can be empty).
        track_uris: Spotify track URIs to add (from search_spotify's "uri" field), max 50.
    """
    track_uris = track_uris[:_MAX_TRACKS_PER_PLAYLIST_OP]
    summary = f'Create Spotify playlist "{name}" with {len(track_uris)} track(s)'
    args = {"name": name, "description": description, "track_uris": track_uris}
    decision = require_confirmation(tool="create_spotify_playlist", summary=summary, args=args)
    if not decision["approved"]:
        return {"created": False, "message": rejected_message(summary)}
    final_args = decision.get("args") or args

    try:
        token = get_active_access_token()
        cred = SpotifyCredential.current()
        playlist = client.create_playlist(
            token, cred.spotify_user_id, final_args["name"], description=final_args.get("description", "")
        )
        if final_args.get("track_uris"):
            client.add_playlist_tracks(token, playlist["id"], final_args["track_uris"])
    except SpotifyError as exc:
        return {"created": False, "error": str(exc)}
    return {"created": True, "playlist_id": playlist.get("id"), "url": (playlist.get("external_urls") or {}).get("spotify")}


@tool
def add_tracks_to_spotify_playlist(playlist_id: str, track_uris: list[str]) -> dict:
    """Add tracks to an existing Spotify playlist. IRREVERSIBLE-ish (modifies a real playlist) —
    calling this pauses the run to ask the human for approval first.

    Args:
        playlist_id: The target playlist's Spotify id (see get_spotify_playlists).
        track_uris: Spotify track URIs to add (from search_spotify's "uri" field), max 50.
    """
    track_uris = track_uris[:_MAX_TRACKS_PER_PLAYLIST_OP]
    summary = f"Add {len(track_uris)} track(s) to Spotify playlist {playlist_id}"
    args = {"playlist_id": playlist_id, "track_uris": track_uris}
    decision = require_confirmation(tool="add_tracks_to_spotify_playlist", summary=summary, args=args)
    if not decision["approved"]:
        return {"added": False, "message": rejected_message(summary)}
    final_args = decision.get("args") or args

    try:
        token = get_active_access_token()
        client.add_playlist_tracks(token, final_args["playlist_id"], final_args["track_uris"])
    except SpotifyError as exc:
        return {"added": False, "error": str(exc)}
    return {"added": True}


@tool
def remove_tracks_from_spotify_playlist(playlist_id: str, track_uris: list[str]) -> dict:
    """Remove tracks from an existing Spotify playlist. IRREVERSIBLE-ish (modifies a real
    playlist) — calling this pauses the run to ask the human for approval first.

    Args:
        playlist_id: The target playlist's Spotify id (see get_spotify_playlists).
        track_uris: Spotify track URIs to remove, max 50.
    """
    track_uris = track_uris[:_MAX_TRACKS_PER_PLAYLIST_OP]
    summary = f"Remove {len(track_uris)} track(s) from Spotify playlist {playlist_id}"
    args = {"playlist_id": playlist_id, "track_uris": track_uris}
    decision = require_confirmation(tool="remove_tracks_from_spotify_playlist", summary=summary, args=args)
    if not decision["approved"]:
        return {"removed": False, "message": rejected_message(summary)}
    final_args = decision.get("args") or args

    try:
        token = get_active_access_token()
        client.remove_playlist_tracks(token, final_args["playlist_id"], final_args["track_uris"])
    except SpotifyError as exc:
        return {"removed": False, "error": str(exc)}
    return {"removed": True}


TOOLS = [
    check_spotify_connection,
    search_spotify,
    get_spotify_top_items,
    get_spotify_playlists,
    get_spotify_currently_playing,
    get_spotify_devices,
    control_spotify_playback,
    create_spotify_playlist,
    add_tracks_to_spotify_playlist,
    remove_tracks_from_spotify_playlist,
]
