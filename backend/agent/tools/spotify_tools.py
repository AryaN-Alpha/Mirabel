"""Spotify tools. Search, catalog/library reads, playlist/queue/history reads,
and playback transport controls (play/pause/skip/seek/volume/shuffle/repeat/
transfer/queue-add) are safe and low-stakes — they either only read, or are
trivially reversible (pause again, skip back, seek again, set volume again),
so they run without confirmation, the same way check_outlook_connection and
list_outlook_inbox do.

Creating/renaming a playlist, adding/removing/reordering its tracks,
saving/removing library tracks, and following/unfollowing artists are
different: they write a persistent, externally-visible change to the user's
real Spotify account (spec section 48 — AI playlist generation must not
create playlists or modify existing ones without explicit confirmation, and
the same reasoning extends to every other persistent account write here), so
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
_MAX_IDS_PER_REQUEST = 50


def _track_dict(t: dict) -> dict:
    return {
        "id": t.get("id"),
        "uri": t.get("uri"),
        "name": t.get("name"),
        "artists": ", ".join(a["name"] for a in t.get("artists", [])),
    }


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
def get_spotify_album(album_id: str) -> dict:
    """Get a Spotify album's details and full track listing.

    Args:
        album_id: The album's Spotify id (see search_spotify's "album" results).
    """
    try:
        token = get_active_access_token()
        album = client.get_album(token, album_id)
    except SpotifyError as exc:
        return {"error": str(exc)}
    return {
        "id": album.get("id"),
        "uri": album.get("uri"),
        "name": album.get("name"),
        "artists": ", ".join(a["name"] for a in album.get("artists", [])),
        "release_date": album.get("release_date"),
        "tracks": [_track_dict(t) for t in (album.get("tracks") or {}).get("items", [])],
    }


@tool
def get_spotify_artist(artist_id: str) -> dict:
    """Get a Spotify artist's details, top tracks, and albums.

    Args:
        artist_id: The artist's Spotify id (see search_spotify's "artist" results).
    """
    try:
        token = get_active_access_token()
        artist = client.get_artist(token, artist_id)
        top_tracks = client.get_artist_top_tracks(token, artist_id)
        albums = client.get_artist_albums(token, artist_id)
    except SpotifyError as exc:
        return {"error": str(exc)}
    return {
        "id": artist.get("id"),
        "uri": artist.get("uri"),
        "name": artist.get("name"),
        "genres": artist.get("genres", []),
        "followers": (artist.get("followers") or {}).get("total"),
        "top_tracks": [_track_dict(t) for t in top_tracks.get("tracks", [])],
        "albums": [{"id": a.get("id"), "uri": a.get("uri"), "name": a.get("name")} for a in albums.get("items", [])],
    }


@tool
def get_spotify_track(track_id: str) -> dict:
    """Get a single Spotify track's details.

    Args:
        track_id: The track's Spotify id (see search_spotify's "track" results).
    """
    try:
        token = get_active_access_token()
        track = client.get_track(token, track_id)
    except SpotifyError as exc:
        return {"error": str(exc)}
    return {
        **_track_dict(track),
        "album": (track.get("album") or {}).get("name"),
        "duration_ms": track.get("duration_ms"),
    }


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
def get_spotify_playlist_tracks(playlist_id: str, limit: int = 50) -> dict:
    """Get the tracks in a specific Spotify playlist.

    Args:
        playlist_id: The playlist's Spotify id (see get_spotify_playlists).
        limit: Max tracks to return (default 50, max 100).
    """
    try:
        token = get_active_access_token()
        result = client.get_playlist_tracks(token, playlist_id, limit=min(limit, 100))
    except SpotifyError as exc:
        return {"error": str(exc)}
    tracks = [_track_dict(t["track"]) for t in result.get("items", []) if t.get("track")]
    compact = encode_compact_list(tracks)
    return {"tracks": compact if compact is not None else tracks}


@tool
def get_spotify_saved_tracks(limit: int = 20) -> dict:
    """List tracks saved to the connected user's Spotify library ("Liked Songs").

    Args:
        limit: Max items to return (default 20, max 50).
    """
    try:
        token = get_active_access_token()
        result = client.get_saved_tracks(token, limit=min(limit, 50))
    except SpotifyError as exc:
        return {"error": str(exc)}
    tracks = [_track_dict(i["track"]) for i in result.get("items", []) if i.get("track")]
    compact = encode_compact_list(tracks)
    return {"tracks": compact if compact is not None else tracks}


@tool
def get_spotify_followed_artists(limit: int = 20) -> dict:
    """List artists the connected user follows on Spotify.

    Args:
        limit: Max items to return (default 20, max 50).
    """
    try:
        token = get_active_access_token()
        result = client.get_followed_artists(token, limit=min(limit, 50))
    except SpotifyError as exc:
        return {"error": str(exc)}
    artists = [{"id": a.get("id"), "name": a.get("name")} for a in (result.get("artists") or {}).get("items", [])]
    compact = encode_compact_list(artists)
    return {"artists": compact if compact is not None else artists}


@tool
def get_spotify_recently_played(limit: int = 20) -> dict:
    """Get the connected user's recently played tracks, most recent first.

    Args:
        limit: Max items to return (default 20, max 50).
    """
    try:
        token = get_active_access_token()
        result = client.get_recently_played(token, limit=min(limit, 50))
    except SpotifyError as exc:
        return {"error": str(exc)}
    items = [
        {**_track_dict(i["track"]), "played_at": i.get("played_at")}
        for i in result.get("items", [])
        if i.get("track")
    ]
    compact = encode_compact_list(items)
    return {"items": compact if compact is not None else items}


@tool
def get_spotify_currently_playing() -> dict:
    """Get what's currently playing on the connected Spotify account, if anything. For
    device/shuffle/repeat state too (e.g. before toggling shuffle), use
    get_spotify_playback_state instead."""
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
def get_spotify_playback_state() -> dict:
    """Get the full current playback state — active device, volume, shuffle/repeat mode,
    and what's playing. Use get_spotify_currently_playing for a quick "what's playing"
    check; use this before changing shuffle/repeat/volume so you know the current
    setting first."""
    try:
        token = get_active_access_token()
        state = client.get_playback_state(token)
    except SpotifyError as exc:
        return {"error": str(exc)}
    if not state:
        return {"is_playing": False}
    device = state.get("device") or {}
    item = state.get("item") or {}
    return {
        "is_playing": state.get("is_playing", False),
        "shuffle": state.get("shuffle_state", False),
        "repeat": state.get("repeat_state", "off"),
        "device": {
            "id": device.get("id"),
            "name": device.get("name"),
            "volume_percent": device.get("volume_percent"),
        },
        "track": item.get("name"),
        "artists": [a["name"] for a in item.get("artists", [])],
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
def get_spotify_queue() -> dict:
    """Get what's currently playing and what's coming up next in the playback queue."""
    try:
        token = get_active_access_token()
        result = client.get_queue(token)
    except SpotifyError as exc:
        return {"error": str(exc)}
    currently = result.get("currently_playing") or {}
    queue = [_track_dict(t) for t in result.get("queue", [])]
    compact = encode_compact_list(queue)
    return {"currently_playing": currently.get("name"), "queue": compact if compact is not None else queue}


@tool
def control_spotify_playback(action: str, device_id: str = "") -> dict:
    """Control Spotify playback transport. Trivially reversible (pause again, skip back), so this
    does not require confirmation. To start playing a specific track/playlist/album instead of
    resuming whatever was last playing, use play_spotify_item.

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
def play_spotify_item(track_uris: list[str] | None = None, context_uri: str = "", device_id: str = "") -> dict:
    """Start playing specific track(s), or a whole playlist/album/artist context, replacing
    whatever is currently playing. Use this (not control_spotify_playback) to actually play a
    search result. Trivially reversible (pause/skip), so this does not require confirmation.

    Args:
        track_uris: Specific track URIs to play, in order (from search_spotify's "uri" field).
            Omit if using context_uri instead.
        context_uri: A playlist/album/artist URI to play as a whole (from search_spotify's
            "uri" field). Omit if using track_uris instead.
        device_id: Optional target device id; uses the active device if omitted.
    """
    if not track_uris and not context_uri:
        return {"error": "Provide either track_uris or context_uri."}
    try:
        token = get_active_access_token()
        client.play(token, device_id=device_id or None, uris=track_uris or None, context_uri=context_uri or None)
    except SpotifyError as exc:
        return {"ok": False, "error": str(exc)}
    return {"ok": True}


