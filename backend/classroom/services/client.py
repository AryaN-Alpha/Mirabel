from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timezone as dt_timezone

import requests

from classroom.services.oauth import ClassroomError, error_detail, reason_for_status

API_BASE = "https://classroom.googleapis.com/v1"
_TIMEOUT = 15


def _headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _raise_for_response(resp: requests.Response) -> None:
    if not resp.ok:
        raise ClassroomError(
            error_detail(resp), reason=reason_for_status(resp.status_code)
        )


def _get(token: str, path: str, params: dict | None = None) -> dict:
    try:
        resp = requests.get(
            f"{API_BASE}{path}",
            headers=_headers(token),
            params=params,
            timeout=_TIMEOUT,
        )
    except requests.RequestException as exc:
        raise ClassroomError(f"Couldn't reach Google Classroom: {exc}") from exc
    _raise_for_response(resp)
    return resp.json() if resp.content else {}


def _post(token: str, path: str, body: dict | None = None) -> dict:
    try:
        resp = requests.post(
            f"{API_BASE}{path}",
            headers=_headers(token),
            json=body or {},
            timeout=_TIMEOUT,
        )
    except requests.RequestException as exc:
        raise ClassroomError(f"Couldn't reach Google Classroom: {exc}") from exc
    _raise_for_response(resp)
    return resp.json() if resp.content else {}


def _patch(token: str, path: str, params: dict, body: dict) -> dict:
    try:
        resp = requests.patch(
            f"{API_BASE}{path}",
            headers=_headers(token),
            params=params,
            json=body,
            timeout=_TIMEOUT,
        )
    except requests.RequestException as exc:
        raise ClassroomError(f"Couldn't reach Google Classroom: {exc}") from exc
    _raise_for_response(resp)
    return resp.json() if resp.content else {}


def _list_all(
    token: str, path: str, key: str, params: dict | None = None
) -> list[dict]:
    """Classroom API paginates every list endpoint via pageToken — loop until absent."""
    items: list[dict] = []
    page_token = None
    while True:
        query = dict(params or {})
        if page_token:
            query["pageToken"] = page_token
        data = _get(token, path, query)
        items.extend(data.get(key, []))
        page_token = data.get("nextPageToken")
        if not page_token:
            return items


def list_courses(token: str) -> list[dict]:
    """Courses the caller is enrolled in as a student (not teaching)."""
    return _list_all(
        token, "/courses", "courses", {"studentId": "me", "courseStates": "ACTIVE"}
    )


def list_coursework(token: str, course_id: str) -> list[dict]:
    return _list_all(
        token,
        f"/courses/{course_id}/courseWork",
        "courseWork",
        {"courseWorkStates": "PUBLISHED"},
    )


def get_coursework(token: str, course_id: str, coursework_id: str) -> dict:
    return _get(token, f"/courses/{course_id}/courseWork/{coursework_id}")


def list_student_submissions(
    token: str, course_id: str, coursework_id: str
) -> list[dict]:
    return _list_all(
        token,
        f"/courses/{course_id}/courseWork/{coursework_id}/studentSubmissions",
        "studentSubmissions",
        {"userId": "me"},
    )


def patch_short_answer(
    token: str, course_id: str, coursework_id: str, submission_id: str, answer_text: str
) -> dict:
    path = f"/courses/{course_id}/courseWork/{coursework_id}/studentSubmissions/{submission_id}"
    return _patch(
        token,
        path,
        {"updateMask": "shortAnswerSubmission.answer"},
        {"shortAnswerSubmission": {"answer": answer_text}},
    )


def patch_assignment_attachments(
    token: str,
    course_id: str,
    coursework_id: str,
    submission_id: str,
    drive_file_id: str,
) -> None:
    path = f"/courses/{course_id}/courseWork/{coursework_id}/studentSubmissions/{submission_id}:modifyAttachments"
    _post(token, path, {"addAttachments": [{"driveFile": {"id": drive_file_id}}]})


def turn_in(token: str, course_id: str, coursework_id: str, submission_id: str) -> None:
    path = f"/courses/{course_id}/courseWork/{coursework_id}/studentSubmissions/{submission_id}:turnIn"
    _post(token, path)


# --- Cross-course aggregation (service layer — Classroom has no single
# endpoint that returns coursework across all courses filtered/sorted by date) ---


def parse_due_datetime(item: dict) -> datetime | None:
    due = item.get("dueDate")
    if not due:
        return None
    due_time = item.get("dueTime") or {}
    return datetime(
        due.get("year", 1970),
        due.get("month", 1),
        due.get("day", 1),
        due_time.get("hours", 23),
        due_time.get("minutes", 59),
        tzinfo=dt_timezone.utc,
    )


def _coursework_for_course(token: str, course: dict) -> list[dict]:
    course_id = course["id"]
    course_name = course.get("name", "")
    results = []
    for item in list_coursework(token, course_id):
        if item.get("workType") == "MATERIAL":
            continue
        item = dict(item)
        item["course_id"] = course_id
        item["course_name"] = course_name
        item["due_datetime"] = parse_due_datetime(item)
        results.append(item)
    return results


def get_courses_with_coursework(token: str) -> list[dict]:
    """Fans out list_courses -> list_coursework per course, annotating each
    coursework item with its parent course_id/course_name and a parsed
    due_datetime. Filters out workType=MATERIAL (no submission possible).

    Each course's coursework is fetched concurrently — sequentially this was
    one blocking Google API round-trip per course (~2s each), making the
    "next due assignment" load take ~10s for a student in 5 courses."""
    courses = list_courses(token)
    if not courses:
        return []
    with ThreadPoolExecutor(max_workers=min(len(courses), 8)) as pool:
        per_course = list(pool.map(lambda course: _coursework_for_course(token, course), courses))
    return [item for course_items in per_course for item in course_items]


def get_upcoming_or_dated_coursework(
    token: str, *, on_date: date | None = None
) -> list[dict]:
    """If on_date is given: coursework items due that calendar date, across
    all active courses. If on_date is None: the single nearest-upcoming item
    (due_datetime >= now), falling back to the most recently created item
    with no/past due date if nothing is upcoming."""
    items = get_courses_with_coursework(token)

    if on_date is not None:
        return [
            item
            for item in items
            if item["due_datetime"] and item["due_datetime"].date() == on_date
        ]

    now = datetime.now(dt_timezone.utc)
    upcoming = sorted(
        (
            item
            for item in items
            if item["due_datetime"] and item["due_datetime"] >= now
        ),
        key=lambda item: item["due_datetime"],
    )
    if upcoming:
        return [upcoming[0]]

    by_created = sorted(
        items, key=lambda item: item.get("creationTime", ""), reverse=True
    )
    return by_created[:1]
