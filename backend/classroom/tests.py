import os
from datetime import date, datetime, timedelta, timezone as dt_timezone
from unittest.mock import Mock, patch

from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APITestCase

from classroom.models import ClassroomCredential, ClassroomSubmissionDraft
from classroom.services import client, drive_client, oauth, submission
from classroom.services.oauth import ClassroomError
from classroom.services.solver import solve_coursework
from core.models import ModelPreference

_ENV_PATCH = {
    "GOOGLE_CLASSROOM_CLIENT_ID": "test-google-id",
    "GOOGLE_CLASSROOM_CLIENT_SECRET": "test-google-secret",
}


def _connected_credential(**overrides) -> ClassroomCredential:
    cred = ClassroomCredential.current()
    cred.set_access_token("initial-access-token")
    cred.set_refresh_token("initial-refresh-token")
    cred.google_sub = "sub-12345"
    cred.email = "student@example.edu"
    cred.name = "Student Name"
    cred.token_expires_at = timezone.now() + timedelta(hours=1)
    for key, value in overrides.items():
        setattr(cred, key, value)
    cred.save()
    return cred


class SolveCourseworkModelSelectionTests(TestCase):
    """Unlike cv/services/tailoring.py and the other short-form generation
    call sites, solving coursework deliberately keeps the user's chosen
    (possibly reasoning-tier) model — see solver.py's _generate docstring —
    but must raise the max_tokens floor so a reasoning model's hidden
    chain-of-thought has room to finish before the visible answer, instead
    of silently exhausting a small default budget."""

    @patch("classroom.services.solver.ModelPreference")
    @patch("classroom.services.solver.get_provider")
    def test_deepseek_model_choice_is_preserved_not_overridden(
        self, mock_get_provider, mock_pref
    ):
        mock_pref.current.return_value = ModelPreference(
            provider="deepseek", model="deepseek-v4-pro"
        )
        mock_get_provider.return_value.generate_text.return_value = (
            "The answer is 42."
        )

        solve_coursework(
            coursework={
                "title": "Problem set 3",
                "description": "Solve for x.",
                "workType": "ASSIGNMENT",
            },
            course_name="Algebra II",
            attachment_text="",
        )

        self.assertEqual(
            mock_get_provider.return_value.generate_text.call_args.kwargs["model"],
            "deepseek-v4-pro",
        )

    @patch("classroom.services.solver.ModelPreference")
    @patch("classroom.services.solver.get_provider")
    def test_max_tokens_floor_gives_hidden_reasoning_room_to_finish(
        self, mock_get_provider, mock_pref
    ):
        pref = ModelPreference(provider="deepseek", model="deepseek-v4-pro")
        pref.max_tokens = 400
        mock_pref.current.return_value = pref
        mock_get_provider.return_value.generate_text.return_value = (
            "The answer is 42."
        )

        solve_coursework(
            coursework={
                "title": "Problem set 3",
                "description": "Solve for x.",
                "workType": "ASSIGNMENT",
            },
            course_name="Algebra II",
            attachment_text="",
        )

        self.assertGreaterEqual(
            mock_get_provider.return_value.generate_text.call_args.kwargs[
                "max_tokens"
            ],
            6000,
        )


