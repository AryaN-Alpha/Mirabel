import secrets
from datetime import date

from django.conf import settings
from django.http import HttpRequest, HttpResponse, HttpResponseRedirect
from django.utils import timezone
from rest_framework.decorators import api_view
from rest_framework.request import Request
from rest_framework.response import Response

from classroom.models import ClassroomCredential, ClassroomSubmissionDraft
from classroom.services import client, drive_client, oauth
from classroom.services.oauth import ClassroomError
from classroom.services.solver import solve_coursework

MAX_ANSWER_LENGTH = 20000
SESSION_STATE_KEY = "classroom_oauth_state"
_STATUS_FOR_REASON = {
    "rate_limited": 429,
    "token_expired": 401,
    "insufficient_scope": 403,
    "not_connected": 401,
}

_SUPPORTED_WORK_TYPES = {
    ClassroomSubmissionDraft.WorkType.ASSIGNMENT,
    ClassroomSubmissionDraft.WorkType.SHORT_ANSWER_QUESTION,
}


def _status_for(exc: ClassroomError) -> int:
    return _STATUS_FOR_REASON.get(exc.reason, 400)


def auth_start(request: HttpRequest) -> HttpResponse:
    state = secrets.token_urlsafe(24)
    request.session[SESSION_STATE_KEY] = state
    try:
        url = oauth.get_auth_url(state)
    except ClassroomError as exc:
        return HttpResponseRedirect(
            f"{settings.FRONTEND_URL}/home/classroom?error={exc}"
        )
    return HttpResponseRedirect(url)


def auth_callback(request: HttpRequest) -> HttpResponse:
    expected_state = request.session.pop(SESSION_STATE_KEY, None)
    got_state = request.GET.get("state")
    if not expected_state or expected_state != got_state:
        return HttpResponseRedirect(
            f"{settings.FRONTEND_URL}/home/classroom?error=Invalid+OAuth+state"
        )

    code = request.GET.get("code")
    if not code:
        return HttpResponseRedirect(
            f"{settings.FRONTEND_URL}/home/classroom?error=No+authorization+code+returned"
        )

    try:
        result = oauth.exchange_code_for_token(code)
        cred = ClassroomCredential.current()
        oauth.save_token_result(cred, result)
        userinfo = oauth.fetch_userinfo(cred.get_access_token())
        oauth.save_profile(cred, userinfo)
        cred.save()
    except ClassroomError as exc:
        return HttpResponseRedirect(
            f"{settings.FRONTEND_URL}/home/classroom?error={exc}"
        )

    return HttpResponseRedirect(f"{settings.FRONTEND_URL}/home/classroom?connected=1")


@api_view(["GET"])
def status(_request: Request) -> Response:
    cred = ClassroomCredential.current()
    return Response(
        {
            "connected": cred.is_connected,
            "expired": cred.is_connected
            and cred.is_expired
            and not cred.get_refresh_token(),
            "name": cred.name,
            "email": cred.email,
            "picture_url": cred.picture_url,
            "scope": cred.scope,
            "token_expires_at": cred.token_expires_at,
        }
    )


@api_view(["POST"])
def disconnect(_request: Request) -> Response:
    cred = ClassroomCredential.current()
    cred.clear_tokens()
    cred.save()
    return Response({"connected": False})


@api_view(["GET"])
def list_courses_view(_request: Request) -> Response:
    try:
        token = oauth.get_active_access_token()
        courses = client.list_courses(token)
    except ClassroomError as exc:
        return Response(
            {"error": str(exc), "reason": exc.reason}, status=_status_for(exc)
        )
    return Response({"courses": courses})


@api_view(["GET"])
def list_coursework_view(request: Request) -> Response:
    date_param = request.query_params.get("date")
    on_date = None
    if date_param:
        try:
            on_date = date.fromisoformat(date_param)
        except ValueError:
            return Response({"error": "date must be in YYYY-MM-DD format"}, status=400)

    try:
        token = oauth.get_active_access_token()
        coursework = client.get_upcoming_or_dated_coursework(token, on_date=on_date)
    except ClassroomError as exc:
        return Response(
            {"error": str(exc), "reason": exc.reason}, status=_status_for(exc)
        )
    return Response({"coursework": coursework})


@api_view(["GET"])
def coursework_detail(
    _request: Request, course_id: str, coursework_id: str
) -> Response:
    try:
        token = oauth.get_active_access_token()
        detail = client.get_coursework(token, course_id, coursework_id)
    except ClassroomError as exc:
        return Response(
            {"error": str(exc), "reason": exc.reason}, status=_status_for(exc)
        )

    attachment_text = ""
    for material in detail.get("materials", []):
        drive_file = material.get("driveFile", {}).get("driveFile")
        if drive_file and drive_file.get("id"):
            attachment_text = drive_client.export_doc_as_text(token, drive_file["id"])
            if attachment_text:
                break

    detail["attachment_text"] = attachment_text
    return Response(detail)


def _serialize_draft(draft: ClassroomSubmissionDraft) -> dict:
    return {
        "id": draft.id,
        "course_id": draft.course_id,
        "course_name": draft.course_name,
        "coursework_id": draft.coursework_id,
        "coursework_title": draft.coursework_title,
        "work_type": draft.work_type,
        "due_date": draft.due_date,
        "answer_text": draft.answer_text,
        "solution_doc_url": draft.solution_doc_url,
        "status": draft.status,
        "google_turned_in_at": draft.google_turned_in_at,
        "created_at": draft.created_at,
        "updated_at": draft.updated_at,
    }