@tool
def seek_spotify_playback(position_ms: int, device_id: str = "") -> dict:
    """Seek to a position in the currently playing track. Trivially reversible (seek again),
    so this does not require confirmation.

    Args:
        position_ms: Position to seek to, in milliseconds.
        device_id: Optional target device id; uses the active device if omitted.
    """
    try:
        token = get_active_access_token()
        client.seek(token, position_ms, device_id=device_id or None)
    except SpotifyError as exc:
        return {"ok": False, "error": str(exc)}
    return {"ok": True}


@tool
def set_spotify_volume(volume_percent: int, device_id: str = "") -> dict:
    """Set playback volume. Trivially reversible (set it again), so this does not require
    confirmation.

    Args:
        volume_percent: Target volume, 0-100.
        device_id: Optional target device id; uses the active device if omitted.
    """
    try:
        token = get_active_access_token()
        client.set_volume(token, volume_percent, device_id=device_id or None)
    except SpotifyError as exc:
        return {"ok": False, "error": str(exc)}
    return {"ok": True}


@tool
def set_spotify_shuffle(enabled: bool, device_id: str = "") -> dict:
    """Turn shuffle on or off. Trivially reversible, so this does not require confirmation.

    Args:
        enabled: True to enable shuffle, False to disable.
        device_id: Optional target device id; uses the active device if omitted.
    """
    try:
        token = get_active_access_token()
        client.set_shuffle(token, enabled, device_id=device_id or None)
    except SpotifyError as exc:
        return {"ok": False, "error": str(exc)}
    return {"ok": True}


