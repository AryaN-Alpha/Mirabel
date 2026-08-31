import secrets

from django.conf import settings
from django.http import HttpRequest, HttpResponse, HttpResponseRedirect
from rest_framework.decorators import api_view
from rest_framework.request import Request
from rest_framework.response import Response

from spotify.models import SpotifyCredential
from spotify.services import client, statistics
from spotify.services.oauth import SpotifyError, exchange_code_for_token, get_active_access_token
from spotify.services import oauth as oauth_service

SESSION_STATE_KEY = "spotify_oauth_state"
# Spotify's own per-call caps differ by endpoint: /me/tracks, /me/albums,
# and /me/following all cap at 50 ids; /playlists/{id}/tracks add/remove
# caps at 100 URIs. Two constants rather than one blanket one, so neither
# endpoint is silently under- or over-capped relative to the real API.
MAX_IDS_PER_REQUEST = 50
MAX_PLAYLIST_TRACK_URIS_PER_REQUEST = 100

# Coarse SpotifyError.reason -> HTTP status, so every endpoint maps errors the
# same way instead of each view guessing (spec section 35).
_REASON_STATUS = {
    "unconfigured": 400,
    "not_connected": 400,
    "token_expired": 401,
    "insufficient_scope": 403,
    "no_active_device": 404,
    "not_found": 404,
    "premium_required": 403,
    "rate_limited": 429,
    "unavailable": 502,
    "invalid_image": 400,
    "unknown": 400,
}


def _error_response(exc: SpotifyError) -> Response:
    status = _REASON_STATUS.get(exc.reason, 400)
    body = {"error": str(exc), "reason": exc.reason}
    resp = Response(body, status=status)
    if exc.retry_after is not None:
        resp["Retry-After"] = str(exc.retry_after)
    return resp


def _ids_param(request: Request) -> list[str]:
    """Every call site only reaches this after already handling GET
    separately (see library_tracks/library_albums/following_artists below),
    so this only ever needs to read the PUT/DELETE JSON body."""
    raw = request.data.get("ids")
    if isinstance(raw, list):
        ids = raw
    elif isinstance(raw, str):
        ids = [i for i in raw.split(",") if i]
    else:
        ids = []
    return ids[:MAX_IDS_PER_REQUEST]


# --- OAuth -------------------------------------------------------------


def auth_start(request: HttpRequest) -> HttpResponse:
    state = secrets.token_urlsafe(24)
    request.session[SESSION_STATE_KEY] = state
    try:
        url = oauth_service.get_auth_url(state)
    except SpotifyError as exc:
        return HttpResponseRedirect(f"{settings.FRONTEND_URL}/home/spotify?error={exc}")
    return HttpResponseRedirect(url)


def auth_callback(request: HttpRequest) -> HttpResponse:
    expected_state = request.session.pop(SESSION_STATE_KEY, None)
    got_state = request.GET.get("state")
    if not expected_state or expected_state != got_state:
        return HttpResponseRedirect(f"{settings.FRONTEND_URL}/home/spotify?error=Invalid+OAuth+state")

    error = request.GET.get("error")
    if error:
        return HttpResponseRedirect(f"{settings.FRONTEND_URL}/home/spotify?error={error}")

    code = request.GET.get("code")
    if not code:
        return HttpResponseRedirect(f"{settings.FRONTEND_URL}/home/spotify?error=No+authorization+code+returned")

    try:
        result = exchange_code_for_token(code)
        cred = SpotifyCredential.current()
        oauth_service.save_token_result(cred, result)
        me = client.get_me(cred.get_access_token())
        oauth_service.save_profile(cred, me)
        cred.save()
    except SpotifyError as exc:
        return HttpResponseRedirect(f"{settings.FRONTEND_URL}/home/spotify?error={exc}")

    return HttpResponseRedirect(f"{settings.FRONTEND_URL}/home/spotify?connected=1")


@api_view(["GET"])
def status(_request: Request) -> Response:
    cred = SpotifyCredential.current()
    return Response(
        {
            "connected": cred.is_connected,
            "display_name": cred.display_name,
            "email": cred.email,
            "product": cred.product,
            "is_premium": cred.is_premium,
            "image_url": cred.image_url,
        }
    )


@api_view(["POST"])
def disconnect(_request: Request) -> Response:
    cred = SpotifyCredential.current()
    cred.clear_tokens()
    cred.save()
    return Response({"connected": False})


# --- Search --------------------------------------------------------------


