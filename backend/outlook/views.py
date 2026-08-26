import secrets

from django.conf import settings
from django.http import HttpRequest, HttpResponse, HttpResponseRedirect
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework.decorators import api_view
from rest_framework.request import Request
from rest_framework.response import Response

from outlook.models import OutlookCredential, ScheduledEmail
from outlook.services import graph_client, oauth
from outlook.services.email_ai import generate_compose_draft, generate_reply_draft
from outlook.services.oauth import OutlookError

MAX_PROMPT_LENGTH = 2000
MAX_REPLY_LENGTH = 20000
SESSION_STATE_KEY = "outlook_oauth_state"
INBOX_PAGE_SIZE = 10


def auth_start(request: HttpRequest) -> HttpResponse:
    state = secrets.token_urlsafe(24)
    request.session[SESSION_STATE_KEY] = state
    try:
        url = oauth.get_auth_url(state)
    except OutlookError as exc:
        return HttpResponseRedirect(f"{settings.FRONTEND_URL}/home/outlook?error={exc}")
    return HttpResponseRedirect(url)


def auth_callback(request: HttpRequest) -> HttpResponse:
    expected_state = request.session.pop(SESSION_STATE_KEY, None)
    got_state = request.GET.get("state")
    if not expected_state or expected_state != got_state:
        return HttpResponseRedirect(f"{settings.FRONTEND_URL}/home/outlook?error=Invalid+OAuth+state")

    code = request.GET.get("code")
    if not code:
        return HttpResponseRedirect(f"{settings.FRONTEND_URL}/home/outlook?error=No+authorization+code+returned")

    try:
        result = oauth.exchange_code_for_token(code)
        cred = OutlookCredential.current()
        oauth.save_token_result(cred, result)
        me = graph_client.get_me(cred.get_access_token())
        cred.account_email = me.get("mail") or me.get("userPrincipalName") or ""
        cred.save()
    except OutlookError as exc:
        return HttpResponseRedirect(f"{settings.FRONTEND_URL}/home/outlook?error={exc}")

    return HttpResponseRedirect(f"{settings.FRONTEND_URL}/home/outlook?connected=1")


@api_view(["GET"])
def status(_request: Request) -> Response:
    cred = OutlookCredential.current()
    return Response(
        {
            "connected": cred.is_connected,
            "account_email": cred.account_email,
            "has_signature": bool(cred.signature.strip()),
            "default_domain": settings.OUTLOOK_ALLOWED_SENDER_DOMAIN,
        }
    )


@api_view(["POST"])
def disconnect(_request: Request) -> Response:
    cred = OutlookCredential.current()
    cred.clear_tokens()
    cred.save()
    return Response({"connected": False, "account_email": "", "has_signature": bool(cred.signature.strip())})


@api_view(["GET", "PUT"])
def signature(request: Request) -> Response:
    cred = OutlookCredential.current()
    if request.method == "GET":
        return Response({"signature": cred.signature})

    cred.signature = (request.data.get("signature") or "").strip()
    cred.save()
    return Response({"signature": cred.signature})


@api_view(["GET"])
def inbox(request: Request) -> Response:
    domain = (request.query_params.get("domain") or "").strip()
    sender = (request.query_params.get("sender") or "").strip()
    try:
        page = int(request.query_params.get("page") or 1)
    except ValueError:
        page = 1
    page = max(page, 1)
    skip = (page - 1) * INBOX_PAGE_SIZE

    try:
        token = oauth.get_valid_access_token()
        messages = graph_client.list_inbox_messages(
            token, domain=domain or None, sender=sender or None, top=INBOX_PAGE_SIZE + 1, skip=skip
        )
    except OutlookError as exc:
        return Response({"error": str(exc)}, status=400)

    has_more = len(messages) > INBOX_PAGE_SIZE
    return Response({"messages": messages[:INBOX_PAGE_SIZE], "page": page, "has_more": has_more})


@api_view(["GET"])
def message_detail(_request: Request, message_id: str) -> Response:
    try:
        token = oauth.get_valid_access_token()
        message = graph_client.get_message(token, message_id)
        conversation_id = message.get("conversationId")
        thread = graph_client.list_conversation_messages(token, conversation_id) if conversation_id else []
    except OutlookError as exc:
        return Response({"error": str(exc)}, status=400)

    if not thread:
        thread = [message]

    account_email = (OutlookCredential.current().account_email or "").lower()
    for item in thread:
        sender_address = item.get("from", {}).get("emailAddress", {}).get("address", "")
        item["is_from_me"] = sender_address.lower() == account_email

    message["thread"] = thread
    return Response(message)


