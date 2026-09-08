import base64
import hashlib
import hmac
import json
from datetime import timedelta
from unittest.mock import MagicMock, patch

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from agent.tools import threads_tools
from threads.models import (
    ThreadsAutomation,
    ThreadsAutomationRun,
    ThreadsCredential,
    ThreadsDraft,
    ThreadsProfileChange,
    ThreadsProfileSnapshot,
    ThreadsRateLimitSnapshot,
)
from threads.services import client, oauth, publishing
from threads.services.oauth import ThreadsError


class ThreadsModelTests(TestCase):
    def test_credential_encryption_and_properties(self):
        cred = ThreadsCredential.current()
        self.assertFalse(cred.is_connected)
        self.assertTrue(cred.is_expired)

        cred.set_access_token("test-secret-token")
        cred.threads_user_id = "123456"
        cred.username = "mirabel_user"
        cred.token_expires_at = timezone.now() + timedelta(days=60)
        cred.permission_expires_at = timezone.now() + timedelta(days=90)
        cred.save()

        self.assertNotEqual(cred.access_token, "test-secret-token")
        self.assertEqual(cred.get_access_token(), "test-secret-token")
        self.assertTrue(cred.is_connected)
        self.assertFalse(cred.is_expired)
        self.assertFalse(cred.is_permission_expired)

        cred.clear_tokens()
        cred.save()
        self.assertFalse(cred.is_connected)
        self.assertEqual(cred.get_access_token(), "")

    def test_rate_limit_snapshot(self):
        snap = ThreadsRateLimitSnapshot.objects.create(quota_usage=250, quota_total=250)
        self.assertTrue(snap.is_exhausted)

        snap2 = ThreadsRateLimitSnapshot.objects.create(quota_usage=100, quota_total=250)
        self.assertFalse(snap2.is_exhausted)
        self.assertEqual(ThreadsRateLimitSnapshot.latest().id, snap2.id)

    def test_draft_defaults(self):
        draft = ThreadsDraft.objects.create(body="Hello Threads!")
        self.assertEqual(draft.reply_control, ThreadsDraft.ReplyControl.EVERYONE)
        self.assertEqual(draft.status, ThreadsDraft.Status.DRAFT)
        self.assertIsNotNone(draft.idempotency_key)


class ThreadsOAuthTests(TestCase):
    def setUp(self):
        ThreadsCredential.objects.all().delete()

    @patch.dict("os.environ", {"THREADS_APP_ID": "mock-app-id", "THREADS_APP_SECRET": "mock-secret"})
    def test_get_auth_url(self):
        url = oauth.get_auth_url("mock-state-123")
        self.assertIn("mock-app-id", url)
        self.assertIn("mock-state-123", url)
        self.assertIn("threads_basic", url)

    @patch("requests.get")
    @patch("requests.post")
    @patch.dict("os.environ", {"THREADS_APP_ID": "mock-app-id", "THREADS_APP_SECRET": "mock-secret"})
    def test_exchange_code_for_token(self, mock_post, mock_get):
        mock_post_resp = MagicMock(ok=True, status_code=200)
        mock_post_resp.json.return_value = {"access_token": "short-token", "user_id": "9999"}
        mock_post.return_value = mock_post_resp

        mock_get_resp = MagicMock(ok=True, status_code=200)
        mock_get_resp.json.return_value = {"access_token": "long-token-60d", "expires_in": 5184000}
        mock_get.return_value = mock_get_resp

        result = oauth.exchange_code_for_token("auth-code-xyz")
        self.assertEqual(result["access_token"], "long-token-60d")
        self.assertEqual(result["user_id"], "9999")
        self.assertEqual(result["expires_in"], 5184000)

    def test_token_refresh_skipped_if_under_24h(self):
        cred = ThreadsCredential.current()
        cred.set_access_token("token-123")
        cred.threads_user_id = "user-123"
        # Issue 1 hour ago -> age is ~1h (<24h)
        cred.token_expires_at = timezone.now() + timedelta(days=60) - timedelta(hours=1)
        cred.save()

        # Should skip refresh without making network call
        refreshed = oauth.refresh_token(cred, force=False)
        self.assertFalse(refreshed)

    @patch("requests.get")
    def test_token_refresh_success_when_over_24h(self, mock_get):
        cred = ThreadsCredential.current()
        cred.set_access_token("token-123")
        cred.threads_user_id = "user-123"
        # Issue 48 hours ago
        cred.token_expires_at = timezone.now() + timedelta(days=58)
        cred.save()

        mock_resp = MagicMock(ok=True, status_code=200)
        mock_resp.json.return_value = {"access_token": "refreshed-token", "expires_in": 5184000}
        mock_get.return_value = mock_resp

        refreshed = oauth.refresh_token(cred, force=False)
        self.assertTrue(refreshed)
        self.assertEqual(cred.get_access_token(), "refreshed-token")


