from datetime import timedelta
from unittest.mock import patch

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APITestCase

from linkedin.models import (
    LinkedInAutomation,
    LinkedInAutomationRun,
    LinkedInCredential,
    LinkedInDraft,
    LinkedInProfileChange,
    LinkedInProfileSnapshot,
)
from linkedin.services import automation as automation_service
from linkedin.services.activity import content_activity
from linkedin.services.oauth import LinkedInError
from linkedin.services.profile import latest_synced_at, profile_health, sync_profile


def _connected_credential(**overrides):
    cred = LinkedInCredential.current()
    cred.set_access_token("token")
    cred.token_expires_at = timezone.now() + timedelta(days=1)
    cred.member_sub = "abc123"
    cred.member_urn = "urn:li:person:abc123"
    for field, value in overrides.items():
        setattr(cred, field, value)
    cred.save()
    return cred


class ProfileSyncTests(TestCase):
    """sync_profile must diff against the LAST snapshot only, never store a
    duplicate snapshot when nothing changed, and never record "changed" on
    the very first sync (nothing to diff against yet)."""

    @patch("linkedin.services.profile.oauth.fetch_userinfo")
    @patch("linkedin.services.profile.oauth.get_active_access_token", return_value="token")
    def test_first_sync_creates_baseline_without_reporting_a_change(self, _mock_token, mock_userinfo):
        _connected_credential()
        mock_userinfo.return_value = {"sub": "abc123", "name": "Ada Lovelace", "email": "ada@example.com"}

        result = sync_profile()

        self.assertFalse(result["changed"])
        self.assertEqual(result["changes"], [])
        self.assertEqual(LinkedInProfileSnapshot.objects.count(), 1)
        self.assertEqual(LinkedInProfileChange.objects.count(), 0)

    @patch("linkedin.services.profile.oauth.fetch_userinfo")
    @patch("linkedin.services.profile.oauth.get_active_access_token", return_value="token")
    def test_unchanged_profile_does_not_create_a_duplicate_snapshot(self, _mock_token, mock_userinfo):
        _connected_credential()
        mock_userinfo.return_value = {"sub": "abc123", "name": "Ada Lovelace", "email": "ada@example.com"}

        sync_profile()
        result = sync_profile()

        self.assertFalse(result["changed"])
        self.assertEqual(LinkedInProfileSnapshot.objects.count(), 1)

    @patch("linkedin.services.profile.oauth.fetch_userinfo")
    @patch("linkedin.services.profile.oauth.get_active_access_token", return_value="token")
    def test_name_change_is_detected_and_recorded(self, _mock_token, mock_userinfo):
        _connected_credential()
        mock_userinfo.return_value = {"sub": "abc123", "name": "Ada Lovelace", "email": "ada@example.com"}
        sync_profile()

        mock_userinfo.return_value = {"sub": "abc123", "name": "Ada Byron", "email": "ada@example.com"}
        result = sync_profile()

        self.assertTrue(result["changed"])
        self.assertEqual(len(result["changes"]), 1)
        self.assertEqual(result["changes"][0]["field"], "name")
        self.assertEqual(result["changes"][0]["old_value"], "Ada Lovelace")
        self.assertEqual(result["changes"][0]["new_value"], "Ada Byron")
        self.assertEqual(LinkedInProfileSnapshot.objects.count(), 2)
        self.assertEqual(LinkedInProfileChange.objects.count(), 1)

    def test_raises_when_not_connected(self):
        with self.assertRaises(LinkedInError):
            sync_profile()


class ProfileHealthTests(TestCase):
    """Deterministic, explainable scoring — same inputs always produce the
    same score, and every missing field gets an Issue/Why/Recommendation/
    Priority entry, never a bare number with no explanation."""

    def test_fully_populated_profile_scores_100(self):
        _connected_credential(name="Ada", email="ada@example.com", picture_url="https://example.com/p.jpg")

        health = profile_health()

        self.assertEqual(health["score"], 100)
        self.assertEqual(health["recommendations"], [])

    def test_missing_fields_lower_score_and_produce_recommendations(self):
        _connected_credential(name="", email="", picture_url="")

        health = profile_health()

        self.assertLess(health["score"], 100)
        fields_flagged = {r["field"] for r in health["recommendations"]}
        self.assertEqual(fields_flagged, {"name", "email", "picture_url"})
        for rec in health["recommendations"]:
            self.assertIn("issue", rec)
            self.assertIn("why_it_matters", rec)
            self.assertIn("recommendation", rec)
            self.assertIn("priority", rec)

    def test_never_scores_unavailable_fields(self):
        health = profile_health()
        # Deliberately does not claim to score headline/experience/etc. —
        # LinkedIn's OAuth scope here doesn't expose them.
        self.assertNotIn("headline", health["breakdown"])
        self.assertIn("unscored_fields_note", health)