@api_view(["GET"])
def search(request: Request) -> Response:
    query = (request.query_params.get("q") or "").strip()
    if not query:
        return Response({"error": "q is required"}, status=400)
    types = request.query_params.get("types") or client.DEFAULT_SEARCH_TYPES
    try:
        limit = int(request.query_params.get("limit") or 20)
    except ValueError:
        limit = 20
    try:
        offset = int(request.query_params.get("offset") or 0)
    except ValueError:
        offset = 0
    try:
        token = get_active_access_token()
        results = client.search(token, query, types=types, limit=min(limit, 50), offset=offset)
    except SpotifyError as exc:
        return _error_response(exc)
    return Response(results)


# --- Catalog ---------------------------------------------------------------


@api_view(["GET"])
def album_detail(_request: Request, album_id: str) -> Response:
    try:
        token = get_active_access_token()
        album = client.get_album(token, album_id)
    except SpotifyError as exc:
        return _error_response(exc)
    return Response(album)


@api_view(["GET"])
def artist_detail(_request: Request, artist_id: str) -> Response:
    try:
        token = get_active_access_token()
        artist = client.get_artist(token, artist_id)
        top_tracks = client.get_artist_top_tracks(token, artist_id)
        albums = client.get_artist_albums(token, artist_id)
    except SpotifyError as exc:
        return _error_response(exc)
    artist["top_tracks"] = top_tracks.get("tracks", [])
    artist["albums"] = albums.get("items", [])
    return Response(artist)


@api_view(["GET"])
def track_detail(_request: Request, track_id: str) -> Response:
    try:
        token = get_active_access_token()
        track = client.get_track(token, track_id)
    except SpotifyError as exc:
        return _error_response(exc)
    return Response(track)


# --- Library: saved tracks / albums -----------------------------------


@api_view(["GET", "PUT", "DELETE"])
def library_tracks(request: Request) -> Response:
    try:
        token = get_active_access_token()
        if request.method == "GET":
            limit = int(request.query_params.get("limit") or 20)
            offset = int(request.query_params.get("offset") or 0)
            return Response(client.get_saved_tracks(token, limit=min(limit, 50), offset=offset))
        ids = _ids_param(request)
        if not ids:
            return Response({"error": "ids is required"}, status=400)
        if request.method == "PUT":
            client.save_tracks(token, ids)
        else:
            client.remove_saved_tracks(token, ids)
    except SpotifyError as exc:
        return _error_response(exc)
    return Response({"ok": True})


@api_view(["GET", "PUT", "DELETE"])
def library_albums(request: Request) -> Response:
    try:
        token = get_active_access_token()
        if request.method == "GET":
            limit = int(request.query_params.get("limit") or 20)
            offset = int(request.query_params.get("offset") or 0)
            return Response(client.get_saved_albums(token, limit=min(limit, 50), offset=offset))
        ids = _ids_param(request)
        if not ids:
            return Response({"error": "ids is required"}, status=400)
        if request.method == "PUT":
            client.save_albums(token, ids)
        else:
            client.remove_saved_albums(token, ids)
    except SpotifyError as exc:
        return _error_response(exc)
    return Response({"ok": True})


# --- Playlists + track CRUD -------------------------------------------


@api_view(["GET", "POST"])
def playlists(request: Request) -> Response:
    try:
        token = get_active_access_token()
        if request.method == "GET":
            limit = int(request.query_params.get("limit") or 20)
            offset = int(request.query_params.get("offset") or 0)
            return Response(client.get_current_user_playlists(token, limit=min(limit, 50), offset=offset))

        name = (request.data.get("name") or "").strip()
        if not name:
            return Response({"error": "name is required"}, status=400)
        cred = SpotifyCredential.current()
        created = client.create_playlist(
            token,
            cred.spotify_user_id,
            name,
            description=(request.data.get("description") or "").strip(),
            public=bool(request.data.get("public", False)),
        )
    except SpotifyError as exc:
        return _error_response(exc)
    return Response(created, status=201)


@api_view(["GET", "PUT"])
def playlist_detail(request: Request, playlist_id: str) -> Response:
    try:
        token = get_active_access_token()
        if request.method == "GET":
            return Response(client.get_playlist(token, playlist_id))
        client.update_playlist_details(
            token,
            playlist_id,
            name=request.data.get("name"),
            description=request.data.get("description"),
            public=request.data.get("public"),
        )
    except SpotifyError as exc:
        return _error_response(exc)
    return Response({"ok": True})


