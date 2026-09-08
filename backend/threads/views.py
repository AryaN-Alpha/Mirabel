import base64
import hashlib
import hmac
import json
import logging
import secrets
import uuid

from django.conf import settings
from django.http import HttpRequest, HttpResponse, HttpResponseRedirect, JsonResponse
from rest_framework import status as http_status
from rest_framework.decorators import api_view
from rest_framework.request import Request
from rest_framework.response import Response

from threads.models import (
    ThreadsAutomation,
    ThreadsAutomationRun,
    ThreadsCredential,
    ThreadsDraft,
    ThreadsProfileChange,
    ThreadsRateLimitSnapshot,
)
from threads.services import client, oauth, publishing
from threads.services.activity import content_activity
from threads.services.automation import MAX_INTERVAL_HOURS, MIN_INTERVAL_HOURS, compute_next_run_at
from threads.services.automation import run_now as run_automation_now
from threads.services.generation import generate_post, generate_reply
from threads.services.oauth import ThreadsError
from threads.services.overview import build_overview
from threads.services.profile import latest_synced_at, profile_health, record_snapshot, sync_profile

logger = logging.getLogger("threads")

MAX_POST_LENGTH = 500
MAX_PROMPT_LENGTH = 2000
SESSION_STATE_KEY = "threads_oauth_state"
DEFAULT_PERIOD_DAYS = 30
PROFILE_HISTORY_LIMIT = 50
AUTOMATION_RUNS_LIMIT = 50

_AUTOMATION_TYPES = {choice for choice in ThreadsAutomation.Type.values}


# ---------------------------------------------------------------------------
# OAuth & Connection Views
# ---------------------------------------------------------------------------


def auth_start(request: HttpRequest) -> HttpResponse:
    state = secrets.token_urlsafe(24)
    request.session[SESSION_STATE_KEY] = state
    try:
        url = oauth.get_auth_url(state)
    except ThreadsError as exc:
        return HttpResponseRedirect(f"{settings.FRONTEND_URL}/home/threads?error={exc}")
    return HttpResponseRedirect(url)


def auth_callback(request: HttpRequest) -> HttpResponse:
    expected_state = request.session.pop(SESSION_STATE_KEY, None)
    got_state = request.GET.get("state")
    if not expected_state or expected_state != got_state:
        return HttpResponseRedirect(f"{settings.FRONTEND_URL}/home/threads?error=Invalid+OAuth+state")

    code = request.GET.get("code")
    if not code:
        return HttpResponseRedirect(f"{settings.FRONTEND_URL}/home/threads?error=No+authorization+code+returned")

    try:
        token_data = oauth.exchange_code_for_token(code)
        cred = ThreadsCredential.current()
        oauth.save_token_result(cred, token_data)
        userinfo = oauth.fetch_userinfo(cred.get_access_token())
        oauth.save_profile(cred, userinfo)
        cred.save()
    except ThreadsError as exc:
        return HttpResponseRedirect(f"{settings.FRONTEND_URL}/home/threads?error={exc}")

    try:
        record_snapshot(cred)
    except Exception:
        logger.exception("threads.auth_callback: failed to record baseline profile snapshot")

    return HttpResponseRedirect(f"{settings.FRONTEND_URL}/home/threads?connected=1")


@api_view(["GET"])
def status(_request: Request) -> Response:
    cred = ThreadsCredential.current()
    snapshot = ThreadsRateLimitSnapshot.latest()
    return Response(
        {
            "connected": cred.is_connected,
            "expired": cred.is_connected and cred.is_expired,
            "username": cred.username,
            "name": cred.name,
            "biography": cred.biography,
            "picture_url": cred.profile_picture_url,
            "threads_user_id": cred.threads_user_id,
            "is_private_profile": cred.is_private_profile,
            "needs_reauth": cred.needs_reauth,
            "scope": cred.scope,
            "token_expires_at": cred.token_expires_at,
            "permission_expires_at": cred.permission_expires_at,
            "token_age_hours": cred.token_age_hours,
            "rate_limit": {
                "quota_usage": snapshot.quota_usage if snapshot else 0,
                "quota_total": snapshot.quota_total if snapshot else 250,
                "is_exhausted": snapshot.is_exhausted if snapshot else False,
            } if snapshot else None,
        }
    )


@api_view(["POST"])
def disconnect(_request: Request) -> Response:
    cred = ThreadsCredential.current()
    cred.clear_tokens()
    cred.save()
    return Response({"disconnected": True})


