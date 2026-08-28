"""Classroom tools. Reading courses/coursework and drafting an AI answer are
safe (solve_classroom_coursework only stages a ClassroomSubmissionDraft).
turn_in_classroom_assignment is sensitive — it pauses the agent run for
human approval before actually submitting anything to real Google Classroom."""

from __future__ import annotations

from langchain_core.tools import tool

from agent.tools._common import rejected_message, require_confirmation
from classroom.models import ClassroomCredential, ClassroomSubmissionDraft
from classroom.services import client, drive_client, oauth, submission
from classroom.services.oauth import ClassroomError
from classroom.services.solver import solve_coursework as _solve_coursework

_SUPPORTED_WORK_TYPES = {
    ClassroomSubmissionDraft.WorkType.ASSIGNMENT,
    ClassroomSubmissionDraft.WorkType.SHORT_ANSWER_QUESTION,
}


@tool
def check_classroom_connection() -> dict:
    """Check whether a Google Classroom account is connected. Call this first if you're
    unsure — every other Classroom tool will fail if not connected."""
    cred = ClassroomCredential.current()
    return {"connected": cred.is_connected, "email": cred.email}


@tool
def list_classroom_courses() -> dict:
    """List the student's active Google Classroom courses."""
    try:
        token = oauth.get_active_access_token()
        courses = client.list_courses(token)
    except ClassroomError as exc:
        return {"error": str(exc)}
    return {"courses": [{"id": c["id"], "name": c.get("name", "")} for c in courses]}


@tool
def list_classroom_coursework(course_id: str) -> dict:
    """List coursework/assignments for one Classroom course.

    Args:
        course_id: The course's id (see list_classroom_courses).
    """
    try:
        token = oauth.get_active_access_token()
        coursework = client.list_coursework(token, course_id)
    except ClassroomError as exc:
        return {"error": str(exc)}
    return {
        "coursework": [
            {"id": cw["id"], "title": cw.get("title", ""), "workType": cw.get("workType", "")} for cw in coursework
        ]
    }


@tool
def solve_classroom_coursework(course_id: str, coursework_id: str, extra_instructions: str = "") -> dict:
    """Use AI to draft an answer to a Classroom assignment or short-answer question, saved as
    a submission draft for review. Does NOT turn anything in — use turn_in_classroom_assignment
    (which requires human approval) for that.

    Args:
        course_id: The course's id (see list_classroom_courses).
        coursework_id: The coursework's id (see list_classroom_coursework).
        extra_instructions: Optional extra guidance for the AI answer.
    """
    try:
        token = oauth.get_active_access_token()
        coursework = client.get_coursework(token, course_id, coursework_id)
    except ClassroomError as exc:
        return {"error": str(exc)}

    work_type = coursework.get("workType", "")
    if work_type not in _SUPPORTED_WORK_TYPES:
        return {"error": f"Solving {work_type} coursework isn't supported."}

    try:
        submissions = client.list_student_submissions(token, course_id, coursework_id)
    except ClassroomError as exc:
        return {"error": str(exc)}
    if not submissions:
        return {"error": "No submission found for this coursework."}

    attachment_text = ""
    for material in coursework.get("materials", []):
        drive_file = material.get("driveFile", {}).get("driveFile")
        if drive_file and drive_file.get("id"):
            attachment_text = drive_client.export_doc_as_text(token, drive_file["id"])
            if attachment_text:
                break

    result = _solve_coursework(
        coursework=coursework, course_name="", attachment_text=attachment_text, extra_instructions=extra_instructions
    )
    if result["error"]:
        return {"error": "Couldn't generate a solution.", "reason": result["reason"]}

    due = client.parse_due_datetime(coursework)
    draft = ClassroomSubmissionDraft.objects.create(
        course_id=course_id,
        coursework_id=coursework_id,
        coursework_title=coursework.get("title", ""),
        coursework_description=coursework.get("description", ""),
        attachment_text=attachment_text,
        work_type=work_type,
        due_date=due,
        google_submission_id=submissions[0]["id"],
        extra_instructions=extra_instructions,
        answer_text=result["text"],
    )
    return {"draft_id": draft.id, "answer_text": draft.answer_text, "status": draft.status}


@tool
def list_classroom_drafts() -> dict:
    """List drafted (not-yet-turned-in) Classroom submission answers."""
    drafts = ClassroomSubmissionDraft.objects.filter(status=ClassroomSubmissionDraft.Status.DRAFT)
    return {
        "drafts": [
            {"id": d.id, "coursework_title": d.coursework_title, "answer_text": d.answer_text} for d in drafts
        ]
    }


@tool
def turn_in_classroom_assignment(draft_id: int) -> dict:
    """Turn in a drafted Classroom submission to real Google Classroom — this actually
    submits the assignment for grading. IRREVERSIBLE — calling this pauses the run to ask
    the human for approval first. If they reject it, nothing is submitted; say so plainly,
    don't retry.

    Args:
        draft_id: The submission draft's id (see list_classroom_drafts / solve_classroom_coursework).
    """
    try:
        draft = ClassroomSubmissionDraft.objects.get(pk=draft_id, status=ClassroomSubmissionDraft.Status.DRAFT)
    except ClassroomSubmissionDraft.DoesNotExist:
        return {"error": f"No un-submitted Classroom draft with id {draft_id}."}
    if not draft.answer_text.strip():
        return {"error": "Can't turn in an empty answer."}

    summary = f'Turn in "{draft.coursework_title}" to Google Classroom'
    decision = require_confirmation(
        tool="turn_in_classroom_assignment", summary=summary, args={"draft_id": draft_id}
    )
    if not decision["approved"]:
        return {"turned_in": False, "message": rejected_message(summary)}

    try:
        submission.turn_in_submission(draft)
    except ClassroomError as exc:
        return {"turned_in": False, "error": str(exc)}
    return {"turned_in": True}


TOOLS = [
    check_classroom_connection,
    list_classroom_courses,
    list_classroom_coursework,
    solve_classroom_coursework,
    list_classroom_drafts,
    turn_in_classroom_assignment,
]