@tool
def set_spotify_repeat(mode: str, device_id: str = "") -> dict:
    """Set repeat mode. Trivially reversible, so this does not require confirmation.

    Args:
        mode: One of "track", "context" (repeat the current playlist/album), or "off".
        device_id: Optional target device id; uses the active device if omitted.
    """
    if mode not in ("track", "context", "off"):
        return {"error": "mode must be track, context, or off"}
    try:
        token = get_active_access_token()
        client.set_repeat(token, mode, device_id=device_id or None)
    except SpotifyError as exc:
        return {"ok": False, "error": str(exc)}
    return {"ok": True}


@tool
def transfer_spotify_playback(device_id: str, start_playing: bool = False) -> dict:
    """Transfer playback to a different device. Trivially reversible (transfer back), so this
    does not require confirmation.

    Args:
        device_id: Target device id (see get_spotify_devices).
        start_playing: Whether to start playback immediately on the new device.
    """
    try:
        token = get_active_access_token()
        client.transfer_playback(token, device_id, play=start_playing)
    except SpotifyError as exc:
        return {"ok": False, "error": str(exc)}
    return {"ok": True}


@tool
def add_to_spotify_queue(track_uri: str, device_id: str = "") -> dict:
    """Add a track to the end of the playback queue. Trivially reversible (skip past it), so
    this does not require confirmation.

    Args:
        track_uri: The Spotify track URI to queue (from search_spotify's "uri" field).
        device_id: Optional target device id; uses the active device if omitted.
    """
    try:
        token = get_active_access_token()
        client.add_to_queue(token, track_uri, device_id=device_id or None)
    except SpotifyError as exc:
        return {"ok": False, "error": str(exc)}
    return {"ok": True}


@tool
def save_spotify_tracks(track_ids: list[str]) -> dict:
    """Save tracks to the connected user's Spotify library ("Liked Songs"). Writes a
    persistent, externally-visible change to the real account — calling this pauses the run
    to ask the human for approval first.

    Args:
        track_ids: Spotify track ids to save (from search_spotify's "id" field), max 50.
    """
    track_ids = track_ids[:_MAX_IDS_PER_REQUEST]
    summary = f"Save {len(track_ids)} track(s) to your Spotify library"
    args = {"track_ids": track_ids}
    decision = require_confirmation(tool="save_spotify_tracks", summary=summary, args=args)
    if not decision["approved"]:
        return {"saved": False, "message": rejected_message(summary)}
    final_args = decision.get("args") or args

    try:
        token = get_active_access_token()
        client.save_tracks(token, final_args["track_ids"])
    except SpotifyError as exc:
        return {"saved": False, "error": str(exc)}
    return {"saved": True}


@tool
def remove_spotify_saved_tracks(track_ids: list[str]) -> dict:
    """Remove tracks from the connected user's Spotify library ("Liked Songs"). Writes a
    persistent, externally-visible change to the real account — calling this pauses the run
    to ask the human for approval first.

    Args:
        track_ids: Spotify track ids to remove, max 50.
    """
    track_ids = track_ids[:_MAX_IDS_PER_REQUEST]
    summary = f"Remove {len(track_ids)} track(s) from your Spotify library"
    args = {"track_ids": track_ids}
    decision = require_confirmation(tool="remove_spotify_saved_tracks", summary=summary, args=args)
    if not decision["approved"]:
        return {"removed": False, "message": rejected_message(summary)}
    final_args = decision.get("args") or args

    try:
        token = get_active_access_token()
        client.remove_saved_tracks(token, final_args["track_ids"])
    except SpotifyError as exc:
        return {"removed": False, "error": str(exc)}
    return {"removed": True}


