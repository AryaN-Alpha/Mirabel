import secrets

from django.conf import settings
from django.http import HttpRequest, HttpResponse, HttpResponseRedirect
from rest_framework.decorators import api_view
from rest_framework.request import Request
from rest_framework.response import Response

from linkedin.models import LinkedInCredential, LinkedInDraft
from linkedin.services import client, oauth
from linkedin.services.generation import generate_comment_reply, generate_post
from linkedin.services.oauth import LinkedInError

MAX_POST_LENGTH = 3000
MAX_PROMPT_LENGTH = 2000
MAX_COMMENT_LENGTH = 1250
SESSION_STATE_KEY = "linkedin_oauth_state"

_STATUS_FOR_REASON = {"rate_limited": 429, "token_expired": 401, "insufficient_scope": 403}


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
        urn = _publish(body=draft.body, visibility=draft.visibility, link_url=draft.link_url, image_field=draft.image)
    except LinkedInError as exc:
        return Response({"error": str(exc), "reason": exc.reason}, status=_status_for(exc))

    draft.status = LinkedInDraft.Status.PUBLISHED
    draft.linkedin_post_urn = urn
    draft.save()
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
        urn = _publish(body=body, visibility=visibility, link_url=link_url, image_field=None)
    except LinkedInError as exc:
        return Response({"error": str(exc), "reason": exc.reason}, status=_status_for(exc))
    return Response({"published": True, "post_urn": urn})


def _publish(*, body: str, visibility: str, link_url: str, image_field) -> str:
    token = oauth.get_active_access_token()
    cred = LinkedInCredential.current()
    image_urn = None
    if image_field:
        upload = client.initialize_image_upload(token, cred.member_urn)
        image_field.open("rb")
        try:
            client.upload_image_binary(upload["uploadUrl"], token, image_field.read())
        finally:
            image_field.close()
        image_urn = upload["image"]
    return client.create_post(
        token,
        author_urn=cred.member_urn,
        commentary=body,
        visibility=visibility,
        image_urn=image_urn,
        link_url=link_url or None,
    )


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
