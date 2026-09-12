import io
import uuid
from unittest.mock import MagicMock, patch

from django.core.files.base import ContentFile
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from agent.tools import media_tools
from core.models import ModelPreference, ProviderCredential
from core.services.providers.google_media_provider import GoogleMediaProvider, _map_genai_error
from core.services.providers.media_base import (
    MediaCapability,
    MediaGenerationError,
    ProviderAuthenticationError,
    ProviderImageResult,
    ProviderPolicyRejection,
    ProviderRateLimitError,
    ProviderVideoJobResult,
)
from linkedin.models import LinkedInDraft
from media_assets.models import MediaAsset, MediaGenerationJob
from media_assets.services import media_service
from media_assets.tasks import process_video_generation_job
from threads.models import ThreadsDraft


class GoogleMediaProviderTests(TestCase):
    def setUp(self):
        self.provider = GoogleMediaProvider()

    def test_supports_capabilities(self):
        self.assertTrue(self.provider.supports(MediaCapability.IMAGE_GENERATION))
        self.assertTrue(self.provider.supports(MediaCapability.VIDEO_GENERATION))
        self.assertTrue(self.provider.supports(MediaCapability.IMAGE_TO_VIDEO))
        self.assertTrue(self.provider.supports(MediaCapability.IMAGE_EDITING))
        self.assertFalse(self.provider.supports(MediaCapability.VIDEO_EXTEND))

    def test_missing_api_key_raises_auth_error(self):
        with patch("core.services.providers.google_media_provider.get_api_key", return_value=""):
            with self.assertRaises(ProviderAuthenticationError):
                self.provider.generate_image("A cute cat")

    @patch("core.services.providers.google_media_provider.get_api_key", return_value="test-key")
    def test_generate_image_success(self, mock_key):
        mock_response = MagicMock()
        mock_img = MagicMock()
        mock_img.image.image_bytes = b"fake-jpeg-bytes"
        mock_response.generated_images = [mock_img]

        with patch.object(self.provider, "_call_generate_images", return_value=mock_response):
            results = self.provider.generate_image("test prompt", aspect_ratio="1:1")

        self.assertEqual(len(results), 1)
        self.assertEqual(results[0].image_bytes, b"fake-jpeg-bytes")
        self.assertEqual(results[0].mime_type, "image/jpeg")

    @patch("core.services.providers.google_media_provider.get_api_key", return_value="test-key")
    def test_start_video_generation_success(self, mock_key):
        mock_op = MagicMock()
        mock_op.name = "operations/video-123"
        mock_op.done = False

        with patch.object(self.provider, "_call_generate_videos", return_value=mock_op):
            res = self.provider.start_video_generation("A cat dancing", aspect_ratio="16:9", duration_seconds=6)

        self.assertEqual(res.operation_name, "operations/video-123")
        self.assertEqual(res.status, "processing")
        self.assertFalse(res.done)

    @patch("core.services.providers.google_media_provider.get_api_key", return_value="test-key")
    def test_poll_video_generation_completed(self, mock_key):
        mock_op = MagicMock()
        mock_op.done = True
        mock_op.error = None
        mock_video = MagicMock()
        mock_video.video.video_bytes = b"fake-mp4-data"
        mock_video.video.mime_type = "video/mp4"
        mock_op.response.generated_videos = [mock_video]

        with patch.object(self.provider, "_call_get_operation", return_value=mock_op):
            res = self.provider.poll_video_generation("operations/video-123")

        self.assertTrue(res.done)
        self.assertEqual(res.status, "completed")
        self.assertEqual(res.video_bytes, b"fake-mp4-data")