# ---------------------------------------------------------------------------
# Meta Compliance Callbacks (Deauthorize & Data Deletion)
# ---------------------------------------------------------------------------


def _parse_signed_request(signed_request: str, secret: str) -> dict | None:
    """Decodes and validates a Meta signed request using HMAC-SHA256."""
    try:
        encoded_sig, payload = signed_request.split(".", 1)
        sig = base64.urlsafe_b64decode(encoded_sig + "=" * ((4 - len(encoded_sig) % 4) % 4))
        data = json.loads(base64.urlsafe_b64decode(payload + "=" * ((4 - len(payload) % 4) % 4)).decode("utf-8"))
        if secret:
            expected_sig = hmac.new(secret.encode("utf-8"), payload.encode("utf-8"), hashlib.sha256).digest()
            if not hmac.compare_digest(sig, expected_sig):
                logger.warning("threads.signed_request: signature mismatch")
                return None
        return data
    except Exception as exc:
        logger.warning("threads.signed_request: failed to parse: %s", exc)
        return None


@api_view(["POST"])
def deauthorize_callback(request: Request) -> Response:
    """Meta ping when a user removes the app from their Meta account."""
    signed_req = request.data.get("signed_request") or request.POST.get("signed_request", "")
    secret = oauth._app_secret()
    data = _parse_signed_request(signed_req, secret)
    user_id = data.get("user_id") if data else None

    cred = ThreadsCredential.current()
    if user_id and cred.threads_user_id == str(user_id):
        cred.clear_tokens()
        cred.save()
        logger.info("threads.deauthorize: cleared credentials for user %s", user_id)
    elif not user_id:
        logger.warning("threads.deauthorize: received callback without valid user_id")

    return Response({"success": True})


@api_view(["POST"])
def data_deletion_callback(request: Request) -> Response:
    """Meta data deletion request callback. Complies with GDPR/Meta requirements."""
    signed_req = request.data.get("signed_request") or request.POST.get("signed_request", "")
    secret = oauth._app_secret()
    data = _parse_signed_request(signed_req, secret)
    user_id = data.get("user_id") if data else None

    confirmation_code = str(uuid.uuid4())
    cred = ThreadsCredential.current()
    if user_id and cred.threads_user_id == str(user_id):
        cred.clear_tokens()
        cred.save()
        ThreadsDraft.objects.all().delete()
        logger.info("threads.data_deletion: purged data for user %s with code %s", user_id, confirmation_code)

    status_url = f"{settings.FRONTEND_URL}/home/threads?deletion_code={confirmation_code}"
    return Response({"url": status_url, "confirmation_code": confirmation_code})


# ---------------------------------------------------------------------------
# Drafts & Publishing Views
# ---------------------------------------------------------------------------


def _serialize_draft(draft: ThreadsDraft) -> dict:
    return {
        "id": draft.id,
        "body": draft.body,
        "reply_control": draft.reply_control,
        "link_url": draft.link_url,
        "image_url": draft.image.url if draft.image else None,
        "prompt": draft.prompt,
        "tone": draft.tone,
        "status": draft.status,
        "container_status": draft.container_status,
        "threads_post_id": draft.threads_post_id,
        "permalink": draft.permalink,
        "parent_thread_id": draft.parent_thread_id,
        "created_at": draft.created_at.isoformat(),
        "updated_at": draft.updated_at.isoformat(),
    }


@api_view(["GET", "POST"])
def drafts(request: Request) -> Response:
    if request.method == "GET":
        qs = ThreadsDraft.objects.all()
        status_filter = request.query_params.get("status")
        if status_filter:
            qs = qs.filter(status=status_filter)
        return Response([_serialize_draft(d) for d in qs])

    body = request.data.get("body", "")
    if len(body) > MAX_POST_LENGTH:
        return Response(
            {"error": f"Post body cannot exceed {MAX_POST_LENGTH} characters."},
            status=http_status.HTTP_400_BAD_REQUEST,
        )

    reply_control = request.data.get("reply_control", ThreadsDraft.ReplyControl.EVERYONE)
    if reply_control not in ThreadsDraft.ReplyControl.values:
        reply_control = ThreadsDraft.ReplyControl.EVERYONE

    draft = ThreadsDraft.objects.create(
        body=body,
        reply_control=reply_control,
        link_url=request.data.get("link_url", ""),
        prompt=request.data.get("prompt", ""),
        tone=request.data.get("tone", ""),
        parent_thread_id=request.data.get("parent_thread_id", ""),
    )
    return Response(_serialize_draft(draft), status=http_status.HTTP_201_CREATED)