class ContentActivityTests(TestCase):
    """This is Mirabel's own publishing record, not LinkedIn analytics — must
    never claim engagement numbers LinkedIn doesn't actually provide."""

    def test_only_counts_published_drafts_in_period(self):
        LinkedInDraft.objects.create(body="published in range", status=LinkedInDraft.Status.PUBLISHED)
        LinkedInDraft.objects.create(body="still a draft", status=LinkedInDraft.Status.DRAFT)

        result = content_activity(30)

        self.assertEqual(result["posts_published"], 1)
        self.assertEqual(result["data_source"], "mirabel_publishing_record")
        self.assertIn("does not expose", result["note"])

    def test_excludes_posts_outside_the_period(self):
        old = LinkedInDraft.objects.create(body="old post", status=LinkedInDraft.Status.PUBLISHED)
        LinkedInDraft.objects.filter(pk=old.pk).update(updated_at=timezone.now() - timedelta(days=40))

        result = content_activity(7)

        self.assertEqual(result["posts_published"], 0)

    def test_invalid_period_falls_back_to_default(self):
        result = content_activity(period_days=13)
        self.assertEqual(result["period_days"], 30)


class AutomationSchedulingTests(TestCase):
    def test_profile_sync_next_run_uses_interval_hours(self):
        automation = LinkedInAutomation(type=LinkedInAutomation.Type.PROFILE_SYNC, interval_hours=6)
        now = timezone.now()

        next_run = automation_service.compute_next_run_at(automation, from_time=now)

        self.assertEqual(next_run, now + timedelta(hours=6))

    def test_daily_briefing_runs_every_24_hours_regardless_of_interval_hours(self):
        automation = LinkedInAutomation(type=LinkedInAutomation.Type.DAILY_BRIEFING, interval_hours=999)
        now = timezone.now()

        next_run = automation_service.compute_next_run_at(automation, from_time=now)

        self.assertEqual(next_run, now + timedelta(days=1))

    def test_weekly_report_runs_every_7_days(self):
        automation = LinkedInAutomation(type=LinkedInAutomation.Type.WEEKLY_REPORT)
        now = timezone.now()

        next_run = automation_service.compute_next_run_at(automation, from_time=now)

        self.assertEqual(next_run, now + timedelta(days=7))


class AutomationRunTests(TestCase):
    @patch("linkedin.services.automation.sync_profile")
    def test_claim_and_run_executes_profile_sync_and_reschedules(self, mock_sync):
        mock_sync.return_value = {"changed": False, "changes": []}
        automation = LinkedInAutomation.objects.create(
            name="Sync", type=LinkedInAutomation.Type.PROFILE_SYNC, interval_hours=6,
            next_run_at=timezone.now() - timedelta(minutes=1),
        )

        automation_service.claim_and_run(automation.pk)

        automation.refresh_from_db()
        self.assertEqual(automation.last_status, "success")
        self.assertEqual(automation.failure_count, 0)
        self.assertGreater(automation.next_run_at, timezone.now())
        self.assertEqual(LinkedInAutomationRun.objects.filter(automation=automation).count(), 1)

    @patch("linkedin.services.automation.sync_profile")
    def test_a_run_that_is_not_yet_due_is_skipped(self, mock_sync):
        automation = LinkedInAutomation.objects.create(
            name="Sync", type=LinkedInAutomation.Type.PROFILE_SYNC,
            next_run_at=timezone.now() + timedelta(hours=1),
        )

        automation_service.claim_and_run(automation.pk)

        mock_sync.assert_not_called()
        self.assertEqual(LinkedInAutomationRun.objects.count(), 0)

    @patch("linkedin.services.automation.sync_profile")
    def test_claiming_twice_for_the_same_due_tick_only_runs_once(self, mock_sync):
        """Regression coverage for the idempotency guard: two Celery workers
        (or a retried task) hitting claim_and_run for the same automation at
        the same due time must never execute it twice."""
        mock_sync.return_value = {"changed": False, "changes": []}
        automation = LinkedInAutomation.objects.create(
            name="Sync", type=LinkedInAutomation.Type.PROFILE_SYNC,
            next_run_at=timezone.now() - timedelta(minutes=1),
        )

        automation_service.claim_and_run(automation.pk)
        automation_service.claim_and_run(automation.pk)  # already claimed, next_run_at is now in the future

        self.assertEqual(mock_sync.call_count, 1)
        self.assertEqual(LinkedInAutomationRun.objects.filter(automation=automation).count(), 1)

    def test_a_failed_run_is_recorded_without_crashing_the_task(self):
        automation = LinkedInAutomation.objects.create(
            name="Sync", type=LinkedInAutomation.Type.PROFILE_SYNC,
            next_run_at=timezone.now() - timedelta(minutes=1),
        )
        # No LinkedInCredential connected -> sync_profile raises LinkedInError.

        automation_service.claim_and_run(automation.pk)

        automation.refresh_from_db()
        self.assertEqual(automation.last_status, "failed")
        self.assertEqual(automation.failure_count, 1)
        run = LinkedInAutomationRun.objects.get(automation=automation)
        self.assertEqual(run.status, "failed")
        self.assertTrue(run.error_message)

    @patch("linkedin.services.automation.get_provider")
    def test_briefing_falls_back_to_raw_facts_when_the_provider_fails(self, mock_get_provider):
        mock_get_provider.side_effect = Exception("provider down")
        _connected_credential(name="Ada")
        automation = LinkedInAutomation.objects.create(
            name="Daily", type=LinkedInAutomation.Type.DAILY_BRIEFING,
            next_run_at=timezone.now() - timedelta(minutes=1),
        )

        automation_service.claim_and_run(automation.pk)

        automation.refresh_from_db()
        self.assertEqual(automation.last_status, "success")
        run = LinkedInAutomationRun.objects.get(automation=automation)
        self.assertIn("Profile health score", run.detail)


