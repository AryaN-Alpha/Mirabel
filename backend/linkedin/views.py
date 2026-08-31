import logging
import secrets

from django.conf import settings
from django.http import HttpRequest, HttpResponse, HttpResponseRedirect
from rest_framework.decorators import api_view
from rest_framework.request import Request
from rest_framework.response import Response

from linkedin.models import (
    LinkedInAutomation,
    LinkedInAutomationRun,
    LinkedInCredential,
    LinkedInDraft,
    LinkedInProfileChange,
    LinkedInProfileSnapshot,
)
from linkedin.services import client, oauth, publishing
from linkedin.services.activity import content_activity
from linkedin.services.automation import MAX_INTERVAL_HOURS, MIN_INTERVAL_HOURS, compute_next_run_at
from linkedin.services.automation import run_now as run_automation_now
from linkedin.services.generation import generate_comment_reply, generate_post
from linkedin.services.oauth import LinkedInError
from linkedin.services.overview import build_overview
from linkedin.services.profile import latest_synced_at, profile_health, record_snapshot, sync_profile

logger = logging.getLogger("linkedin.views")

MAX_POST_LENGTH = 3000
MAX_PROMPT_LENGTH = 2000
MAX_COMMENT_LENGTH = 1250
SESSION_STATE_KEY = "linkedin_oauth_state"
DEFAULT_PERIOD_DAYS = 30
PROFILE_HISTORY_LIMIT = 50
AUTOMATION_RUNS_LIMIT = 50

_STATUS_FOR_REASON = {"rate_limited": 429, "token_expired": 401, "insufficient_scope": 403}
_AUTOMATION_TYPES = {choice for choice in LinkedInAutomation.Type.values}


def auth_start(request: HttpRequest) -> HttpResponse:
    state = secrets.token_urlsafe(24)
    request.session[SESSION_STATE_KEY] = state
    try:
        url = oauth.get_auth_url(state)
    except LinkedInError as exc:
        return HttpResponseRedirect(f"{settings.FRONTEND_URL}/home/linkedin?error={exc}")
    return HttpResponseRedirect(url)


def auth_callback(request: HttpRequest) -> HttpResponse:
    expected_state = request.session.pop(SESSION_STATE_KEY, None)
    got_state = request.GET.get("state")
    if not expected_state or expected_state != got_state:
        return HttpResponseRedirect(f"{settings.FRONTEND_URL}/home/linkedin?error=Invalid+OAuth+state")

    code = request.GET.get("code")
    if not code:
        return HttpResponseRedirect(f"{settings.FRONTEND_URL}/home/linkedin?error=No+authorization+code+returned")

    try:
        result = oauth.exchange_code_for_token(code)
        cred = LinkedInCredential.current()
        oauth.save_token_result(cred, result)
        userinfo = oauth.fetch_userinfo(cred.get_access_token())
        oauth.save_profile(cred, userinfo)
        cred.save()
    except LinkedInError as exc:
        return HttpResponseRedirect(f"{settings.FRONTEND_URL}/home/linkedin?error={exc}")

    try:
        # Best-effort: establishes the profile-history baseline right at
        # connect time instead of leaving it empty until the user manually
        # syncs or a profile_sync automation happens to run. Never let a
        # failure here break the OAuth redirect — the connection itself
        # already succeeded above.
        record_snapshot(cred)
    except Exception:
        logger.exception("linkedin.auth_callback: failed to record baseline profile snapshot")

    return HttpResponseRedirect(f"{settings.FRONTEND_URL}/home/linkedin?connected=1")


@api_view(["GET"])
def status(_request: Request) -> Response:
    cred = LinkedInCredential.current()
    return Response(
        {
            "connected": cred.is_connected,
            "expired": cred.is_connected and cred.is_expired,
            "name": cred.name,
            "email": cred.email,
            "picture_url": cred.picture_url,
            "member_urn": cred.member_urn,
            "scope": cred.scope,
            "token_expires_at": cred.token_expires_at,
            "refresh_token_supported": settings.LINKEDIN_ENABLE_REFRESH_TOKEN,
        }
    )


