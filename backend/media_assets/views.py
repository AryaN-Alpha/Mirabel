import logging
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from core.services.providers.media_base import (
    MediaGenerationError,
    ProviderAuthenticationError,
    ProviderPolicyRejection,
    ProviderRateLimitError,
)
from linkedin.models import LinkedInDraft
from media_assets.models import MediaAsset, MediaGenerationJob
from media_assets.serializers import MediaAssetSerializer, MediaGenerationJobSerializer
from media_assets.services import media_service
from threads.models import ThreadsDraft

logger = logging.getLogger("media_assets")

MAX_PROMPT_LENGTH = 2000
MAX_VARIATIONS = 4
MAX_DURATION_SECONDS = 8
MIN_DURATION_SECONDS = 4
ALLOWED_IMAGE_ASPECT_RATIOS = {"1:1", "16:9", "9:16", "4:3", "3:4"}
ALLOWED_VIDEO_ASPECT_RATIOS = {"16:9", "9:16"}


def _parse_int(value: object, default: int, param_name: str) -> tuple[int | None, str | None]:
    if value is None or value == "":
        return default, None
    try:
        return int(value), None  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None, f"Invalid value for {param_name}; must be an integer."


class MediaAssetListView(APIView):
    """List assets or filter by media_type / search query."""

    def get(self, request):
        qs = MediaAsset.objects.all()
        media_type = request.query_params.get("media_type")
        if media_type in (MediaAsset.MediaType.IMAGE, MediaAsset.MediaType.VIDEO):
            qs = qs.filter(media_type=media_type)

        search = request.query_params.get("search", "").strip()
        if search:
            qs = qs.filter(prompt__icontains=search)

        serializer = MediaAssetSerializer(qs[:100], many=True)
        return Response(serializer.data)