class LinkedInProfileApiTests(APITestCase):
    def test_profile_endpoint_returns_only_available_fields_and_a_health_score(self):
        _connected_credential(name="Ada", email="ada@example.com")

        response = self.client.get("/api/linkedin/profile/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["profile"]["name"], "Ada")
        self.assertIn("score", response.data["health"])

    def test_activity_endpoint(self):
        response = self.client.get("/api/linkedin/activity/?period=7")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["period_days"], 7)


class LinkedInAutomationApiTests(APITestCase):
    def test_create_requires_known_type(self):
        response = self.client.post(
            "/api/linkedin/automations/", {"name": "Bad", "type": "nonexistent"}, format="json"
        )
        self.assertEqual(response.status_code, 400)

    def test_create_and_list_automation(self):
        response = self.client.post(
            "/api/linkedin/automations/",
            {"name": "Sync my profile", "type": "profile_sync", "interval_hours": 6},
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertIsNotNone(response.data["next_run_at"])

        listing = self.client.get("/api/linkedin/automations/")
        self.assertEqual(len(listing.data["automations"]), 1)

    def test_disable_automation(self):
        automation = LinkedInAutomation.objects.create(name="Sync", type=LinkedInAutomation.Type.PROFILE_SYNC)

        response = self.client.patch(
            f"/api/linkedin/automations/{automation.pk}/", {"enabled": False}, format="json"
        )

        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data["enabled"])

    def test_delete_automation(self):
        automation = LinkedInAutomation.objects.create(name="Sync", type=LinkedInAutomation.Type.PROFILE_SYNC)

        response = self.client.delete(f"/api/linkedin/automations/{automation.pk}/")

        self.assertEqual(response.status_code, 200)
        self.assertFalse(LinkedInAutomation.objects.filter(pk=automation.pk).exists())

    def test_create_clamps_interval_hours_to_the_max_actually_scheduled(self):
        """Regression coverage: storing an interval the scheduler would
        silently cap anyway must not leave the displayed value lying about
        what will actually happen — see automation_service.compute_next_run_at's
        own clamp."""
        response = self.client.post(
            "/api/linkedin/automations/",
            {"name": "Too frequent", "type": "profile_sync", "interval_hours": 999999},
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["interval_hours"], automation_service.MAX_INTERVAL_HOURS)

    def test_create_clamps_zero_or_negative_interval_hours_to_the_minimum(self):
        response = self.client.post(
            "/api/linkedin/automations/",
            {"name": "Too rare", "type": "profile_sync", "interval_hours": -5},
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["interval_hours"], automation_service.MIN_INTERVAL_HOURS)

    def test_update_also_clamps_interval_hours(self):
        automation = LinkedInAutomation.objects.create(
            name="Sync", type=LinkedInAutomation.Type.PROFILE_SYNC, interval_hours=6
        )

        response = self.client.patch(
            f"/api/linkedin/automations/{automation.pk}/", {"interval_hours": 100000}, format="json"
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["interval_hours"], automation_service.MAX_INTERVAL_HOURS)

    def test_run_now_endpoint_executes_immediately_even_when_not_due(self):
        automation = LinkedInAutomation.objects.create(
            name="Sync", type=LinkedInAutomation.Type.PROFILE_SYNC,
            next_run_at=timezone.now() + timedelta(days=1),  # not due for a full day
        )

        with patch("linkedin.services.automation.sync_profile", return_value={"changed": False, "changes": []}):
            response = self.client.post(f"/api/linkedin/automations/{automation.pk}/run/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(LinkedInAutomationRun.objects.filter(automation=automation).count(), 1)

    def test_run_now_on_disabled_automation_returns_409(self):
        automation = LinkedInAutomation.objects.create(
            name="Sync", type=LinkedInAutomation.Type.PROFILE_SYNC, enabled=False
        )

        response = self.client.post(f"/api/linkedin/automations/{automation.pk}/run/")

        self.assertEqual(response.status_code, 409)

    def test_run_now_on_missing_automation_returns_404(self):
        response = self.client.post("/api/linkedin/automations/999999/run/")
        self.assertEqual(response.status_code, 404)

    def test_automation_runs_ignores_a_non_numeric_automation_id_filter(self):
        """Regression coverage: this used to crash with an uncaught
        ValueError → global-handler 500 on garbage query input instead of
        degrading gracefully, unlike outlook.views.inbox's established
        try/except-on-int-query-param convention."""
        response = self.client.get("/api/linkedin/automation-runs/?automation_id=not-a-number")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["runs"], [])