class OAuthChokePointAndErrorParsingTests(TestCase):
    """Coverage for token refresh, error parsing from Google APIs, and OAuth helper logic."""

    def test_not_connected_raises_with_reason(self):
        cred = ClassroomCredential.current()
        cred.clear_tokens()
        cred.save()

        with self.assertRaises(ClassroomError) as ctx:
            oauth.get_active_access_token()
        self.assertEqual(ctx.exception.reason, "not_connected")

    @patch.dict(os.environ, _ENV_PATCH)
    @patch("classroom.services.oauth.requests.post")
    def test_expired_token_is_refreshed_and_persisted(self, mock_post):
        _connected_credential(
            token_expires_at=timezone.now() - timedelta(minutes=10)
        )
        mock_post.return_value = Mock(
            ok=True,
            json=Mock(
                return_value={
                    "access_token": "refreshed-access-token",
                    "expires_in": 3600,
                }
            ),
        )

        token = oauth.get_active_access_token()

        self.assertEqual(token, "refreshed-access-token")
        refreshed = ClassroomCredential.current()
        self.assertEqual(refreshed.get_access_token(), "refreshed-access-token")
        self.assertGreater(refreshed.token_expires_at, timezone.now())

    @patch.dict(os.environ, _ENV_PATCH)
    @patch("classroom.services.oauth.requests.post")
    def test_refresh_without_new_refresh_token_keeps_the_old_one(self, mock_post):
        _connected_credential(
            token_expires_at=timezone.now() - timedelta(minutes=10)
        )
        mock_post.return_value = Mock(
            ok=True,
            json=Mock(
                return_value={
                    "access_token": "refreshed-access-token",
                    "expires_in": 3600,
                }
            ),
        )

        oauth.get_active_access_token()

        self.assertEqual(
            ClassroomCredential.current().get_refresh_token(),
            "initial-refresh-token",
        )

    @patch.dict(os.environ, _ENV_PATCH)
    @patch("classroom.services.oauth.requests.post")
    def test_refresh_failure_raises_token_expired(self, mock_post):
        _connected_credential(
            token_expires_at=timezone.now() - timedelta(minutes=10)
        )
        mock_post.return_value = Mock(
            ok=False, status_code=400, json=Mock(return_value={}), text=""
        )

        with self.assertRaises(ClassroomError) as ctx:
            oauth.get_active_access_token()
        self.assertEqual(ctx.exception.reason, "token_expired")

    def test_no_refresh_token_raises_token_expired_without_network_call(self):
        _connected_credential(
            refresh_token="", token_expires_at=timezone.now() - timedelta(minutes=10)
        )

        with self.assertRaises(ClassroomError) as ctx:
            oauth.get_active_access_token()
        self.assertEqual(ctx.exception.reason, "token_expired")

    @patch("classroom.services.oauth.requests.post")
    def test_valid_unexpired_token_is_not_refreshed(self, mock_post):
        _connected_credential(token_expires_at=timezone.now() + timedelta(hours=2))

        token = oauth.get_active_access_token()

        mock_post.assert_not_called()
        self.assertEqual(token, "initial-access-token")

    def test_error_detail_extracts_message_from_google_api_dict(self):
        resp = Mock(
            json=Mock(
                return_value={
                    "error": {
                        "code": 400,
                        "message": "Cannot turn in a submission that is already turned in.",
                        "status": "FAILED_PRECONDITION",
                    }
                }
            )
        )
        self.assertEqual(
            oauth.error_detail(resp),
            "Cannot turn in a submission that is already turned in.",
        )

    def test_error_detail_extracts_oauth_string_error(self):
        resp = Mock(
            json=Mock(
                return_value={
                    "error": "invalid_grant",
                    "error_description": "Token expired or revoked.",
                }
            )
        )
        self.assertEqual(oauth.error_detail(resp), "Token expired or revoked.")

    def test_reason_for_status_mappings(self):
        self.assertEqual(oauth.reason_for_status(401), "token_expired")
        self.assertEqual(oauth.reason_for_status(403), "insufficient_scope")
        self.assertEqual(oauth.reason_for_status(404), "not_found")
        self.assertEqual(oauth.reason_for_status(429), "rate_limited")
        self.assertEqual(oauth.reason_for_status(500), "unknown")

    @patch.dict(os.environ, {"GOOGLE_CLASSROOM_CLIENT_ID": "", "GOOGLE_CLASSROOM_CLIENT_SECRET": ""})
    def test_require_client_credentials_missing_raises_unconfigured(self):
        with self.assertRaises(ClassroomError) as ctx:
            oauth._require_client_credentials()
        self.assertEqual(ctx.exception.reason, "unconfigured")