@api_view(["GET", "POST", "DELETE", "PUT"])
def playlist_tracks(request: Request, playlist_id: str) -> Response:
    try:
        token = get_active_access_token()
        if request.method == "GET":
            limit = int(request.query_params.get("limit") or 50)
            offset = int(request.query_params.get("offset") or 0)
            return Response(client.get_playlist_tracks(token, playlist_id, limit=min(limit, 100), offset=offset))

        if request.method == "POST":
            uris = request.data.get("uris") or []
            if not uris:
                return Response({"error": "uris is required"}, status=400)
            result = client.add_playlist_tracks(token, playlist_id, uris[:MAX_PLAYLIST_TRACK_URIS_PER_REQUEST])
            return Response(result, status=201)

        if request.method == "DELETE":
            uris = request.data.get("uris") or []
            if not uris:
                return Response({"error": "uris is required"}, status=400)
            result = client.remove_playlist_tracks(token, playlist_id, uris[:MAX_PLAYLIST_TRACK_URIS_PER_REQUEST])
            return Response(result)

        # PUT — reorder
        range_start = request.data.get("range_start")
        insert_before = request.data.get("insert_before")
        if range_start is None or insert_before is None:
            return Response({"error": "range_start and insert_before are required"}, status=400)
        result = client.reorder_playlist_tracks(
            token, playlist_id, int(range_start), int(insert_before),
            range_length=int(request.data.get("range_length") or 1),
        )
        return Response(result)
    except SpotifyError as exc:
        return _error_response(exc)


_ALLOWED_COVER_CONTENT_TYPES = {"image/jpeg", "image/jpg"}


@api_view(["GET", "PUT"])
def playlist_cover(request: Request, playlist_id: str) -> Response:
    try:
        token = get_active_access_token()
        if request.method == "GET":
            return Response(client.get_playlist_cover(token, playlist_id))

        uploaded = request.FILES.get("image")
        if not uploaded:
            return Response({"error": "image file is required"}, status=400)
        # Validate file type/size before it ever reaches Spotify (spec
        # section 16) — content_type is client-supplied so this is a cheap
        # sanity check, not a security boundary; Spotify itself rejects
        # anything that isn't valid JPEG bytes.
        if uploaded.content_type not in _ALLOWED_COVER_CONTENT_TYPES:
            return Response({"error": "Cover image must be a JPEG."}, status=400)
        if uploaded.size > client.MAX_COVER_IMAGE_BYTES:
            return Response(
                {"error": f"Cover image must be under {client.MAX_COVER_IMAGE_BYTES // 1024}KB."}, status=400
            )
        client.upload_playlist_cover(token, playlist_id, uploaded.read())
    except SpotifyError as exc:
        return _error_response(exc)
    return Response({"ok": True})


# --- Followed artists --------------------------------------------------


@api_view(["GET", "PUT", "DELETE"])
def following_artists(request: Request) -> Response:
    try:
        token = get_active_access_token()
        if request.method == "GET":
            limit = int(request.query_params.get("limit") or 20)
            after = request.query_params.get("after") or None
            return Response(client.get_followed_artists(token, limit=min(limit, 50), after=after))
        ids = _ids_param(request)
        if not ids:
            return Response({"error": "ids is required"}, status=400)
        if request.method == "PUT":
            client.follow_artists(token, ids)
        else:
            client.unfollow_artists(token, ids)
    except SpotifyError as exc:
        return _error_response(exc)
    return Response({"ok": True})


# --- Top artists / tracks -------------------------------------------------


@api_view(["GET"])
def top_artists(request: Request) -> Response:
    time_range = request.query_params.get("time_range") or "medium_term"
    if time_range not in client.VALID_TIME_RANGES:
        return Response({"error": "invalid time_range"}, status=400)
    try:
        token = get_active_access_token()
        limit = int(request.query_params.get("limit") or 20)
        result = client.get_top_artists(token, time_range=time_range, limit=min(limit, 50))
    except SpotifyError as exc:
        return _error_response(exc)
    return Response(result)


@api_view(["GET"])
def top_tracks(request: Request) -> Response:
    time_range = request.query_params.get("time_range") or "medium_term"
    if time_range not in client._VALID_TIME_RANGES:
        return Response({"error": "invalid time_range"}, status=400)
    try:
        token = get_active_access_token()
        limit = int(request.query_params.get("limit") or 20)
        result = client.get_top_tracks(token, time_range=time_range, limit=min(limit, 50))
    except SpotifyError as exc:
        return _error_response(exc)
    return Response(result)


# --- Playback state / controls -----------------------------------------


@api_view(["GET"])
def player_state(_request: Request) -> Response:
    try:
        token = get_active_access_token()
        state = client.get_playback_state(token)
    except SpotifyError as exc:
        return _error_response(exc)
    # Spotify returns 204 No Content (empty body) when nothing is active —
    # normalize that to an explicit shape instead of forcing the frontend to
    # special-case an empty 200.
    return Response(state or {"is_playing": False, "item": None, "device": None})