@tool
def follow_spotify_artists(artist_ids: list[str]) -> dict:
    """Follow artists on Spotify. Writes a persistent, externally-visible change to the real
    account — calling this pauses the run to ask the human for approval first.

    Args:
        artist_ids: Spotify artist ids to follow (from search_spotify's "id" field), max 50.
    """
    artist_ids = artist_ids[:_MAX_IDS_PER_REQUEST]
    summary = f"Follow {len(artist_ids)} artist(s) on Spotify"
    args = {"artist_ids": artist_ids}
    decision = require_confirmation(tool="follow_spotify_artists", summary=summary, args=args)
    if not decision["approved"]:
        return {"followed": False, "message": rejected_message(summary)}
    final_args = decision.get("args") or args

    try:
        token = get_active_access_token()
        client.follow_artists(token, final_args["artist_ids"])
    except SpotifyError as exc:
        return {"followed": False, "error": str(exc)}
    return {"followed": True}


@tool
def unfollow_spotify_artists(artist_ids: list[str]) -> dict:
    """Unfollow artists on Spotify. Writes a persistent, externally-visible change to the real
    account — calling this pauses the run to ask the human for approval first.

    Args:
        artist_ids: Spotify artist ids to unfollow, max 50.
    """
    artist_ids = artist_ids[:_MAX_IDS_PER_REQUEST]
    summary = f"Unfollow {len(artist_ids)} artist(s) on Spotify"
    args = {"artist_ids": artist_ids}
    decision = require_confirmation(tool="unfollow_spotify_artists", summary=summary, args=args)
    if not decision["approved"]:
        return {"unfollowed": False, "message": rejected_message(summary)}
    final_args = decision.get("args") or args

    try:
        token = get_active_access_token()
        client.unfollow_artists(token, final_args["artist_ids"])
    except SpotifyError as exc:
        return {"unfollowed": False, "error": str(exc)}
    return {"unfollowed": True}


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
def update_spotify_playlist_details(
    playlist_id: str, name: str = "", description: str = "", public: bool | None = None
) -> dict:
    """Rename a playlist, change its description, and/or change its public/private visibility.
    Writes a persistent, externally-visible change to a real playlist — calling this pauses the
    run to ask the human for approval first.

    Args:
        playlist_id: The target playlist's Spotify id (see get_spotify_playlists).
        name: New name, or empty to leave unchanged.
        description: New description, or empty to leave unchanged.
        public: New public/private visibility, or omit to leave unchanged.
    """
    summary = f"Update Spotify playlist {playlist_id}'s details"
    args = {"playlist_id": playlist_id, "name": name, "description": description, "public": public}
    decision = require_confirmation(tool="update_spotify_playlist_details", summary=summary, args=args)
    if not decision["approved"]:
        return {"updated": False, "message": rejected_message(summary)}
    final_args = decision.get("args") or args

    try:
        token = get_active_access_token()
        client.update_playlist_details(
            token,
            final_args["playlist_id"],
            name=final_args.get("name") or None,
            description=final_args.get("description") or None,
            public=final_args.get("public"),
        )
    except SpotifyError as exc:
        return {"updated": False, "error": str(exc)}
    return {"updated": True}


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
    get_spotify_album,
    get_spotify_artist,
    get_spotify_track,
    get_spotify_top_items,
    get_spotify_playlists,
    get_spotify_playlist_tracks,
    get_spotify_saved_tracks,
    get_spotify_followed_artists,
    get_spotify_recently_played,
    get_spotify_currently_playing,
    get_spotify_playback_state,
    get_spotify_devices,
    get_spotify_queue,
    control_spotify_playback,
    play_spotify_item,
    seek_spotify_playback,
    set_spotify_volume,
    set_spotify_shuffle,
    set_spotify_repeat,
    transfer_spotify_playback,
    add_to_spotify_queue,
    save_spotify_tracks,
    remove_spotify_saved_tracks,
    follow_spotify_artists,
    unfollow_spotify_artists,
    create_spotify_playlist,
    update_spotify_playlist_details,
    add_tracks_to_spotify_playlist,
    remove_tracks_from_spotify_playlist,
]