@api_view(["POST"])
def disconnect(_request: Request) -> Response:
    cred = LinkedInCredential.current()
    cred.clear_tokens()
    cred.save()
    return Response({"connected": False})


@api_view(["GET", "POST"])
def drafts(request: Request) -> Response:
    if request.method == "GET":
        items = LinkedInDraft.objects.all()
        return Response({"drafts": [_serialize_draft(d) for d in items]})

    draft = LinkedInDraft.objects.create(
        body=(request.data.get("body") or "").strip(),
        visibility=request.data.get("visibility") or LinkedInDraft.Visibility.PUBLIC,
        link_url=(request.data.get("link_url") or "").strip(),
        prompt=(request.data.get("prompt") or "").strip(),
        tone=(request.data.get("tone") or "").strip(),
    )
    return Response(_serialize_draft(draft), status=201)


@api_view(["GET", "PUT", "DELETE"])
def draft_detail(request: Request, draft_id: int) -> Response:
    try:
        draft = LinkedInDraft.objects.get(pk=draft_id)
    except LinkedInDraft.DoesNotExist:
        return Response({"error": "draft not found"}, status=404)

    if request.method == "GET":
        return Response(_serialize_draft(draft))

    if request.method == "DELETE":
        draft.delete()
        return Response({"deleted": True})

    for field in ("body", "visibility", "link_url", "prompt", "tone"):
        if field in request.data:
            setattr(draft, field, request.data[field])
    draft.save()
    return Response(_serialize_draft(draft))


@api_view(["POST"])
def publish_draft(_request: Request, draft_id: int) -> Response:
    try:
        draft = LinkedInDraft.objects.get(pk=draft_id)
    except LinkedInDraft.DoesNotExist:
        return Response({"error": "draft not found"}, status=404)

    try:
        publishing.publish_draft(draft)
    except LinkedInError as exc:
        return Response({"error": str(exc), "reason": exc.reason}, status=_status_for(exc))

    return Response(_serialize_draft(draft))


@api_view(["POST"])
def publish_post(request: Request) -> Response:
    body = (request.data.get("body") or "").strip()
    if not body:
        return Response({"error": "body is required"}, status=400)
    if len(body) > MAX_POST_LENGTH:
        return Response({"error": f"body must be under {MAX_POST_LENGTH} characters"}, status=400)
    visibility = request.data.get("visibility") or LinkedInDraft.Visibility.PUBLIC
    link_url = (request.data.get("link_url") or "").strip()

    try:
        urn = publishing.publish(body=body, visibility=visibility, link_url=link_url, image_field=None)
    except LinkedInError as exc:
        return Response({"error": str(exc), "reason": exc.reason}, status=_status_for(exc))
    return Response({"published": True, "post_urn": urn})


@api_view(["POST"])
def upload_image(request: Request) -> Response:
    draft_id = request.data.get("draft_id")
    file = request.FILES.get("image")
    if not file:
        return Response({"error": "image file is required"}, status=400)
    if draft_id:
        try:
            draft = LinkedInDraft.objects.get(pk=draft_id)
        except LinkedInDraft.DoesNotExist:
            return Response({"error": "draft not found"}, status=404)
    else:
        draft = LinkedInDraft.objects.create()
    draft.image = file
    draft.save()
    return Response(_serialize_draft(draft))


@api_view(["POST"])
def generate_post_view(request: Request) -> Response:
    prompt = (request.data.get("prompt") or "").strip()
    if not prompt:
        return Response({"error": "prompt is required"}, status=400)
    if len(prompt) > MAX_PROMPT_LENGTH:
        return Response({"error": f"prompt must be under {MAX_PROMPT_LENGTH} characters"}, status=400)
    tone = (request.data.get("tone") or "").strip()
    length = (request.data.get("length") or "medium").strip()
    result = generate_post(prompt=prompt, tone=tone, length=length)
    return Response(result)