class ClientServiceTests(TestCase):
    """Tests for classroom client operations, pagination, and error isolation."""

    @patch("classroom.services.client.requests.get")
    def test_get_course_success(self, mock_get):
        mock_get.return_value = Mock(
            ok=True,
            content=b'{"id": "c1", "name": "Calculus I"}',
            json=Mock(return_value={"id": "c1", "name": "Calculus I"}),
        )

        course = client.get_course("token", "c1")
        self.assertEqual(course["name"], "Calculus I")

    @patch("classroom.services.client.requests.get")
    def test_list_courses_with_pagination(self, mock_get):
        mock_get.side_effect = [
            Mock(
                ok=True,
                content=b"{}",
                json=Mock(
                    return_value={
                        "courses": [{"id": "c1", "name": "Physics"}],
                        "nextPageToken": "page-2",
                    }
                ),
            ),
            Mock(
                ok=True,
                content=b"{}",
                json=Mock(
                    return_value={"courses": [{"id": "c2", "name": "Chemistry"}]}
                ),
            ),
        ]

        courses = client.list_courses("token")
        self.assertEqual(len(courses), 2)
        self.assertEqual(courses[0]["id"], "c1")
        self.assertEqual(courses[1]["id"], "c2")

    def test_parse_due_datetime_with_valid_and_null_values(self):
        # Full valid date & time
        item1 = {
            "dueDate": {"year": 2026, "month": 9, "day": 15},
            "dueTime": {"hours": 14, "minutes": 30},
        }
        dt1 = client.parse_due_datetime(item1)
        self.assertEqual(
            dt1, datetime(2026, 9, 15, 14, 30, tzinfo=dt_timezone.utc)
        )

        # Missing dueTime defaults to 23:59
        item2 = {"dueDate": {"year": 2026, "month": 9, "day": 15}}
        dt2 = client.parse_due_datetime(item2)
        self.assertEqual(
            dt2, datetime(2026, 9, 15, 23, 59, tzinfo=dt_timezone.utc)
        )

        # Nulls in dueTime do not raise TypeError
        item3 = {
            "dueDate": {"year": 2026, "month": 9, "day": 15},
            "dueTime": {"hours": None, "minutes": None},
        }
        dt3 = client.parse_due_datetime(item3)
        self.assertEqual(
            dt3, datetime(2026, 9, 15, 23, 59, tzinfo=dt_timezone.utc)
        )

        # No dueDate returns None
        self.assertIsNone(client.parse_due_datetime({}))

    @patch("classroom.services.client.list_courses")
    @patch("classroom.services.client.list_coursework")
    def test_get_courses_with_coursework_tolerates_per_course_failure(
        self, mock_list_coursework, mock_list_courses
    ):
        mock_list_courses.return_value = [
            {"id": "course-1", "name": "Valid Course"},
            {"id": "course-2", "name": "Broken Course"},
        ]

        def coursework_side_effect(token, course_id):
            if course_id == "course-2":
                raise ClassroomError("Course archived", reason="not_found")
            return [
                {
                    "id": "cw-1",
                    "title": "Assignment 1",
                    "workType": "ASSIGNMENT",
                    "dueDate": {"year": 2026, "month": 9, "day": 15},
                }
            ]

        mock_list_coursework.side_effect = coursework_side_effect

        items = client.get_courses_with_coursework("test-token")
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["id"], "cw-1")
        self.assertEqual(items[0]["course_name"], "Valid Course")

    @patch("classroom.services.client.get_courses_with_coursework")
    def test_get_upcoming_or_dated_coursework_filters_by_date(
        self, mock_get_all
    ):
        d1 = datetime(2026, 9, 10, 10, 0, tzinfo=dt_timezone.utc)
        d2 = datetime(2026, 9, 20, 10, 0, tzinfo=dt_timezone.utc)
        mock_get_all.return_value = [
            {"id": "cw-1", "due_datetime": d1},
            {"id": "cw-2", "due_datetime": d2},
        ]

        filtered = client.get_upcoming_or_dated_coursework(
            "tok", on_date=date(2026, 9, 10)
        )
        self.assertEqual(len(filtered), 1)
        self.assertEqual(filtered[0]["id"], "cw-1")