class ThreadsPublishingTests(TestCase):
    def setUp(self):
        ThreadsCredential.objects.all().delete()
        self.cred = ThreadsCredential.current()
        self.cred.set_access_token("valid-token")
        self.cred.threads_user_id = "111222"
        self.cred.username = "test_creator"
        self.cred.token_expires_at = timezone.now() + timedelta(days=30)
        self.cred.save()

    def test_publish_rejects_exceeding_500_chars(self):
        draft = ThreadsDraft.objects.create(body="A" * 501)
        with self.assertRaises(ThreadsError) as cm:
            publishing.publish_draft(draft)
        self.assertEqual(cm.exception.reason, "post_rejected")

    def test_publish_rejects_empty(self):
        draft = ThreadsDraft.objects.create(body="")
        with self.assertRaises(ThreadsError) as cm:
            publishing.publish_draft(draft)
        self.assertEqual(cm.exception.reason, "post_rejected")

    @patch("time.sleep")
    @patch("threads.services.client.publish_container")
    @patch("threads.services.client.get_container_status")
    @patch("threads.services.client.create_media_container")
    def test_publish_draft_success(self, mock_create, mock_status, mock_publish, _mock_sleep):
        mock_create.return_value = "container-xyz"
        mock_status.return_value = {"status": "FINISHED"}
        mock_publish.return_value = "post-999"

        draft = ThreadsDraft.objects.create(body="Hello world from Mirabel!")
        result = publishing.publish_draft(draft)

        self.assertTrue(result["published"])
        self.assertEqual(result["post_id"], "post-999")
        self.assertIn("post-999", result["permalink"])

        draft.refresh_from_db()
        self.assertEqual(draft.status, ThreadsDraft.Status.PUBLISHED)
        self.assertEqual(draft.threads_post_id, "post-999")
        self.assertEqual(draft.container_status, "FINISHED")

    def test_idempotency_prevents_duplicate_publish(self):
        draft = ThreadsDraft.objects.create(
            body="Existing post",
            status=ThreadsDraft.Status.PUBLISHED,
            threads_post_id="already-published-id",
            permalink="https://www.threads.net/@user/post/already-published-id",
        )
        res = publishing.publish_draft(draft)
        self.assertTrue(res["published"])
        self.assertTrue(res.get("already_published"))

    def test_rate_limit_preflight_blocks_publish(self):
        ThreadsRateLimitSnapshot.objects.create(quota_usage=250, quota_total=250)
        draft = ThreadsDraft.objects.create(body="Post when quota full")
        with self.assertRaises(ThreadsError) as cm:
            publishing.publish_draft(draft)
        self.assertEqual(cm.exception.reason, "rate_limited")


class ThreadsComplianceTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.cred = ThreadsCredential.current()
        self.cred.set_access_token("valid-token")
        self.cred.threads_user_id = "test-user-id-555"
        self.cred.save()

    def _generate_signed_request(self, payload: dict, secret: str) -> str:
        payload_b64 = base64.urlsafe_b64encode(json.dumps(payload).encode()).decode().rstrip("=")
        sig = hmac.new(secret.encode(), payload_b64.encode(), hashlib.sha256).digest()
        sig_b64 = base64.urlsafe_b64encode(sig).decode().rstrip("=")
        return f"{sig_b64}.{payload_b64}"

    @patch.dict("os.environ", {"THREADS_APP_SECRET": "test-secret-key"})
    def test_deauthorize_callback(self):
        signed_req = self._generate_signed_request({"user_id": "test-user-id-555"}, "test-secret-key")
        resp = self.client.post("/api/threads/deauthorize/", {"signed_request": signed_req})
        self.assertEqual(resp.status_code, 200)

        self.cred.refresh_from_db()
        self.assertFalse(self.cred.is_connected)
        self.assertEqual(self.cred.get_access_token(), "")

    @patch.dict("os.environ", {"THREADS_APP_SECRET": "test-secret-key"})
    def test_data_deletion_callback(self):
        ThreadsDraft.objects.create(body="Private post to delete")
        signed_req = self._generate_signed_request({"user_id": "test-user-id-555"}, "test-secret-key")

        resp = self.client.post("/api/threads/data-deletion/", {"signed_request": signed_req})
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("url", data)
        self.assertIn("confirmation_code", data)

        self.cred.refresh_from_db()
        self.assertFalse(self.cred.is_connected)
        self.assertEqual(ThreadsDraft.objects.count(), 0)