@api_view(["POST"])
def solve_view(request: Request) -> Response:
    course_id = (request.data.get("course_id") or "").strip()
    coursework_id = (request.data.get("coursework_id") or "").strip()
    if not course_id or not coursework_id:
        return Response(
            {"error": "course_id and coursework_id are required"}, status=400
        )

    try:
        token = oauth.get_active_access_token()
        coursework = client.get_coursework(token, course_id, coursework_id)
    except ClassroomError as exc:
        return Response(
            {"error": str(exc), "reason": exc.reason}, status=_status_for(exc)
        )

    work_type = coursework.get("workType", "")
    if work_type not in _SUPPORTED_WORK_TYPES:
        return Response(
            {
                "error": f"Solving {work_type} coursework isn't supported yet.",
                "reason": "unsupported_work_type",
            },
            status=400,
        )

    try:
        submissions = client.list_student_submissions(token, course_id, coursework_id)
    except ClassroomError as exc:
        return Response(
            {"error": str(exc), "reason": exc.reason}, status=_status_for(exc)
        )
    if not submissions:
        return Response(
            {"error": "No submission found for this coursework."}, status=404
        )
    submission_id = submissions[0]["id"]

    attachment_text = ""
    for material in coursework.get("materials", []):
        drive_file = material.get("driveFile", {}).get("driveFile")
        if drive_file and drive_file.get("id"):
            attachment_text = drive_client.export_doc_as_text(token, drive_file["id"])
            if attachment_text:
                break

    course_name = coursework.get("course_name", "")
    result = solve_coursework(
        coursework=coursework, course_name=course_name, attachment_text=attachment_text
    )
    if result["error"]:
        return Response(
            {"error": "Couldn't generate a solution.", "reason": result["reason"]},
            status=502,
        )

    due = client.parse_due_datetime(coursework)
    draft = ClassroomSubmissionDraft.objects.create(
        course_id=course_id,
        course_name=course_name,
        coursework_id=coursework_id,
        coursework_title=coursework.get("title", ""),
        work_type=work_type,
        due_date=due,
        google_submission_id=submission_id,
        answer_text=result["text"],
        status=ClassroomSubmissionDraft.Status.DRAFT,
    )
    return Response(_serialize_draft(draft), status=201)


@api_view(["GET"])
def drafts(_request: Request) -> Response:
    items = ClassroomSubmissionDraft.objects.all()
    return Response({"drafts": [_serialize_draft(d) for d in items]})


@api_view(["GET", "PUT", "DELETE"])
def draft_detail(request: Request, draft_id: int) -> Response:
    try:
        draft = ClassroomSubmissionDraft.objects.get(pk=draft_id)
    except ClassroomSubmissionDraft.DoesNotExist:
        return Response({"error": "draft not found"}, status=404)

    if request.method == "GET":
        return Response(_serialize_draft(draft))

    if request.method == "DELETE":
        draft.delete()
        return Response({"deleted": True})

    if draft.status == ClassroomSubmissionDraft.Status.TURNED_IN:
        return Response(
            {"error": "This draft has already been turned in and can't be edited."},
            status=400,
        )

    answer_text = request.data.get("answer_text")
    if answer_text is not None:
        if len(answer_text) > MAX_ANSWER_LENGTH:
            return Response(
                {"error": f"answer_text must be under {MAX_ANSWER_LENGTH} characters"},
                status=400,
            )
        draft.answer_text = answer_text
    draft.save()
    return Response(_serialize_draft(draft))


@api_view(["POST"])
def turn_in_view(_request: Request, draft_id: int) -> Response:
    try:
        draft = ClassroomSubmissionDraft.objects.get(pk=draft_id)
    except ClassroomSubmissionDraft.DoesNotExist:
        return Response({"error": "draft not found"}, status=404)

    if draft.status == ClassroomSubmissionDraft.Status.TURNED_IN:
        return Response({"error": "This draft has already been turned in."}, status=400)
    if not draft.answer_text.strip():
        return Response({"error": "Can't turn in an empty answer."}, status=400)

    try:
        token = oauth.get_active_access_token()
        if draft.work_type == ClassroomSubmissionDraft.WorkType.SHORT_ANSWER_QUESTION:
            client.patch_short_answer(
                token,
                draft.course_id,
                draft.coursework_id,
                draft.google_submission_id,
                draft.answer_text,
            )
        else:
            file_id, web_view_link = drive_client.create_solution_doc(
                token,
                title=draft.coursework_title or "Solution",
                body_text=draft.answer_text,
            )
            client.patch_assignment_attachments(
                token,
                draft.course_id,
                draft.coursework_id,
                draft.google_submission_id,
                file_id,
            )
            draft.solution_doc_id = file_id
            draft.solution_doc_url = web_view_link

        client.turn_in(
            token, draft.course_id, draft.coursework_id, draft.google_submission_id
        )
    except ClassroomError as exc:
        return Response(
            {"error": str(exc), "reason": exc.reason}, status=_status_for(exc)
        )

    draft.status = ClassroomSubmissionDraft.Status.TURNED_IN
    draft.google_turned_in_at = timezone.now()
    draft.save()
    return Response(_serialize_draft(draft))