class MediaServiceTests(TestCase):
    def setUp(self):
        ModelPreference.current()

    @patch("media_assets.services.media_service.get_media_provider")
    def test_generate_image_persists_asset(self, mock_get_provider):
        mock_prov = MagicMock()
        mock_prov.image_model = "imagen-3.0-generate-002"
        mock_prov.generate_image.return_value = [
            ProviderImageResult(image_bytes=b"sample-image", mime_type="image/jpeg", aspect_ratio="1:1")
        ]
        mock_get_provider.return_value = mock_prov

        assets = media_service.generate_image("A futuristic city", aspect_ratio="1:1")
        self.assertEqual(len(assets), 1)
        asset = assets[0]
        self.assertEqual(asset.media_type, MediaAsset.MediaType.IMAGE)
        self.assertEqual(asset.prompt, "A futuristic city")
        self.assertTrue(asset.file)
        self.assertTrue(MediaAsset.objects.filter(id=asset.id).exists())

    @patch("media_assets.tasks.process_video_generation_job.delay")
    @patch("media_assets.services.media_service.get_media_provider")
    def test_submit_video_generation_creates_job_and_dispatches(self, mock_get_prov, mock_task):
        mock_prov = MagicMock()
        mock_prov.video_model = "veo-2.0-generate-001"
        mock_get_prov.return_value = mock_prov
        mock_task.return_value.id = "celery-123"

        job = media_service.submit_video_generation("Cinematic drone flight", aspect_ratio="16:9", duration_seconds=6)
        self.assertEqual(job.status, MediaGenerationJob.Status.PENDING)
        self.assertEqual(job.celery_task_id, "celery-123")
        mock_task.assert_called_once_with(str(job.id))

    @patch("media_assets.services.media_service.get_media_provider")
    def test_generate_variations(self, mock_get_prov):
        parent = MediaAsset.objects.create(
            prompt="A sunny forest",
            media_type=MediaAsset.MediaType.IMAGE,
            provider="google",
            model_name="imagen-3.0",
        )
        parent.file.save("parent.jpg", ContentFile(b"parent-bytes"), save=True)

        mock_prov = MagicMock()
        mock_prov.image_model = "imagen-3.0"
        mock_prov.generate_image.return_value = [
            ProviderImageResult(image_bytes=b"var1", mime_type="image/jpeg"),
            ProviderImageResult(image_bytes=b"var2", mime_type="image/jpeg"),
        ]
        mock_get_prov.return_value = mock_prov

        variations = media_service.generate_variations(parent.id, count=2)
        self.assertEqual(len(variations), 2)
        for var in variations:
            self.assertEqual(var.source_asset, parent)


class MediaTasksTests(TestCase):
    @patch("media_assets.tasks.get_media_provider")
    def test_process_video_generation_job_success(self, mock_get_prov):
        job = MediaGenerationJob.objects.create(
            prompt="Drone over mountains",
            media_type=MediaGenerationJob.MediaType.VIDEO,
            provider="google",
            model_name="veo-2.0",
            status=MediaGenerationJob.Status.PENDING,
        )

        mock_prov = MagicMock()
        mock_prov.start_video_generation.return_value = ProviderVideoJobResult(
            operation_name="ops/123", done=False, status="processing"
        )
        mock_prov.poll_video_generation.return_value = ProviderVideoJobResult(
            operation_name="ops/123", done=True, status="completed", video_bytes=b"video-bytes", mime_type="video/mp4"
        )
        mock_get_prov.return_value = mock_prov

        process_video_generation_job(str(job.id))

        job.refresh_from_db()
        self.assertEqual(job.status, MediaGenerationJob.Status.COMPLETED)
        self.assertIsNotNone(job.result_asset)
        self.assertEqual(job.result_asset.media_type, MediaAsset.MediaType.VIDEO)

    def test_process_video_generation_job_idempotent(self):
        job = MediaGenerationJob.objects.create(
            prompt="Done video",
            status=MediaGenerationJob.Status.COMPLETED,
        )
        with patch("core.services.providers.get_media_provider") as mock_prov:
            process_video_generation_job(str(job.id))
            mock_prov.assert_not_called()


from django.core.cache import cache


