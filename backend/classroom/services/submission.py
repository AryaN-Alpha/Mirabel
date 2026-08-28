"""Turn-in orchestration — extracted from classroom/views.py::turn_in_view so
the same commit sequence is reusable by both the REST views and the agent
tools (agent/tools/classroom_tools.py).
"""

from __future__ import annotations

from django.utils import timezone

from classroom.models import ClassroomSubmissionDraft
from classroom.services import client, drive_client, oauth


def turn_in_submission(draft: ClassroomSubmissionDraft) -> None:
    """Turn in an already-drafted submission to real Google Classroom.

    Mutates and saves draft in place (status, google_turned_in_at, and for
    ASSIGNMENT work items solution_doc_id/solution_doc_url). Raises
    ClassroomError on any failure — draft is left unsaved (still "draft") if
    it raises before the final save, matching the pre-extraction behavior.
    """
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

    client.turn_in(token, draft.course_id, draft.coursework_id, draft.google_submission_id)

    draft.status = ClassroomSubmissionDraft.Status.TURNED_IN
    draft.google_turned_in_at = timezone.now()
    draft.save()