@api_view(["GET", "PUT", "PATCH", "DELETE"])
def draft_detail(request: Request, draft_id: int) -> Response:
    try:
        draft = ThreadsDraft.objects.get(pk=draft_id)
    except ThreadsDraft.DoesNotExist:
        return Response({"error": "Draft not found."}, status=http_status.HTTP_404_NOT_FOUND)

    if request.method == "GET":
        return Response(_serialize_draft(draft))

    if request.method == "DELETE":
        draft.delete()
        return Response(status=http_status.HTTP_204_NO_CONTENT)

    # PUT / PATCH
    if "body" in request.data:
        body = request.data["body"]
        if len(body) > MAX_POST_LENGTH:
            return Response(
                {"error": f"Post body cannot exceed {MAX_POST_LENGTH} characters."},
                status=http_status.HTTP_400_BAD_REQUEST,
            )
        draft.body = body

    if "reply_control" in request.data:
        rc = request.data["reply_control"]
        if rc in ThreadsDraft.ReplyControl.values:
            draft.reply_control = rc

    if "link_url" in request.data:
        draft.link_url = request.data["link_url"]

    draft.save()
    return Response(_serialize_draft(draft))


@api_view(["POST"])
def publish_draft_view(request: Request, draft_id: int) -> Response:
    try:
        draft = ThreadsDraft.objects.get(pk=draft_id)
    except ThreadsDraft.DoesNotExist:
        return Response({"error": "Draft not found."}, status=http_status.HTTP_404_NOT_FOUND)

    try:
        res = publishing.publish_draft(draft)
        return Response(res)
    except ThreadsError as exc:
        return Response({"error": str(exc), "reason": exc.reason}, status=http_status.HTTP_400_BAD_REQUEST)


@api_view(["POST"])
def publish_post(request: Request) -> Response:
    """Directly creates and publishes a post without an existing draft ID."""
    body = request.data.get("body", "").strip()
    if not body and not request.FILES.get("image"):
        return Response({"error": "Post must include text or an image."}, status=http_status.HTTP_400_BAD_REQUEST)
    if len(body) > MAX_POST_LENGTH:
        return Response(
            {"error": f"Post cannot exceed {MAX_POST_LENGTH} characters."},
            status=http_status.HTTP_400_BAD_REQUEST,
        )

    reply_control = request.data.get("reply_control", ThreadsDraft.ReplyControl.EVERYONE)
    draft = ThreadsDraft.objects.create(
        body=body,
        reply_control=reply_control,
        link_url=request.data.get("link_url", ""),
        image=request.FILES.get("image"),
        prompt=request.data.get("prompt", ""),
        tone=request.data.get("tone", ""),
    )
    try:
        res = publishing.publish_draft(draft)
        return Response(res, status=http_status.HTTP_201_CREATED)
    except ThreadsError as exc:
        return Response({"error": str(exc), "reason": exc.reason}, status=http_status.HTTP_400_BAD_REQUEST)


@api_view(["POST"])
def generate_post_view(request: Request) -> Response:
    prompt = request.data.get("prompt", "").strip()
    if not prompt:
        return Response({"error": "Prompt is required."}, status=http_status.HTTP_400_BAD_REQUEST)
    if len(prompt) > MAX_PROMPT_LENGTH:
        return Response(
            {"error": f"Prompt cannot exceed {MAX_PROMPT_LENGTH} characters."},
            status=http_status.HTTP_400_BAD_REQUEST,
        )

    tone = request.data.get("tone", "casual")
    length = request.data.get("length", "medium")
    result = generate_post(prompt=prompt, tone=tone, length=length)
    return Response(result)


@api_view(["POST"])
def upload_image(request: Request) -> Response:
    image_file = request.FILES.get("image")
    if not image_file:
        return Response({"error": "No image file provided."}, status=http_status.HTTP_400_BAD_REQUEST)

    draft_id = request.data.get("draft_id")
    if draft_id:
        try:
            draft = ThreadsDraft.objects.get(pk=draft_id)
            draft.image = image_file
            draft.save(update_fields=["image", "updated_at"])
            return Response({"draft_id": draft.id, "image_url": draft.image.url})
        except ThreadsDraft.DoesNotExist:
            return Response({"error": "Draft not found."}, status=http_status.HTTP_404_NOT_FOUND)

    draft = ThreadsDraft.objects.create(image=image_file)
    return Response({"draft_id": draft.id, "image_url": draft.image.url}, status=http_status.HTTP_201_CREATED)