class DriveAndDocsServiceTests(TestCase):
    """Tests for Drive doc export and solution doc generation."""

    @patch("classroom.services.drive_client.requests.get")
    def test_export_doc_as_text_ignores_non_google_docs(self, mock_get):
        mock_get.return_value = Mock(
            ok=True,
            json=Mock(
                return_value={
                    "id": "file-1",
                    "mimeType": "application/pdf",
                    "name": "Doc.pdf",
                }
            ),
        )

        text = drive_client.export_doc_as_text("tok", "file-1")
        self.assertEqual(text, "")

    @patch("classroom.services.drive_client.requests.get")
    def test_export_doc_as_text_exports_google_doc(self, mock_get):
        mock_get.side_effect = [
            Mock(
                ok=True,
                json=Mock(
                    return_value={
                        "id": "file-1",
                        "mimeType": "application/vnd.google-apps.document",
                    }
                ),
            ),
            Mock(ok=True, text="Assignment instructions content."),
        ]

        text = drive_client.export_doc_as_text("tok", "file-1")
        self.assertEqual(text, "Assignment instructions content.")

    @patch("classroom.services.drive_client.requests.post")
    def test_create_solution_doc_success(self, mock_post):
        mock_post.side_effect = [
            Mock(
                ok=True,
                json=Mock(
                    return_value={
                        "id": "new-doc-id",
                        "webViewLink": "https://docs.google.com/doc/new-doc-id",
                    }
                ),
            ),
            Mock(ok=True, json=Mock(return_value={})),
        ]

        doc_id, url = drive_client.create_solution_doc(
            "tok", title="Solution", body_text="My answer."
        )
        self.assertEqual(doc_id, "new-doc-id")
        self.assertEqual(url, "https://docs.google.com/doc/new-doc-id")

    @patch("classroom.services.drive_client.requests.delete")
    @patch("classroom.services.drive_client.requests.post")
    def test_create_solution_doc_cleans_up_orphan_on_docs_failure(
        self, mock_post, mock_delete
    ):
        """If the Docs batchUpdate fails after the Drive file is created, the
        empty Drive file must be deleted (best-effort) before re-raising."""
        mock_post.side_effect = [
            # First call: Drive file creation succeeds
            Mock(
                ok=True,
                json=Mock(
                    return_value={
                        "id": "orphan-doc-id",
                        "webViewLink": "https://docs.google.com/doc/orphan-doc-id",
                    }
                ),
            ),
            # Second call: Docs batchUpdate fails
            Mock(ok=False, status_code=500, json=Mock(return_value={}), text="Server error"),
        ]
        mock_delete.return_value = Mock(ok=True)

        with self.assertRaises(ClassroomError):
            drive_client.create_solution_doc(
                "tok", title="Solution", body_text="My answer."
            )

        # The cleanup DELETE must have been called with the orphaned file id
        mock_delete.assert_called_once()
        self.assertIn("orphan-doc-id", mock_delete.call_args.args[0])


class SubmissionServiceTests(TestCase):
    """Tests for turn_in_submission orchestration."""

    @patch("classroom.services.submission.client.patch_short_answer")
    @patch("classroom.services.submission.client.turn_in")
    @patch("classroom.services.submission.oauth.get_active_access_token")
    def test_turn_in_short_answer_updates_status(
        self, mock_token, mock_turn_in, mock_patch_short
    ):
        mock_token.return_value = "tok"
        draft = ClassroomSubmissionDraft.objects.create(
            course_id="c1",
            coursework_id="cw1",
            google_submission_id="sub1",
            work_type=ClassroomSubmissionDraft.WorkType.SHORT_ANSWER_QUESTION,
            answer_text="Short answer text",
        )

        submission.turn_in_submission(draft)

        draft.refresh_from_db()
        self.assertEqual(draft.status, ClassroomSubmissionDraft.Status.TURNED_IN)
        self.assertIsNotNone(draft.google_turned_in_at)
        mock_patch_short.assert_called_once_with(
            "tok", "c1", "cw1", "sub1", "Short answer text"
        )
        mock_turn_in.assert_called_once_with("tok", "c1", "cw1", "sub1")

    @patch("classroom.services.submission.client.list_student_submissions")
    @patch("classroom.services.submission.client.patch_short_answer")
    @patch("classroom.services.submission.client.turn_in")
    @patch("classroom.services.submission.oauth.get_active_access_token")
    def test_turn_in_recovers_missing_submission_id(
        self, mock_token, mock_turn_in, mock_patch_short, mock_list_sub
    ):
        mock_token.return_value = "tok"
        mock_list_sub.return_value = [{"id": "recovered-sub-id"}]
        draft = ClassroomSubmissionDraft.objects.create(
            course_id="c1",
            coursework_id="cw1",
            google_submission_id="",
            work_type=ClassroomSubmissionDraft.WorkType.SHORT_ANSWER_QUESTION,
            answer_text="Short answer text",
        )

        submission.turn_in_submission(draft)

        draft.refresh_from_db()
        self.assertEqual(draft.google_submission_id, "recovered-sub-id")
        self.assertEqual(draft.status, ClassroomSubmissionDraft.Status.TURNED_IN)


