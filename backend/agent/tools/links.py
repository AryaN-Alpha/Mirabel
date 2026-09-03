"""Tool-name -> "where to go check it" link lookup, so a finished AgentTask
can point the user straight at the page/entity a write-tool touched instead
of leaving them to find it manually. Deliberately separate from the LLM's
own {"text": str, "mood": str} output contract (CLAUDE.md hard rule #3) —
every link here is computed purely from the tool's own returned result, never
from model text, so there's no hallucination risk.

Only tools that write something real AND have an actual destination page get
an entry — in practice, the same set gated by
agent/tools/_common.py::require_confirmation, plus a couple of un-gated but
still-a-write tools (schedule_outlook_email, the kanban writes). Extend this
table the same way agent/tasks.py's _STEP_DESCRIPTIONS is extended: add a new
tool name and resolver when a new write-tool has somewhere real to send the
user. See docs/EXTENDING.md §2.4.
"""

from __future__ import annotations

import json
from typing import Callable

_Resolver = Callable[[dict], "dict | None"]


def _spotify_playlist_created(result: dict) -> dict | None:
    if not result.get("created") or not result.get("url"):
        return None
    return {"label": "Open playlist on Spotify", "url": result["url"]}


def _spotify_playlists_page(flag: str) -> _Resolver:
    def resolve(result: dict) -> dict | None:
        if not result.get(flag):
            return None
        return {"label": "View your Spotify playlists", "path": "/home/spotify/playlists"}

    return resolve


def _spotify_library_page(flag: str) -> _Resolver:
    def resolve(result: dict) -> dict | None:
        if not result.get(flag):
            return None
        return {"label": "View your Spotify library", "path": "/home/spotify/library"}

    return resolve


def _spotify_artists_page(flag: str) -> _Resolver:
    def resolve(result: dict) -> dict | None:
        if not result.get(flag):
            return None
        return {"label": "View followed artists", "path": "/home/spotify/artists"}

    return resolve


def _linkedin_draft_created(result: dict) -> dict | None:
    if not result.get("id"):
        return None
    return {"label": "View LinkedIn drafts", "path": "/home/linkedin/drafts"}


def _linkedin_post_published(result: dict) -> dict | None:
    if not result.get("published") or not result.get("post_urn"):
        return None
    return {"label": "View post on LinkedIn", "url": f"https://www.linkedin.com/feed/update/{result['post_urn']}/"}


def _linkedin_comment_posted(result: dict) -> dict | None:
    if not result.get("posted"):
        return None
    return {"label": "View on LinkedIn", "path": "/home/linkedin/overview"}


def _outlook_reply_sent(result: dict) -> dict | None:
    if not result.get("sent"):
        return None
    return {"label": "View your Outlook inbox", "path": "/home/outlook/inbox"}


def _outlook_email_scheduled(result: dict) -> dict | None:
    if not result.get("id"):
        return None
    return {"label": "View scheduled emails", "path": "/home/outlook/scheduled"}


def _classroom_assignment_turned_in(result: dict) -> dict | None:
    if not result.get("turned_in"):
        return None
    return {"label": "View Classroom assignments", "path": "/home/classroom/assignments"}


def _kanban_board(result: dict) -> dict | None:
    if not result.get("id") and not result.get("created"):
        return None
    return {"label": "View Kanban board", "path": "/home/tasks"}


_RESOLVERS: dict[str, _Resolver] = {
    "create_spotify_playlist": _spotify_playlist_created,
    "update_spotify_playlist_details": _spotify_playlists_page("updated"),
    "add_tracks_to_spotify_playlist": _spotify_playlists_page("added"),
    "remove_tracks_from_spotify_playlist": _spotify_playlists_page("removed"),
    "save_spotify_tracks": _spotify_library_page("saved"),
    "remove_spotify_saved_tracks": _spotify_library_page("removed"),
    "follow_spotify_artists": _spotify_artists_page("followed"),
    "unfollow_spotify_artists": _spotify_artists_page("unfollowed"),
    "create_linkedin_draft": _linkedin_draft_created,
    "publish_linkedin_draft": _linkedin_post_published,
    "post_linkedin_comment": _linkedin_comment_posted,
    "reply_outlook_message_now": _outlook_reply_sent,
    "schedule_outlook_email": _outlook_email_scheduled,
    "turn_in_classroom_assignment": _classroom_assignment_turned_in,
    "create_kanban_task": _kanban_board,
    "update_kanban_task": _kanban_board,
    "braindump_to_kanban_tasks": _kanban_board,
}


def resolve_result_link(tool_name: str, message_text: str) -> dict | None:
    """Best-effort: a finished tool call -> {"label", "path"|"url"} or None.

    Never raises — this runs on the hot path of every tool-call step
    (agent/tasks.py::_record_step), so a malformed/unexpected result must
    fail open to "no link" rather than break step recording, matching this
    codebase's fail-open convention for every optimization/enrichment layer.
    """
    resolver = _RESOLVERS.get(tool_name)
    if resolver is None:
        return None
    try:
        result = json.loads(message_text)
    except (TypeError, ValueError):
        return None
    if not isinstance(result, dict):
        return None
    try:
        return resolver(result)
    except Exception:
        return None