class MediaAssetDetailView(APIView):
    """Retrieve or delete an individual media asset."""

    def get(self, request, pk):
        try:
            asset = MediaAsset.objects.get(id=pk)
        except (MediaAsset.DoesNotExist, ValueError):
            return Response({"error": "Media asset not found."}, status=status.HTTP_404_NOT_FOUND)

        serializer = MediaAssetSerializer(asset)
        return Response(serializer.data)

    def delete(self, request, pk):
        try:
            asset = MediaAsset.objects.get(id=pk)
        except (MediaAsset.DoesNotExist, ValueError):
            return Response({"error": "Media asset not found."}, status=status.HTTP_404_NOT_FOUND)

        asset.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class GenerateImageView(APIView):
    """Synchronous image generation endpoint."""

    def post(self, request):
        prompt = request.data.get("prompt", "").strip()
        if not prompt:
            return Response({"error": "Prompt is required."}, status=status.HTTP_400_BAD_REQUEST)
        if len(prompt) > MAX_PROMPT_LENGTH:
            return Response(
                {"error": f"Prompt exceeds maximum allowed length of {MAX_PROMPT_LENGTH} characters."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        aspect_ratio = request.data.get("aspect_ratio", "1:1")
        if aspect_ratio not in ALLOWED_IMAGE_ASPECT_RATIOS:
            return Response(
                {"error": f"Invalid aspect_ratio. Allowed values: {', '.join(sorted(ALLOWED_IMAGE_ASPECT_RATIOS))}."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        negative_prompt = request.data.get("negative_prompt", "").strip()
        number_of_images, err = _parse_int(request.data.get("number_of_images"), 1, "number_of_images")
        if err:
            return Response({"error": err}, status=status.HTTP_400_BAD_REQUEST)
        if not 1 <= number_of_images <= MAX_VARIATIONS:
            return Response(
                {"error": f"number_of_images must be between 1 and {MAX_VARIATIONS}."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            assets = media_service.generate_image(
                prompt=prompt,
                aspect_ratio=aspect_ratio,
                negative_prompt=negative_prompt,
                number_of_images=number_of_images,
            )
            serializer = MediaAssetSerializer(assets, many=True)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        except ProviderAuthenticationError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_401_UNAUTHORIZED)
        except ProviderRateLimitError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_429_TOO_MANY_REQUESTS)
        except ProviderPolicyRejection as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except MediaGenerationError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_502_BAD_GATEWAY)
        except Exception as exc:
            logger.exception("Unexpected error in GenerateImageView: %s", exc)
            return Response({"error": "Image generation failed. Please try again later."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class GenerateVideoView(APIView):
    """Asynchronous video generation job submission."""

    def post(self, request):
        prompt = request.data.get("prompt", "").strip()
        if not prompt:
            return Response({"error": "Prompt is required."}, status=status.HTTP_400_BAD_REQUEST)
        if len(prompt) > MAX_PROMPT_LENGTH:
            return Response(
                {"error": f"Prompt exceeds maximum allowed length of {MAX_PROMPT_LENGTH} characters."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        aspect_ratio = request.data.get("aspect_ratio", "16:9")
        if aspect_ratio not in ALLOWED_VIDEO_ASPECT_RATIOS:
            return Response(
                {"error": f"Invalid aspect_ratio for video. Allowed values: {', '.join(sorted(ALLOWED_VIDEO_ASPECT_RATIOS))}."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        duration_seconds, err = _parse_int(request.data.get("duration_seconds"), 6, "duration_seconds")
        if err:
            return Response({"error": err}, status=status.HTTP_400_BAD_REQUEST)
        if not MIN_DURATION_SECONDS <= duration_seconds <= MAX_DURATION_SECONDS:
            return Response(
                {"error": f"duration_seconds must be between {MIN_DURATION_SECONDS} and {MAX_DURATION_SECONDS}."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            job = media_service.submit_video_generation(
                prompt=prompt,
                aspect_ratio=aspect_ratio,
                duration_seconds=duration_seconds,
            )
            serializer = MediaGenerationJobSerializer(job)
            return Response(serializer.data, status=status.HTTP_202_ACCEPTED)
        except ProviderAuthenticationError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_401_UNAUTHORIZED)
        except Exception as exc:
            logger.exception("Unexpected error in GenerateVideoView: %s", exc)
            return Response({"error": "Failed to submit video generation job. Please try again later."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class GenerateImageToVideoView(APIView):
    """Asynchronous image-to-video job submission."""

    def post(self, request):
        source_asset_id = request.data.get("source_asset_id")
        if not source_asset_id:
            return Response({"error": "source_asset_id is required."}, status=status.HTTP_400_BAD_REQUEST)

        prompt = request.data.get("prompt", "").strip()
        if len(prompt) > MAX_PROMPT_LENGTH:
            return Response(
                {"error": f"Prompt exceeds maximum allowed length of {MAX_PROMPT_LENGTH} characters."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        aspect_ratio = request.data.get("aspect_ratio", "16:9")
        if aspect_ratio not in ALLOWED_VIDEO_ASPECT_RATIOS:
            return Response(
                {"error": f"Invalid aspect_ratio for video. Allowed values: {', '.join(sorted(ALLOWED_VIDEO_ASPECT_RATIOS))}."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        duration_seconds, err = _parse_int(request.data.get("duration_seconds"), 6, "duration_seconds")
        if err:
            return Response({"error": err}, status=status.HTTP_400_BAD_REQUEST)
        if not MIN_DURATION_SECONDS <= duration_seconds <= MAX_DURATION_SECONDS:
            return Response(
                {"error": f"duration_seconds must be between {MIN_DURATION_SECONDS} and {MAX_DURATION_SECONDS}."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            job = media_service.submit_image_to_video(
                source_asset_id=source_asset_id,
                prompt=prompt,
                aspect_ratio=aspect_ratio,
                duration_seconds=duration_seconds,
            )
            serializer = MediaGenerationJobSerializer(job)
            return Response(serializer.data, status=status.HTTP_202_ACCEPTED)
        except MediaAsset.DoesNotExist:
            return Response({"error": "Source image asset not found."}, status=status.HTTP_404_NOT_FOUND)
        except ValueError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except ProviderAuthenticationError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_401_UNAUTHORIZED)
        except Exception as exc:
            logger.exception("Unexpected error in GenerateImageToVideoView: %s", exc)
            return Response({"error": "Failed to submit image-to-video job. Please try again later."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class MediaAssetVariationsView(APIView):
    """Generate variations of an existing image asset."""

    def post(self, request, pk):
        count, err = _parse_int(request.data.get("count"), 1, "count")
        if err:
            return Response({"error": err}, status=status.HTTP_400_BAD_REQUEST)
        if not 1 <= count <= MAX_VARIATIONS:
            return Response(
                {"error": f"count must be between 1 and {MAX_VARIATIONS}."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            assets = media_service.generate_variations(asset_id=pk, count=count)
            serializer = MediaAssetSerializer(assets, many=True)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        except MediaAsset.DoesNotExist:
            return Response({"error": "Media asset not found."}, status=status.HTTP_404_NOT_FOUND)
        except ValueError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except ProviderAuthenticationError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_401_UNAUTHORIZED)
        except MediaGenerationError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_502_BAD_GATEWAY)
        except Exception as exc:
            logger.exception("Unexpected error in MediaAssetVariationsView: %s", exc)
            return Response({"error": "Failed to generate variations. Please try again later."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class MediaAssetAnalyzeView(APIView):
    """Multimodal analysis of a media asset."""

    def post(self, request, pk):
        focus = request.data.get("focus", "").strip()
        try:
            analysis = media_service.analyze_media(asset_id=pk, focus=focus)
            return Response(analysis, status=status.HTTP_200_OK)
        except MediaAsset.DoesNotExist:
            return Response({"error": "Media asset not found."}, status=status.HTTP_404_NOT_FOUND)
        except ProviderAuthenticationError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_401_UNAUTHORIZED)
        except ValueError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as exc:
            logger.exception("Unexpected error in MediaAssetAnalyzeView: %s", exc)
            return Response({"error": "Failed to analyze media asset. Please try again later."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class MediaJobDetailView(APIView):
    """Poll the status of an asynchronous generation job.

    Exempt from the global 30/min AnonRateThrottle so client-side polling
    (e.g. 1.5s interval in mediaJobPolling.js) does not hit false-positive 429s.
    """

    throttle_classes = []

    def get(self, request, pk):
        try:
            job = MediaGenerationJob.objects.get(id=pk)
        except (MediaGenerationJob.DoesNotExist, ValueError):
            return Response({"error": "Media generation job not found."}, status=status.HTTP_404_NOT_FOUND)

        serializer = MediaGenerationJobSerializer(job)
        return Response(serializer.data)


class MediaJobListView(APIView):
    """List recent generation jobs."""

    def get(self, request):
        jobs = MediaGenerationJob.objects.all()[:50]
        serializer = MediaGenerationJobSerializer(jobs, many=True)
        return Response(serializer.data)


class AttachMediaToDraftView(APIView):
    """Attach a MediaAsset to an existing LinkedIn or Threads draft.

    POST /api/media/assets/<pk>/attach/
    Body: { "platform": "linkedin"|"threads", "draft_id": <int> }

    Points the draft's image FileField at the MediaAsset's existing stored
    file path (same storage backend — no file copy required).
    """

    def post(self, request, pk):
        try:
            asset = MediaAsset.objects.get(id=pk)
        except (MediaAsset.DoesNotExist, ValueError):
            return Response({"error": "Media asset not found."}, status=status.HTTP_404_NOT_FOUND)

        if not asset.file:
            return Response(
                {"error": "Media asset has no associated file."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        platform = (request.data.get("platform") or "").lower().strip()
        draft_id = request.data.get("draft_id")
        if not platform or not draft_id:
            return Response(
                {"error": "Both 'platform' and 'draft_id' are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            draft_id = int(draft_id)
        except (TypeError, ValueError):
            return Response({"error": "'draft_id' must be an integer."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            if platform == "linkedin":
                draft = LinkedInDraft.objects.get(id=draft_id)
                draft.image.name = asset.file.name
                draft.save(update_fields=["image", "updated_at"])
                return Response(
                    {
                        "attached": True,
                        "platform": "linkedin",
                        "draft_id": draft.id,
                        "asset_id": str(asset.id),
                        "image_url": draft.image.url if draft.image else "",
                    }
                )
            elif platform == "threads":
                draft = ThreadsDraft.objects.get(id=draft_id)
                draft.image.name = asset.file.name
                draft.save(update_fields=["image"])
                return Response(
                    {
                        "attached": True,
                        "platform": "threads",
                        "draft_id": draft.id,
                        "asset_id": str(asset.id),
                        "image_url": draft.image.url if draft.image else "",
                    }
                )
            else:
                return Response(
                    {"error": f"Unsupported platform {platform!r}. Supported: 'linkedin', 'threads'."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        except LinkedInDraft.DoesNotExist:
            return Response({"error": f"LinkedIn draft {draft_id} not found."}, status=status.HTTP_404_NOT_FOUND)
        except ThreadsDraft.DoesNotExist:
            return Response({"error": f"Threads draft {draft_id} not found."}, status=status.HTTP_404_NOT_FOUND)
        except Exception as exc:
            logger.exception("AttachMediaToDraftView error for asset %s: %s", pk, exc)
            return Response(
                {"error": f"Failed to attach media to draft: {exc}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