@api_view(["POST"])
def post_comment(request: Request) -> Response:
    post_urn = (request.data.get("post_urn") or "").strip()
    message = (request.data.get("message") or "").strip()
    if not post_urn:
        return Response({"error": "post_urn is required"}, status=400)
    if not message:
        return Response({"error": "message is required"}, status=400)
    if len(message) > MAX_COMMENT_LENGTH:
        return Response({"error": f"message must be under {MAX_COMMENT_LENGTH} characters"}, status=400)

    cred = LinkedInCredential.current()
    try:
        token = oauth.get_active_access_token()
        client.create_comment(token, post_urn=post_urn, actor_urn=cred.member_urn, message=message)
    except LinkedInError as exc:
        return Response({"error": str(exc), "reason": exc.reason}, status=_status_for(exc))
    return Response({"posted": True})


@api_view(["POST"])
def generate_comment(request: Request) -> Response:
    post_context = (request.data.get("post_context") or "").strip()
    instructions = (request.data.get("instructions") or "").strip()
    if not post_context:
        return Response({"error": "post_context is required — paste in what the post says"}, status=400)
    if len(post_context) > MAX_PROMPT_LENGTH:
        return Response({"error": f"post_context must be under {MAX_PROMPT_LENGTH} characters"}, status=400)
    result = generate_comment_reply(post_context=post_context, instructions=instructions)
    return Response(result)


@api_view(["GET"])
def profile(_request: Request) -> Response:
    cred = LinkedInCredential.current()
    return Response(
        {
            "profile": {
                "connected": cred.is_connected,
                "name": cred.name,
                "email": cred.email,
                "picture_url": cred.picture_url,
                "member_urn": cred.member_urn,
                "last_synced": latest_synced_at(),
            },
            "health": profile_health(),
        }
    )


@api_view(["GET"])
def profile_history(_request: Request) -> Response:
    changes = LinkedInProfileChange.objects.order_by("-detected_at")[:PROFILE_HISTORY_LIMIT]
    return Response(
        {
            "changes": [
                {
                    "field": c.field,
                    "old_value": c.old_value,
                    "new_value": c.new_value,
                    "detected_at": c.detected_at,
                }
                for c in changes
            ],
            "snapshot_count": LinkedInProfileSnapshot.objects.count(),
        }
    )


@api_view(["POST"])
def sync_now(_request: Request) -> Response:
    try:
        result = sync_profile()
    except LinkedInError as exc:
        return Response({"error": str(exc), "reason": exc.reason}, status=_status_for(exc))
    return Response(result)


def _period_from_query(request: Request) -> int:
    try:
        return int(request.query_params.get("period") or DEFAULT_PERIOD_DAYS)
    except ValueError:
        return DEFAULT_PERIOD_DAYS


@api_view(["GET"])
def activity(request: Request) -> Response:
    return Response(content_activity(_period_from_query(request)))


@api_view(["GET"])
def overview(request: Request) -> Response:
    return Response(build_overview(_period_from_query(request)))


def _serialize_automation(automation: LinkedInAutomation) -> dict:
    return {
        "id": automation.id,
        "name": automation.name,
        "type": automation.type,
        "enabled": automation.enabled,
        "interval_hours": automation.interval_hours,
        "configuration": automation.configuration,
        "last_run_at": automation.last_run_at,
        "next_run_at": automation.next_run_at,
        "last_status": automation.last_status,
        "failure_count": automation.failure_count,
        "created_at": automation.created_at,
        "updated_at": automation.updated_at,
    }


def _serialize_run(run: LinkedInAutomationRun) -> dict:
    return {
        "id": run.id,
        "automation_id": run.automation_id,
        "started_at": run.started_at,
        "finished_at": run.finished_at,
        "status": run.status,
        "detail": run.detail,
        "error_message": run.error_message,
    }