@api_view(["GET"])
def currently_playing(_request: Request) -> Response:
    try:
        token = get_active_access_token()
        current = client.get_currently_playing(token)
    except SpotifyError as exc:
        return _error_response(exc)
    return Response(current or {"is_playing": False, "item": None})


def _device_id(request: Request) -> str | None:
    return request.data.get("device_id") or None


@api_view(["PUT"])
def player_play(request: Request) -> Response:
    try:
        token = get_active_access_token()
        client.play(
            token,
            device_id=_device_id(request),
            context_uri=request.data.get("context_uri"),
            uris=request.data.get("uris"),
            offset=request.data.get("offset"),
        )
    except SpotifyError as exc:
        return _error_response(exc)
    return Response({"ok": True})


@api_view(["PUT"])
def player_pause(request: Request) -> Response:
    try:
        token = get_active_access_token()
        client.pause(token, device_id=_device_id(request))
    except SpotifyError as exc:
        return _error_response(exc)
    return Response({"ok": True})


@api_view(["POST"])
def player_next(request: Request) -> Response:
    try:
        token = get_active_access_token()
        client.next_track(token, device_id=_device_id(request))
    except SpotifyError as exc:
        return _error_response(exc)
    return Response({"ok": True})


@api_view(["POST"])
def player_previous(request: Request) -> Response:
    try:
        token = get_active_access_token()
        client.previous_track(token, device_id=_device_id(request))
    except SpotifyError as exc:
        return _error_response(exc)
    return Response({"ok": True})


@api_view(["PUT"])
def player_seek(request: Request) -> Response:
    position_ms = request.data.get("position_ms")
    if position_ms is None:
        return Response({"error": "position_ms is required"}, status=400)
    try:
        token = get_active_access_token()
        client.seek(token, int(position_ms), device_id=_device_id(request))
    except SpotifyError as exc:
        return _error_response(exc)
    return Response({"ok": True})


@api_view(["PUT"])
def player_volume(request: Request) -> Response:
    volume = request.data.get("volume_percent")
    if volume is None:
        return Response({"error": "volume_percent is required"}, status=400)
    try:
        token = get_active_access_token()
        client.set_volume(token, int(volume), device_id=_device_id(request))
    except SpotifyError as exc:
        return _error_response(exc)
    return Response({"ok": True})


@api_view(["PUT"])
def player_shuffle(request: Request) -> Response:
    try:
        token = get_active_access_token()
        client.set_shuffle(token, bool(request.data.get("state")), device_id=_device_id(request))
    except SpotifyError as exc:
        return _error_response(exc)
    return Response({"ok": True})


@api_view(["PUT"])
def player_repeat(request: Request) -> Response:
    state = request.data.get("state")
    if state not in ("track", "context", "off"):
        return Response({"error": "state must be track, context, or off"}, status=400)
    try:
        token = get_active_access_token()
        client.set_repeat(token, state, device_id=_device_id(request))
    except SpotifyError as exc:
        return _error_response(exc)
    return Response({"ok": True})


# --- Devices -------------------------------------------------------------


@api_view(["GET"])
def devices(_request: Request) -> Response:
    try:
        token = get_active_access_token()
        result = client.get_devices(token)
    except SpotifyError as exc:
        return _error_response(exc)
    return Response(result)


@api_view(["PUT"])
def transfer_playback(request: Request) -> Response:
    device_id = request.data.get("device_id")
    if not device_id:
        return Response({"error": "device_id is required"}, status=400)
    try:
        token = get_active_access_token()
        client.transfer_playback(token, device_id, play=bool(request.data.get("play", False)))
    except SpotifyError as exc:
        return _error_response(exc)
    return Response({"ok": True})


# --- Queue ------------------------------------------------------------


@api_view(["GET", "POST"])
def queue(request: Request) -> Response:
    try:
        token = get_active_access_token()
        if request.method == "GET":
            return Response(client.get_queue(token))
        track_uri = request.data.get("uri")
        if not track_uri:
            return Response({"error": "uri is required"}, status=400)
        client.add_to_queue(token, track_uri, device_id=_device_id(request))
    except SpotifyError as exc:
        return _error_response(exc)
    return Response({"ok": True})


# --- Statistics / dashboard ------------------------------------------


@api_view(["GET"])
def stats(_request: Request) -> Response:
    try:
        token = get_active_access_token()
        result = statistics.get_dashboard_stats(token)
    except SpotifyError as exc:
        return _error_response(exc)
    return Response(result)


@api_view(["GET"])
def home_dashboard(_request: Request) -> Response:
    try:
        token = get_active_access_token()
        result = statistics.get_home_dashboard(token)
    except SpotifyError as exc:
        return _error_response(exc)
    return Response(result)