class ClassroomAPIViewsTests(APITestCase):
    """End-to-end tests for all Classroom REST views."""

    def setUp(self):
        _connected_credential()

    @patch.dict(os.environ, _ENV_PATCH)
    def test_auth_start_redirects_to_google(self):
        response = self.client.get(reverse("classroom-auth-start"))
        self.assertEqual(response.status_code, 302)
        self.assertIn("accounts.google.com", response.url)

    def test_auth_callback_mismatched_state_redirects_error(self):
        session = self.client.session
        session["classroom_oauth_state"] = "real-state"
        session.save()

        response = self.client.get(
            reverse("classroom-auth-callback") + "?state=wrong-state&code=test-code"
        )
        self.assertEqual(response.status_code, 302)
        self.assertIn("error=Invalid+OAuth+state", response.url)

    def test_auth_callback_google_error_param_redirects_error(self):
        session = self.client.session
        session["classroom_oauth_state"] = "real-state"
        session.save()

        response = self.client.get(
            reverse("classroom-auth-callback") + "?state=real-state&error=access_denied"
        )
        self.assertEqual(response.status_code, 302)
        self.assertIn("error=access_denied", response.url)

    def test_auth_callback_missing_code_redirects_error(self):
        session = self.client.session
        session["classroom_oauth_state"] = "real-state"
        session.save()

        response = self.client.get(
            reverse("classroom-auth-callback") + "?state=real-state"
        )
        self.assertEqual(response.status_code, 302)
        self.assertIn("error=No+authorization+code+returned", response.url)

    @patch("classroom.views.oauth.exchange_code_for_token")
    @patch("classroom.views.oauth.fetch_userinfo")
    def test_auth_callback_success_updates_credential(
        self, mock_fetch_userinfo, mock_exchange
    ):
        session = self.client.session
        session["classroom_oauth_state"] = "valid-state"
        session.save()

        mock_exchange.return_value = {
            "access_token": "new-tok",
            "refresh_token": "new-ref",
            "expires_in": 3600,
            "scope": "classroom.courses.readonly",
        }
        mock_fetch_userinfo.return_value = {
            "sub": "new-sub-999",
            "email": "fresh@school.edu",
            "name": "Fresh Student",
            "picture": "https://example.com/pic.jpg",
        }

        response = self.client.get(
            reverse("classroom-auth-callback") + "?state=valid-state&code=test-code"
        )
        self.assertEqual(response.status_code, 302)
        self.assertIn("connected=1", response.url)

        cred = ClassroomCredential.current()
        self.assertEqual(cred.email, "fresh@school.edu")
        self.assertEqual(cred.get_access_token(), "new-tok")

    def test_status_endpoint(self):
        response = self.client.get(reverse("classroom-status"))
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data["connected"])
        self.assertEqual(data["email"], "student@example.edu")
        self.assertFalse(data["expired"])

    def test_disconnect_endpoint(self):
        response = self.client.post(reverse("classroom-disconnect"))
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.json()["connected"])

        cred = ClassroomCredential.current()
        self.assertFalse(cred.is_connected)

    @patch("classroom.views.client.list_courses")
    def test_list_courses_view(self, mock_list):
        mock_list.return_value = [{"id": "c1", "name": "AP History"}]
        response = self.client.get(reverse("classroom-courses"))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.json()["courses"]), 1)
        self.assertEqual(response.json()["courses"][0]["name"], "AP History")

    @patch("classroom.views.client.get_upcoming_or_dated_coursework")
    def test_list_coursework_view(self, mock_get_cw):
        mock_get_cw.return_value = [{"id": "cw1", "title": "Read Chapter 4"}]
        response = self.client.get(reverse("classroom-coursework"))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.json()["coursework"]), 1)

    def test_list_coursework_view_invalid_date(self):
        response = self.client.get(
            reverse("classroom-coursework"), {"date": "invalid-date"}
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("YYYY-MM-DD", response.json()["error"])

    @patch("classroom.views.client.get_course")
    @patch("classroom.views.drive_client.export_doc_as_text")
    @patch("classroom.views.client.get_coursework")
    def test_coursework_detail_view_success(
        self, mock_get_cw, mock_export, mock_get_course
    ):
        mock_get_cw.return_value = {
            "id": "cw1",
            "title": "Lab 1",
            "materials": [{"driveFile": {"driveFile": {"id": "file-123"}}}],
        }
        mock_export.return_value = "Extracted document body"
        mock_get_course.return_value = {"id": "c1", "name": "Chemistry 101"}

        response = self.client.get(
            reverse(
                "classroom-coursework-detail",
                kwargs={"course_id": "c1", "coursework_id": "cw1"},
            )
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["title"], "Lab 1")
        self.assertEqual(data["course_id"], "c1")
        self.assertEqual(data["course_name"], "Chemistry 101")
        self.assertEqual(data["attachment_text"], "Extracted document body")

    @patch("classroom.views.client.get_coursework")
    def test_coursework_detail_view_404(self, mock_get_cw):
        mock_get_cw.side_effect = ClassroomError("Not found", reason="not_found")
        response = self.client.get(
            reverse(
                "classroom-coursework-detail",
                kwargs={"course_id": "c1", "coursework_id": "nonexistent"},
            )
        )
        self.assertEqual(response.status_code, 404)

    def test_solve_view_missing_arguments(self):
        response = self.client.post(reverse("classroom-solve"), {})
        self.assertEqual(response.status_code, 400)

    @patch("classroom.views.client.get_coursework")
    def test_solve_view_unsupported_work_type(self, mock_get_cw):
        mock_get_cw.return_value = {
            "id": "cw1",
            "workType": "MULTIPLE_CHOICE_QUESTION",
        }
        response = self.client.post(
            reverse("classroom-solve"),
            {"course_id": "c1", "coursework_id": "cw1"},
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["reason"], "unsupported_work_type")

    @patch("classroom.views.client.get_course")
    @patch("classroom.views.solve_coursework")
    @patch("classroom.views.client.list_student_submissions")
    @patch("classroom.views.client.get_coursework")
    def test_solve_view_success_creates_draft_with_course_name(
        self, mock_get_cw, mock_list_sub, mock_solve, mock_get_course
    ):
        mock_get_cw.return_value = {
            "id": "cw1",
            "title": "Essay 1",
            "workType": "ASSIGNMENT",
        }
        mock_list_sub.return_value = [{"id": "sub-1"}]
        mock_solve.return_value = {
            "text": "My generated essay solution.",
            "error": False,
            "reason": None,
        }
        mock_get_course.return_value = {"id": "c1", "name": "World Literature"}

        response = self.client.post(
            reverse("classroom-solve"),
            {"course_id": "c1", "coursework_id": "cw1"},
        )
        self.assertEqual(response.status_code, 201)
        data = response.json()
        self.assertEqual(data["course_name"], "World Literature")
        self.assertEqual(data["answer_text"], "My generated essay solution.")
        self.assertEqual(data["status"], "draft")

    def test_drafts_list_and_detail_crud(self):
        draft = ClassroomSubmissionDraft.objects.create(
            course_id="c1",
            course_name="Algebra",
            coursework_id="cw1",
            coursework_title="Linear Equations",
            work_type=ClassroomSubmissionDraft.WorkType.ASSIGNMENT,
            answer_text="x = 5",
        )

        # List
        list_resp = self.client.get(reverse("classroom-drafts"))
        self.assertEqual(list_resp.status_code, 200)
        self.assertEqual(len(list_resp.json()["drafts"]), 1)

        # GET detail
        detail_url = reverse("classroom-draft-detail", kwargs={"draft_id": draft.id})
        get_resp = self.client.get(detail_url)
        self.assertEqual(get_resp.status_code, 200)
        self.assertEqual(get_resp.json()["answer_text"], "x = 5")

        # PUT update
        put_resp = self.client.put(detail_url, {"answer_text": "x = 7"}, format="json")
        self.assertEqual(put_resp.status_code, 200)
        self.assertEqual(put_resp.json()["answer_text"], "x = 7")

        # PATCH update
        patch_resp = self.client.patch(detail_url, {"answer_text": "x = 9"}, format="json")
        self.assertEqual(patch_resp.status_code, 200)
        self.assertEqual(patch_resp.json()["answer_text"], "x = 9")

        # DELETE
        del_resp = self.client.delete(detail_url)
        self.assertEqual(del_resp.status_code, 200)
        self.assertFalse(ClassroomSubmissionDraft.objects.filter(pk=draft.id).exists())

    def test_draft_detail_cannot_edit_turned_in(self):
        draft = ClassroomSubmissionDraft.objects.create(
            course_id="c1",
            coursework_id="cw1",
            work_type=ClassroomSubmissionDraft.WorkType.ASSIGNMENT,
            answer_text="final answer",
            status=ClassroomSubmissionDraft.Status.TURNED_IN,
        )
        url = reverse("classroom-draft-detail", kwargs={"draft_id": draft.id})
        # Edit attempt should fail
        resp = self.client.put(url, {"answer_text": "edit attempt"}, format="json")
        self.assertEqual(resp.status_code, 400)
        # DELETE on a turned-in draft should also fail — it's the only record
        # of the Google Classroom submission (solution_doc_url, google_turned_in_at, etc.)
        del_resp = self.client.delete(url)
        self.assertEqual(del_resp.status_code, 400)
        self.assertIn("can't be deleted", del_resp.json()["error"])
        # The draft must still exist after the blocked delete
        self.assertTrue(ClassroomSubmissionDraft.objects.filter(pk=draft.id).exists())

    def test_draft_detail_patch_without_answer_text_is_a_noop(self):
        """A PUT/PATCH with no answer_text in the body should not mutate
        the draft at all — specifically, it must not bump updated_at."""
        from django.utils import timezone as tz

        draft = ClassroomSubmissionDraft.objects.create(
            course_id="c1",
            coursework_id="cw1",
            work_type=ClassroomSubmissionDraft.WorkType.ASSIGNMENT,
            answer_text="original",
        )
        original_updated_at = draft.updated_at
        url = reverse("classroom-draft-detail", kwargs={"draft_id": draft.id})
        resp = self.client.patch(url, {}, format="json")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["answer_text"], "original")
        draft.refresh_from_db()
        self.assertEqual(draft.updated_at, original_updated_at)

    @patch("classroom.views.submission.turn_in_submission")
    def test_turn_in_view_validations_and_success(self, mock_turn_in):
        draft = ClassroomSubmissionDraft.objects.create(
            course_id="c1",
            coursework_id="cw1",
            work_type=ClassroomSubmissionDraft.WorkType.ASSIGNMENT,
            answer_text="",
        )
        url = reverse("classroom-draft-turn-in", kwargs={"draft_id": draft.id})

        # Empty answer fails
        empty_resp = self.client.post(url)
        self.assertEqual(empty_resp.status_code, 400)
        self.assertIn("empty", empty_resp.json()["error"])

        # With answer succeeds
        draft.answer_text = "Valid answer text"
        draft.save()

        def fake_turn_in(d):
            d.status = ClassroomSubmissionDraft.Status.TURNED_IN
            d.save()

        mock_turn_in.side_effect = fake_turn_in

        success_resp = self.client.post(url)
        self.assertEqual(success_resp.status_code, 200)
        self.assertEqual(success_resp.json()["status"], "turned_in")

        # Second turn in fails because already turned in
        second_resp = self.client.post(url)
        self.assertEqual(second_resp.status_code, 400)