# ---------------------------------------------------------------------------
# Replies Views
# ---------------------------------------------------------------------------


@api_view(["POST"])
def post_reply(request: Request) -> Response:
    parent_thread_id = request.data.get("parent_thread_id", "").strip()
    message = request.data.get("message", "").strip()
    if not parent_thread_id:
        return Response({"error": "parent_thread_id is required."}, status=http_status.HTTP_400_BAD_REQUEST)
    if not message:
        return Response({"error": "message is required."}, status=http_status.HTTP_400_BAD_REQUEST)

    try:
        res = publishing.publish_reply(parent_thread_id, message)
        return Response(res)
    except ThreadsError as exc:
        return Response({"error": str(exc), "reason": exc.reason}, status=http_status.HTTP_400_BAD_REQUEST)


@api_view(["POST"])
def generate_reply_view(request: Request) -> Response:
    post_context = request.data.get("post_context", "").strip()
    instructions = request.data.get("instructions", "").strip()
    if not post_context:
        return Response({"error": "post_context is required."}, status=http_status.HTTP_400_BAD_REQUEST)

    res = generate_reply(post_context=post_context, instructions=instructions)
    return Response(res)


# ---------------------------------------------------------------------------
# Profile & Snapshots Views
# ---------------------------------------------------------------------------


@api_view(["GET"])
def profile(_request: Request) -> Response:
    cred = ThreadsCredential.current()
    synced_at = latest_synced_at()
    return Response(
        {
            "connected": cred.is_connected,
            "username": cred.username,
            "name": cred.name,
            "biography": cred.biography,
            "picture_url": cred.profile_picture_url,
            "is_private_profile": cred.is_private_profile,
            "needs_reauth": cred.needs_reauth,
            "last_synced": synced_at.isoformat() if synced_at else None,
            "health": profile_health(),
        }
    )


@api_view(["GET"])
def profile_history(_request: Request) -> Response:
    changes = [
        {
            "field": c.field,
            "old_value": c.old_value,
            "new_value": c.new_value,
            "detected_at": c.detected_at.isoformat(),
        }
        for c in ThreadsProfileChange.objects.order_by("-detected_at")[:PROFILE_HISTORY_LIMIT]
    ]
    return Response({"changes": changes})


@api_view(["POST"])
def sync_now(_request: Request) -> Response:
    try:
        res = sync_profile()
        return Response(res)
    except ThreadsError as exc:
        return Response({"error": str(exc), "reason": exc.reason}, status=http_status.HTTP_400_BAD_REQUEST)


# ---------------------------------------------------------------------------
# Overview & Activity Views
# ---------------------------------------------------------------------------


@api_view(["GET"])
def overview(request: Request) -> Response:
    period = request.query_params.get("period", DEFAULT_PERIOD_DAYS)
    try:
        period = int(period)
    except ValueError:
        period = DEFAULT_PERIOD_DAYS
    return Response(build_overview(period))


@api_view(["GET"])
def activity(request: Request) -> Response:
    period = request.query_params.get("period", DEFAULT_PERIOD_DAYS)
    try:
        period = int(period)
    except ValueError:
        period = DEFAULT_PERIOD_DAYS
    return Response(content_activity(period))


@api_view(["GET"])
def user_threads(request: Request) -> Response:
    try:
        token = oauth.get_active_access_token()
        threads_list = client.get_user_threads(token)
        return Response({"threads": threads_list})
    except ThreadsError as exc:
        return Response({"error": str(exc), "reason": exc.reason}, status=http_status.HTTP_400_BAD_REQUEST)