class ProfileConnectBaselineTests(APITestCase):
    """Regression coverage: connecting LinkedIn used to leave Profile History
    empty until the user manually synced or an automation happened to fire —
    the OAuth callback now records a baseline snapshot immediately."""

    @patch("linkedin.views.oauth.fetch_userinfo")
    @patch("linkedin.views.oauth.exchange_code_for_token")
    def test_auth_callback_creates_a_baseline_snapshot(self, mock_exchange, mock_userinfo):
        session = self.client.session
        session["linkedin_oauth_state"] = "state123"
        session.save()
        mock_exchange.return_value = {"access_token": "tok", "expires_in": 3600}
        mock_userinfo.return_value = {"sub": "abc123", "name": "Ada Lovelace", "email": "ada@example.com"}

        response = self.client.get("/api/linkedin/auth/callback/?state=state123&code=abc")

        self.assertEqual(response.status_code, 302)
        self.assertEqual(LinkedInProfileSnapshot.objects.count(), 1)
        self.assertIsNotNone(latest_synced_at())

    @patch("linkedin.views.oauth.fetch_userinfo")
    @patch("linkedin.views.oauth.exchange_code_for_token")
    def test_auth_callback_redirect_survives_a_snapshot_failure(self, mock_exchange, mock_userinfo):
        session = self.client.session
        session["linkedin_oauth_state"] = "state123"
        session.save()
        mock_exchange.return_value = {"access_token": "tok", "expires_in": 3600}
        mock_userinfo.return_value = {"sub": "abc123", "name": "Ada Lovelace", "email": "ada@example.com"}

        with patch("linkedin.views.record_snapshot", side_effect=Exception("db hiccup")):
            response = self.client.get("/api/linkedin/auth/callback/?state=state123&code=abc")

        self.assertEqual(response.status_code, 302)
        self.assertIn("connected=1", response.url)


class LastSyncedAccuracyTests(TestCase):
    """last_synced must reflect an actual profile data pull, not just any
    credential row save (e.g. a token refresh touches updated_at too)."""

    def test_last_synced_is_none_before_any_snapshot_exists(self):
        _connected_credential()  # connecting alone (no snapshot yet) shouldn't count as synced
        self.assertIsNone(latest_synced_at())

    @patch("linkedin.services.profile.oauth.fetch_userinfo")
    @patch("linkedin.services.profile.oauth.get_active_access_token", return_value="token")
    def test_last_synced_reflects_the_latest_snapshot(self, _mock_token, mock_userinfo):
        _connected_credential()
        mock_userinfo.return_value = {"sub": "abc123", "name": "Ada", "email": "ada@example.com"}

        sync_profile()

        self.assertIsNotNone(latest_synced_at())


class BriefingDifferentiationTests(TestCase):
    """Daily vs weekly briefings must use genuinely different lookback
    windows, not the same 7-day facts under two different labels."""

    @patch("linkedin.services.automation.activity_since")
    def test_daily_briefing_uses_a_1_day_window(self, mock_activity):
        mock_activity.return_value = {"posts_published": 0}
        _connected_credential()
        automation = LinkedInAutomation.objects.create(
            name="Daily", type=LinkedInAutomation.Type.DAILY_BRIEFING,
            next_run_at=timezone.now() - timedelta(minutes=1),
        )

        automation_service.claim_and_run(automation.pk)

        mock_activity.assert_called_once_with(1)

    @patch("linkedin.services.automation.activity_since")
    def test_weekly_report_uses_a_7_day_window(self, mock_activity):
        mock_activity.return_value = {"posts_published": 0}
        _connected_credential()
        automation = LinkedInAutomation.objects.create(
            name="Weekly", type=LinkedInAutomation.Type.WEEKLY_REPORT,
            next_run_at=timezone.now() - timedelta(minutes=1),
        )

        automation_service.claim_and_run(automation.pk)

        mock_activity.assert_called_once_with(7)