class ClassroomAgentToolsTests(TestCase):
    """Tests for agent/tools/classroom_tools.py tools."""

    def setUp(self):
        _connected_credential()

    def test_check_classroom_connection_tool(self):
        from agent.tools.classroom_tools import check_classroom_connection

        res = check_classroom_connection.invoke({})
        self.assertTrue(res["connected"])
        self.assertEqual(res["email"], "student@example.edu")

    @patch("agent.tools.classroom_tools.client.list_courses")
    def test_list_classroom_courses_tool(self, mock_list):
        from agent.tools.classroom_tools import list_classroom_courses

        mock_list.return_value = [{"id": "c1", "name": "Geometry"}]
        res = list_classroom_courses.invoke({})
        self.assertEqual(len(res["courses"]), 1)
        self.assertEqual(res["courses"][0]["name"], "Geometry")

    @patch("agent.tools.classroom_tools.client.list_coursework")
    def test_list_classroom_coursework_tool(self, mock_list):
        from agent.tools.classroom_tools import list_classroom_coursework

        mock_list.return_value = [
            {"id": "cw1", "title": "Homework 2", "workType": "ASSIGNMENT"}
        ]
        res = list_classroom_coursework.invoke({"course_id": "c1"})
        self.assertEqual(len(res["coursework"]), 1)
        self.assertEqual(res["coursework"][0]["title"], "Homework 2")

    @patch("agent.tools.classroom_tools.client.get_course")
    @patch("agent.tools.classroom_tools._solve_coursework")
    @patch("agent.tools.classroom_tools.client.list_student_submissions")
    @patch("agent.tools.classroom_tools.client.get_coursework")
    def test_solve_classroom_coursework_tool_persists_course_name(
        self, mock_get_cw, mock_list_sub, mock_solve, mock_get_course
    ):
        from agent.tools.classroom_tools import solve_classroom_coursework

        mock_get_cw.return_value = {
            "id": "cw1",
            "title": "Problem 1",
            "workType": "ASSIGNMENT",
        }
        mock_list_sub.return_value = [{"id": "sub1"}]
        mock_solve.return_value = {
            "text": "Answer 42",
            "error": False,
            "reason": None,
        }
        mock_get_course.return_value = {"id": "c1", "name": "Calculus"}

        res = solve_classroom_coursework.invoke(
            {"course_id": "c1", "coursework_id": "cw1"}
        )
        self.assertIn("draft_id", res)
        draft = ClassroomSubmissionDraft.objects.get(pk=res["draft_id"])
        self.assertEqual(draft.course_name, "Calculus")
        self.assertEqual(draft.answer_text, "Answer 42")

    def test_list_classroom_drafts_tool(self):
        from agent.tools.classroom_tools import list_classroom_drafts

        draft = ClassroomSubmissionDraft.objects.create(
            course_id="c1",
            coursework_id="cw1",
            coursework_title="Draft 1",
            work_type=ClassroomSubmissionDraft.WorkType.ASSIGNMENT,
            answer_text="Pending answer",
            status=ClassroomSubmissionDraft.Status.DRAFT,
        )

        res = list_classroom_drafts.invoke({})
        self.assertEqual(len(res["drafts"]), 1)
        self.assertEqual(res["drafts"][0]["id"], draft.id)

    @patch("agent.tools.classroom_tools.submission.turn_in_submission")
    @patch("agent.tools.classroom_tools.require_confirmation")
    def test_turn_in_classroom_assignment_tool(
        self, mock_require_confirmation, mock_turn_in
    ):
        from agent.tools.classroom_tools import turn_in_classroom_assignment

        draft = ClassroomSubmissionDraft.objects.create(
            course_id="c1",
            coursework_id="cw1",
            work_type=ClassroomSubmissionDraft.WorkType.ASSIGNMENT,
            answer_text="My assignment response",
            status=ClassroomSubmissionDraft.Status.DRAFT,
        )

        # Rejected confirmation
        mock_require_confirmation.return_value = {"approved": False}
        res = turn_in_classroom_assignment.invoke({"draft_id": draft.id})
        self.assertFalse(res["turned_in"])

        # Approved confirmation
        mock_require_confirmation.return_value = {"approved": True}
        res2 = turn_in_classroom_assignment.invoke({"draft_id": draft.id})
        self.assertTrue(res2["turned_in"])
        mock_turn_in.assert_called_once()