@api_view(["GET", "POST"])
def automations(request: Request) -> Response:
    if request.method == "GET":
        items = LinkedInAutomation.objects.all()
        return Response({"automations": [_serialize_automation(a) for a in items]})

    name = (request.data.get("name") or "").strip()
    automation_type = (request.data.get("type") or "").strip()
    if not name:
        return Response({"error": "name is required"}, status=400)
    if automation_type not in _AUTOMATION_TYPES:
        return Response({"error": f"type must be one of {sorted(_AUTOMATION_TYPES)}"}, status=400)

    raw_interval = request.data.get("interval_hours")
    if raw_interval is None:
        interval_hours = 6
    else:
        try:
            interval_hours = int(raw_interval)
        except (TypeError, ValueError):
            return Response({"error": "interval_hours must be an integer"}, status=400)

    automation = LinkedInAutomation(name=name, type=automation_type, interval_hours=_clamp_interval(interval_hours))
    automation.next_run_at = compute_next_run_at(automation)
    automation.save()
    return Response(_serialize_automation(automation), status=201)


@api_view(["PATCH", "DELETE"])
def automation_detail(request: Request, automation_id: int) -> Response:
    try:
        automation = LinkedInAutomation.objects.get(pk=automation_id)
    except LinkedInAutomation.DoesNotExist:
        return Response({"error": "automation not found"}, status=404)

    if request.method == "DELETE":
        automation.delete()
        return Response({"deleted": True})

    if "name" in request.data:
        name = (request.data.get("name") or "").strip()
        if name:
            automation.name = name
    if "enabled" in request.data:
        automation.enabled = bool(request.data.get("enabled"))
    if "interval_hours" in request.data:
        try:
            interval_hours = int(request.data["interval_hours"])
        except (TypeError, ValueError):
            return Response({"error": "interval_hours must be an integer"}, status=400)
        automation.interval_hours = _clamp_interval(interval_hours)
    automation.save()
    return Response(_serialize_automation(automation))


@api_view(["POST"])
def automation_run_now(_request: Request, automation_id: int) -> Response:
    if not LinkedInAutomation.objects.filter(pk=automation_id).exists():
        return Response({"error": "automation not found"}, status=404)
    started = run_automation_now(automation_id)
    if not started:
        return Response(
            {"error": "Automation is disabled, or already running — try again in a moment."}, status=409
        )
    automation = LinkedInAutomation.objects.get(pk=automation_id)
    return Response(_serialize_automation(automation))


@api_view(["GET"])
def automation_runs(request: Request) -> Response:
    runs = LinkedInAutomationRun.objects.all()
    automation_id = request.query_params.get("automation_id")
    if automation_id:
        try:
            runs = runs.filter(automation_id=int(automation_id))
        except ValueError:
            pass  # non-numeric filter value — same "ignore, don't crash" convention as outlook.views.inbox's page param
    return Response({"runs": [_serialize_run(r) for r in runs[:AUTOMATION_RUNS_LIMIT]]})


def _clamp_interval(interval_hours: int) -> int:
    """Keeps the stored/displayed interval_hours in sync with what
    compute_next_run_at actually schedules — without this, a user could see
    e.g. "every 999999 hrs" in the UI while the automation silently runs
    every MAX_INTERVAL_HOURS instead."""
    return min(max(interval_hours, MIN_INTERVAL_HOURS), MAX_INTERVAL_HOURS)


def _serialize_draft(draft: LinkedInDraft) -> dict:
    return {
        "id": draft.id,
        "body": draft.body,
        "visibility": draft.visibility,
        "link_url": draft.link_url,
        "image_url": draft.image.url if draft.image else "",
        "prompt": draft.prompt,
        "tone": draft.tone,
        "status": draft.status,
        "linkedin_post_urn": draft.linkedin_post_urn,
        "created_at": draft.created_at,
        "updated_at": draft.updated_at,
    }


def _status_for(exc: LinkedInError) -> int:
    return _STATUS_FOR_REASON.get(exc.reason, 400)