@api_view(["GET"])
def rate_limit_status(_request: Request) -> Response:
    cred = ThreadsCredential.current()
    if not cred.is_connected:
        return Response({"connected": False, "rate_limit": None})

    try:
        token = oauth.get_active_access_token()
        data = client.get_publishing_limit(token, cred.threads_user_id)
        usage = data.get("data", [{}])[0] if isinstance(data.get("data"), list) and data["data"] else data
        snapshot = ThreadsRateLimitSnapshot.objects.create(
            quota_usage=usage.get("quota_usage", 0),
            quota_total=usage.get("config", {}).get("quota_total", 250),
            reply_quota_usage=usage.get("reply_quota_usage"),
            reply_quota_total=usage.get("reply_config", {}).get("quota_total"),
            raw_response=data,
        )
        return Response(
            {
                "quota_usage": snapshot.quota_usage,
                "quota_total": snapshot.quota_total,
                "reply_quota_usage": snapshot.reply_quota_usage,
                "reply_quota_total": snapshot.reply_quota_total,
                "is_exhausted": snapshot.is_exhausted,
                "fetched_at": snapshot.fetched_at.isoformat(),
            }
        )
    except ThreadsError as exc:
        snapshot = ThreadsRateLimitSnapshot.latest()
        if snapshot:
            return Response(
                {
                    "quota_usage": snapshot.quota_usage,
                    "quota_total": snapshot.quota_total,
                    "is_exhausted": snapshot.is_exhausted,
                    "fetched_at": snapshot.fetched_at.isoformat(),
                    "warning": str(exc),
                }
            )
        return Response({"error": str(exc)}, status=http_status.HTTP_400_BAD_REQUEST)


# ---------------------------------------------------------------------------
# Automations Views
# ---------------------------------------------------------------------------


def _serialize_automation(a: ThreadsAutomation) -> dict:
    return {
        "id": a.id,
        "name": a.name,
        "type": a.type,
        "enabled": a.enabled,
        "interval_hours": a.interval_hours,
        "configuration": a.configuration,
        "last_run_at": a.last_run_at.isoformat() if a.last_run_at else None,
        "next_run_at": a.next_run_at.isoformat() if a.next_run_at else None,
        "last_status": a.last_status,
        "failure_count": a.failure_count,
        "created_at": a.created_at.isoformat(),
    }


@api_view(["GET", "POST"])
def automations(request: Request) -> Response:
    if request.method == "GET":
        return Response([_serialize_automation(a) for a in ThreadsAutomation.objects.all()])

    name = request.data.get("name", "").strip()
    atype = request.data.get("type", "").strip()
    if not name or atype not in _AUTOMATION_TYPES:
        return Response({"error": "Invalid name or automation type."}, status=http_status.HTTP_400_BAD_REQUEST)

    interval_hours = request.data.get("interval_hours", 6)
    try:
        interval_hours = int(interval_hours)
    except ValueError:
        interval_hours = 6

    auto = ThreadsAutomation(
        name=name,
        type=atype,
        enabled=request.data.get("enabled", True),
        interval_hours=interval_hours,
        configuration=request.data.get("configuration", {}),
    )
    auto.next_run_at = compute_next_run_at(auto)
    auto.save()
    return Response(_serialize_automation(auto), status=http_status.HTTP_201_CREATED)


@api_view(["GET", "PATCH", "DELETE"])
def automation_detail(request: Request, automation_id: int) -> Response:
    try:
        auto = ThreadsAutomation.objects.get(pk=automation_id)
    except ThreadsAutomation.DoesNotExist:
        return Response({"error": "Automation not found."}, status=http_status.HTTP_404_NOT_FOUND)

    if request.method == "GET":
        return Response(_serialize_automation(auto))

    if request.method == "DELETE":
        auto.delete()
        return Response(status=http_status.HTTP_204_NO_CONTENT)

    if "name" in request.data:
        auto.name = request.data["name"].strip() or auto.name
    if "enabled" in request.data:
        auto.enabled = bool(request.data["enabled"])
    if "interval_hours" in request.data:
        try:
            auto.interval_hours = int(request.data["interval_hours"])
        except ValueError:
            pass

    auto.next_run_at = compute_next_run_at(auto)
    auto.save()
    return Response(_serialize_automation(auto))


@api_view(["POST"])
def automation_run_now(_request: Request, automation_id: int) -> Response:
    success = run_automation_now(automation_id)
    if not success:
        return Response({"error": "Could not execute automation."}, status=http_status.HTTP_400_BAD_REQUEST)
    return Response({"triggered": True})


@api_view(["GET"])
def automation_runs(request: Request) -> Response:
    qs = ThreadsAutomationRun.objects.all()
    auto_id = request.query_params.get("automation_id")
    if auto_id:
        qs = qs.filter(automation_id=auto_id)
    runs = [
        {
            "id": r.id,
            "automation_id": r.automation_id,
            "automation_name": r.automation.name if r.automation else "",
            "started_at": r.started_at.isoformat(),
            "finished_at": r.finished_at.isoformat() if r.finished_at else None,
            "status": r.status,
            "detail": r.detail,
            "error_message": r.error_message,
        }
        for r in qs[:AUTOMATION_RUNS_LIMIT]
    ]
    return Response(runs)