class ThreadsAgentToolsTests(TestCase):
    def setUp(self):
        ThreadsCredential.objects.all().delete()
        self.cred = ThreadsCredential.current()
        self.cred.set_access_token("valid-token")
        self.cred.threads_user_id = "agent-user-id"
        self.cred.username = "agent_bot"
        self.cred.token_expires_at = timezone.now() + timedelta(days=30)
        self.cred.save()

    def test_check_threads_connection(self):
        res = threads_tools.check_threads_connection.invoke({})
        self.assertTrue(res["connected"])
        self.assertEqual(res["username"], "agent_bot")

    def test_create_and_list_drafts(self):
        create_res = threads_tools.create_threads_draft.invoke({"body": "Draft from agent"})
        self.assertIn("id", create_res)
        self.assertEqual(create_res["body"], "Draft from agent")

        drafts = threads_tools.list_threads_drafts.invoke({})
        self.assertEqual(len(drafts), 1)

    @patch("agent.tools.threads_tools.require_confirmation")
    def test_publish_threads_draft_rejection(self, mock_confirm):
        mock_confirm.return_value = {"approved": False}
        draft = ThreadsDraft.objects.create(body="Draft rejected by user")

        res = threads_tools.publish_threads_draft.invoke({"draft_id": draft.id})
        self.assertFalse(res["published"])
        self.assertIn("did not approve", res["message"])

    @patch("threads.services.publishing.publish_draft")
    @patch("agent.tools.threads_tools.require_confirmation")
    def test_publish_threads_draft_approved(self, mock_confirm, mock_pub):
        mock_confirm.return_value = {"approved": True}
        mock_pub.return_value = {"published": True, "post_id": "agent-p1", "permalink": "https://threads.net/p1"}
        draft = ThreadsDraft.objects.create(body="Draft approved by user")

        res = threads_tools.publish_threads_draft.invoke({"draft_id": draft.id})
        self.assertTrue(res["published"])
        self.assertEqual(res["post_id"], "agent-p1")


class ThreadsViewsTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.cred = ThreadsCredential.current()
        self.cred.set_access_token("token-val")
        self.cred.threads_user_id = "view-user"
        self.cred.username = "view_user"
        self.cred.token_expires_at = timezone.now() + timedelta(days=30)
        self.cred.save()

    def test_status_endpoint(self):
        resp = self.client.get("/api/threads/status/")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertTrue(data["connected"])
        self.assertEqual(data["username"], "view_user")

    def test_drafts_crud(self):
        # Create
        post_resp = self.client.post("/api/threads/drafts/", {"body": "New API draft"})
        self.assertEqual(post_resp.status_code, 201)
        draft_id = post_resp.json()["id"]

        # List
        list_resp = self.client.get("/api/threads/drafts/")
        self.assertEqual(list_resp.status_code, 200)
        self.assertEqual(len(list_resp.json()), 1)

        # Update
        patch_resp = self.client.patch(f"/api/threads/drafts/{draft_id}/", {"body": "Updated draft"})
        self.assertEqual(patch_resp.status_code, 200)
        self.assertEqual(patch_resp.json()["body"], "Updated draft")

        # Delete
        del_resp = self.client.delete(f"/api/threads/drafts/{draft_id}/")
        self.assertEqual(del_resp.status_code, 204)

    def test_overview_endpoint(self):
        resp = self.client.get("/api/threads/overview/")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("profile_health", data)
        self.assertIn("activity", data)

    def test_automations_crud(self):
        # Create
        post_resp = self.client.post(
            "/api/threads/automations/",
            {"name": "Test Sync", "type": "profile_sync", "interval_hours": 6},
        )
        self.assertEqual(post_resp.status_code, 201)
        auto_id = post_resp.json()["id"]

        # List
        list_resp = self.client.get("/api/threads/automations/")
        self.assertEqual(list_resp.status_code, 200)
        self.assertEqual(len(list_resp.json()), 1)

        # Delete
        del_resp = self.client.delete(f"/api/threads/automations/{auto_id}/")
        self.assertEqual(del_resp.status_code, 204)