class MediaAPITests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()

    def test_list_media_assets(self):
        MediaAsset.objects.create(prompt="Image 1", media_type=MediaAsset.MediaType.IMAGE)
        MediaAsset.objects.create(prompt="Video 1", media_type=MediaAsset.MediaType.VIDEO)

        resp = self.client.get("/api/media/assets/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data), 2)

        resp_img = self.client.get("/api/media/assets/?media_type=image")
        self.assertEqual(resp_img.status_code, 200)
        self.assertEqual(len(resp_img.data), 1)

    def test_generate_image_validation(self):
        # Empty prompt -> 400
        resp = self.client.post("/api/media/generate/image/", {"prompt": ""})
        self.assertEqual(resp.status_code, 400)

        # Invalid aspect ratio -> 400
        resp = self.client.post("/api/media/generate/image/", {"prompt": "A cat", "aspect_ratio": "99:99"})
        self.assertEqual(resp.status_code, 400)

    @patch("media_assets.services.media_service.generate_image")
    def test_generate_image_endpoint(self, mock_gen):
        asset = MediaAsset.objects.create(
            prompt="A cat",
            media_type=MediaAsset.MediaType.IMAGE,
            model_name="imagen-3.0",
        )
        asset.file.save("cat.jpg", ContentFile(b"cat"), save=True)
        mock_gen.return_value = [asset]

        resp = self.client.post("/api/media/generate/image/", {"prompt": "A cat", "aspect_ratio": "1:1"})
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.data[0]["id"], str(asset.id))


class MediaToolsTests(TestCase):
    def setUp(self):
        self.asset = MediaAsset.objects.create(
            prompt="A majestic lion",
            media_type=MediaAsset.MediaType.IMAGE,
            model_name="imagen-3.0",
            aspect_ratio="1:1",
        )
        self.asset.file.save("lion.jpg", ContentFile(b"lion-bytes"), save=True)

    @patch("media_assets.services.media_service.generate_image")
    def test_generate_image_tool(self, mock_gen):
        mock_gen.return_value = [self.asset]
        res = media_tools.generate_image.func("A majestic lion")
        self.assertTrue(res.get("created"))
        self.assertEqual(res["asset"]["id"], str(self.asset.id))

    @patch("media_assets.services.media_service.submit_video_generation")
    def test_generate_video_tool_returns_job_id_not_url(self, mock_submit):
        job = MediaGenerationJob.objects.create(
            prompt="Lion walking in savannah",
            status=MediaGenerationJob.Status.PENDING,
        )
        mock_submit.return_value = job
        res = media_tools.generate_video.func("Lion walking in savannah")
        self.assertTrue(res.get("submitted"))
        self.assertEqual(res["job_id"], str(job.id))
        self.assertNotIn("url", res)  # Must return job_id, NOT immediate URL

    def test_check_media_job_status_tool(self):
        job = MediaGenerationJob.objects.create(
            prompt="Lion running",
            status=MediaGenerationJob.Status.COMPLETED,
            result_asset=self.asset,
        )
        res = media_tools.check_media_job_status.func(str(job.id))
        self.assertEqual(res["status"], "completed")
        self.assertTrue(res["completed"])
        self.assertEqual(res["asset"]["id"], str(self.asset.id))

    def test_get_media_asset_details_tool(self):
        res = media_tools.get_media_asset_details.func(str(self.asset.id))
        self.assertEqual(res["id"], str(self.asset.id))
        self.assertEqual(res["media_type"], "image")

    def test_list_recent_media_assets_tool(self):
        res = media_tools.list_recent_media_assets.func(limit=10)
        self.assertIsInstance(res, list)
        self.assertGreaterEqual(len(res), 1)

    def test_attach_media_to_linkedin_draft_no_file_copy(self):
        draft = LinkedInDraft.objects.create(body="Check out our new visual!")
        res = media_tools.attach_media_to_social_draft.func(
            platform="linkedin",
            draft_id=draft.id,
            asset_id=str(self.asset.id),
        )
        self.assertTrue(res.get("attached"))
        draft.refresh_from_db()
        self.assertEqual(draft.image.name, self.asset.file.name)

    def test_attach_media_to_threads_draft_no_file_copy(self):
        draft = ThreadsDraft.objects.create(body="Look at this threads image!")
        res = media_tools.attach_media_to_social_draft.func(
            platform="threads",
            draft_id=draft.id,
            asset_id=str(self.asset.id),
        )
        self.assertTrue(res.get("attached"))
        draft.refresh_from_db()
        self.assertEqual(draft.image.name, self.asset.file.name)

    def test_attach_media_invalid_platform_returns_error(self):
        res = media_tools.attach_media_to_social_draft.func(
            platform="unknown_social",
            draft_id=1,
            asset_id=str(self.asset.id),
        )
        self.assertIn("error", res)