@api_view(["POST"])
def reply_message(request: Request, message_id: str) -> Response:
    comment = (request.data.get("comment") or "").strip()
    if not comment:
        return Response({"error": "comment is required"}, status=400)
    if len(comment) > MAX_REPLY_LENGTH:
        return Response({"error": f"comment must be under {MAX_REPLY_LENGTH} characters"}, status=400)

    try:
        token = oauth.get_valid_access_token()
        graph_client.reply_to_message(token, message_id, comment)
    except OutlookError as exc:
        return Response({"error": str(exc)}, status=400)
    return Response({"sent": True})


@api_view(["POST"])
def generate_reply(request: Request, message_id: str) -> Response:
    instructions = (request.data.get("instructions") or "").strip()
    if len(instructions) > MAX_PROMPT_LENGTH:
        return Response({"error": f"instructions must be under {MAX_PROMPT_LENGTH} characters"}, status=400)

    try:
        token = oauth.get_valid_access_token()
        message = graph_client.get_message(token, message_id, prefer_text=True)
    except OutlookError as exc:
        return Response({"error": str(exc)}, status=400)

    sender = message.get("from", {}).get("emailAddress", {}).get("address", "unknown sender")
    result = generate_reply_draft(
        original_subject=message.get("subject", ""),
        original_sender=sender,
        original_body_text=message.get("body", {}).get("content", ""),
        instructions=instructions,
    )
    return Response(result)


@api_view(["POST"])
def send_new_message(request: Request) -> Response:
    to = request.data.get("to") or []
    if isinstance(to, str):
        to = [to]
    subject = (request.data.get("subject") or "").strip()
    body = (request.data.get("body") or "").strip()
    if not to:
        return Response({"error": "to is required"}, status=400)
    if not subject:
        return Response({"error": "subject is required"}, status=400)
    if not body:
        return Response({"error": "body is required"}, status=400)
    if len(body) > MAX_REPLY_LENGTH:
        return Response({"error": f"body must be under {MAX_REPLY_LENGTH} characters"}, status=400)

    try:
        token = oauth.get_valid_access_token()
        graph_client.send_mail(token, subject=subject, body_html=body, to_recipients=to)
    except OutlookError as exc:
        return Response({"error": str(exc)}, status=400)
    return Response({"sent": True})


@api_view(["POST"])
def generate_compose(request: Request) -> Response:
    prompt = (request.data.get("prompt") or "").strip()
    if not prompt:
        return Response({"error": "prompt is required"}, status=400)
    if len(prompt) > MAX_PROMPT_LENGTH:
        return Response({"error": f"prompt must be under {MAX_PROMPT_LENGTH} characters"}, status=400)

    result = generate_compose_draft(prompt=prompt)
    return Response(result)


def _serialize_scheduled(email: ScheduledEmail) -> dict:
    return {
        "id": email.id,
        "to": email.to,
        "subject": email.subject,
        "send_at": email.send_at,
        "status": email.status,
        "error_message": email.error_message,
    }


@api_view(["POST"])
def schedule_message(request: Request) -> Response:
    to = request.data.get("to") or []
    if isinstance(to, str):
        to = [to]
    subject = (request.data.get("subject") or "").strip()
    body = (request.data.get("body") or "").strip()
    if not to:
        return Response({"error": "to is required"}, status=400)
    if not subject:
        return Response({"error": "subject is required"}, status=400)
    if not body:
        return Response({"error": "body is required"}, status=400)
    if len(body) > MAX_REPLY_LENGTH:
        return Response({"error": f"body must be under {MAX_REPLY_LENGTH} characters"}, status=400)

    send_at_raw = request.data.get("send_at")
    send_at = parse_datetime(send_at_raw) if send_at_raw else None
    if send_at is None:
        return Response({"error": "send_at must be a valid ISO datetime"}, status=400)
    if timezone.is_naive(send_at):
        send_at = timezone.make_aware(send_at)
    if send_at <= timezone.now():
        return Response({"error": "send_at must be in the future"}, status=400)

    email = ScheduledEmail.objects.create(to=to, subject=subject, body_html=body, send_at=send_at)
    return Response(_serialize_scheduled(email), status=201)


@api_view(["GET"])
def list_scheduled(_request: Request) -> Response:
    emails = ScheduledEmail.objects.exclude(status=ScheduledEmail.STATUS_CANCELLED)
    return Response({"scheduled": [_serialize_scheduled(e) for e in emails]})


@api_view(["DELETE"])
def cancel_scheduled(_request: Request, scheduled_id: int) -> Response:
    try:
        email = ScheduledEmail.objects.get(pk=scheduled_id, status=ScheduledEmail.STATUS_PENDING)
    except ScheduledEmail.DoesNotExist:
        return Response({"error": "Scheduled email not found or already resolved."}, status=404)
    email.status = ScheduledEmail.STATUS_CANCELLED
    email.save()
    return Response({"cancelled": True})
