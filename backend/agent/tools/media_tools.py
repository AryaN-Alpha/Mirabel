"""AI Creative and Media Generation tools for the agent.

Supports image generation, asynchronous video generation (text-to-video and
image-to-video), media variations, multimodal analysis, and attaching generated
media to social media drafts (LinkedIn, Threads).
"""

from __future__ import annotations

import logging
from typing import Any

from langchain_core.tools import tool

from linkedin.models import LinkedInDraft
from media_assets.models import MediaAsset, MediaGenerationJob
from media_assets.services import media_service
from threads.models import ThreadsDraft

logger = logging.getLogger("media_assets")


def _serialize_asset(asset: MediaAsset) -> dict[str, Any]:
    return {
        "id": str(asset.id),
        "media_type": asset.media_type,
        "prompt": asset.prompt,
        "aspect_ratio": asset.aspect_ratio,
        "url": asset.url,
        "model_name": asset.model_name,
        "duration_seconds": asset.duration_seconds,
        "file_size_bytes": asset.file_size_bytes,
        "created_at": asset.created_at.isoformat() if asset.created_at else None,
    }


@tool
def generate_image(
    prompt: str,
    aspect_ratio: str = "1:1",
    negative_prompt: str = "",
) -> dict[str, Any]:
    """Generate an image synchronously using AI (Google Imagen 3).

    Returns the created MediaAsset with its URL immediately upon generation.

    Args:
        prompt: Detailed description of the image to generate.
        aspect_ratio: Aspect ratio of the image. Choices: "1:1", "16:9", "9:16", "4:3", "3:4". Default is "1:1".
        negative_prompt: Optional description of elements to avoid or exclude from the image.
    """
    try:
        assets = media_service.generate_image(
            prompt=prompt,
            aspect_ratio=aspect_ratio,
            negative_prompt=negative_prompt,
            number_of_images=1,
        )
        if not assets:
            return {"error": "No image was generated."}
        return {"created": True, "asset": _serialize_asset(assets[0])}
    except Exception as exc:
        logger.error("generate_image tool error: %s", exc)
        return {"error": f"Image generation failed: {exc}"}


@tool
def generate_video(
    prompt: str,
    aspect_ratio: str = "16:9",
    duration_seconds: int = 6,
) -> dict[str, Any]:
    """Initiate asynchronous video generation using AI (Google Veo 2).

    IMPORTANT: This operation is ASYNCHRONOUS and takes several minutes.
    It returns a job_id immediately, NOT a video URL. You must inform the user
    that the video has started generating in the background. To check if the video
    is ready, call `check_media_job_status(job_id)`.

    Args:
        prompt: Detailed cinematic prompt describing the action, camera movement, and subject of the video.
        aspect_ratio: Aspect ratio of the video. Choices: "16:9", "9:16". Default is "16:9".
        duration_seconds: Length of the generated video in seconds (between 4 and 8, default 6).
    """
    try:
        job = media_service.submit_video_generation(
            prompt=prompt,
            aspect_ratio=aspect_ratio,
            duration_seconds=duration_seconds,
        )
        return {
            "submitted": True,
            "job_id": str(job.id),
            "status": job.status,
            "prompt": job.prompt,
            "aspect_ratio": job.aspect_ratio,
            "duration_seconds": job.duration_seconds,
            "message": (
                f"Video generation job {job.id} has started in the background. "
                "It will take 1-3 minutes. Use check_media_job_status to check completion."
            ),
        }
    except Exception as exc:
        logger.error("generate_video tool error: %s", exc)
        return {"error": f"Failed to submit video generation: {exc}"}


@tool
def generate_image_to_video(
    source_asset_id: str,
    prompt: str = "",
    aspect_ratio: str = "16:9",
    duration_seconds: int = 6,
) -> dict[str, Any]:
    """Animate an existing image asset into a video asynchronously using AI (Google Veo 2).

    IMPORTANT: This operation is ASYNCHRONOUS and takes several minutes.
    It returns a job_id immediately, NOT a video URL. Check completion later
    using `check_media_job_status(job_id)`.

    Args:
        source_asset_id: The UUID of the existing image MediaAsset to animate.
        prompt: Optional direction for the motion, camera action, or animation style.
        aspect_ratio: Video aspect ratio ("16:9" or "9:16", default "16:9").
        duration_seconds: Duration in seconds (4-8, default 6).
    """
    try:
        job = media_service.submit_image_to_video(
            source_asset_id=source_asset_id,
            prompt=prompt,
            aspect_ratio=aspect_ratio,
            duration_seconds=duration_seconds,
        )
        return {
            "submitted": True,
            "job_id": str(job.id),
            "source_asset_id": source_asset_id,
            "status": job.status,
            "message": (
                f"Image-to-video job {job.id} has started in the background. "
                "Use check_media_job_status to check completion."
            ),
        }
    except Exception as exc:
        logger.error("generate_image_to_video tool error: %s", exc)
        return {"error": f"Failed to submit image-to-video: {exc}"}


@tool
def check_media_job_status(job_id: str) -> dict[str, Any]:
    """Check the status of an asynchronous video or media generation job.

    Args:
        job_id: The UUID of the MediaGenerationJob to query.
    """
    try:
        job = MediaGenerationJob.objects.get(id=job_id)
        result: dict[str, Any] = {
            "job_id": str(job.id),
            "status": job.status,
            "progress_percent": job.progress_percent,
            "completed": job.status == MediaGenerationJob.Status.COMPLETED,
        }
        if job.status == MediaGenerationJob.Status.COMPLETED and job.result_asset:
            result["asset"] = _serialize_asset(job.result_asset)
        elif job.status == MediaGenerationJob.Status.FAILED:
            result["error"] = job.error_message or "Video generation failed."
        return result
    except MediaGenerationJob.DoesNotExist:
        return {"error": f"Job {job_id} not found."}
    except Exception as exc:
        return {"error": f"Error querying job: {exc}"}


@tool
def get_media_asset_details(asset_id: str) -> dict[str, Any]:
    """Retrieve complete metadata and URLs for a specific MediaAsset.

    Args:
        asset_id: The UUID of the MediaAsset to fetch.
    """
    try:
        asset = MediaAsset.objects.get(id=asset_id)
        return _serialize_asset(asset)
    except MediaAsset.DoesNotExist:
        return {"error": f"MediaAsset {asset_id} not found."}
    except Exception as exc:
        return {"error": f"Error fetching asset: {exc}"}


def _serialize_compact_asset(asset: MediaAsset) -> dict[str, Any]:
    prompt_snippet = (asset.prompt[:60] + "...") if len(asset.prompt) > 60 else asset.prompt
    return {
        "id": str(asset.id),
        "media_type": asset.media_type,
        "prompt": prompt_snippet,
        "aspect_ratio": asset.aspect_ratio,
        "created_at": asset.created_at.strftime("%Y-%m-%d") if asset.created_at else None,
    }


@tool
def list_recent_media_assets(media_type: str = "", limit: int = 5) -> list[dict[str, Any]]:
    """List recently generated images or videos in the Media Library.

    Args:
        media_type: Optional filter: "image" or "video". Leave blank for all types.
        limit: Number of assets to return (1 to 20, default 5).
    """
    try:
        qs = MediaAsset.objects.all()
        if media_type in ("image", "video"):
            qs = qs.filter(media_type=media_type)
        safe_limit = max(1, min(limit, 20))
        return [_serialize_compact_asset(a) for a in qs[:safe_limit]]
    except Exception as exc:
        return [{"error": f"Failed to list media assets: {exc}"}]


@tool
def generate_media_variations(asset_id: str, count: int = 1) -> dict[str, Any]:
    """Generate visual variations of an existing image asset.

    Args:
        asset_id: The UUID of the image MediaAsset to create variations for.
        count: How many variations to generate (1 to 4, default 1).
    """
    try:
        safe_count = max(1, min(count, 4))
        assets = media_service.generate_variations(asset_id=asset_id, count=safe_count)
        return {
            "created": True,
            "variations": [_serialize_asset(a) for a in assets],
        }
    except Exception as exc:
        logger.error("generate_media_variations tool error: %s", exc)
        return {"error": f"Failed to generate variations: {exc}"}


@tool
def analyze_media_asset(asset_id: str, focus: str = "") -> dict[str, Any]:
    """Analyze the content, composition, and visual style of a media asset using multimodal AI.

    Args:
        asset_id: The UUID of the MediaAsset to analyze.
        focus: Optional specific element or question to focus on (e.g. "color contrast", "objects").
    """
    try:
        result = media_service.analyze_media(asset_id=asset_id, focus=focus)
        return result
    except Exception as exc:
        logger.error("analyze_media_asset tool error: %s", exc)
        return {"error": f"Failed to analyze media asset: {exc}"}


@tool
def attach_media_to_social_draft(
    platform: str,
    draft_id: int,
    asset_id: str,
) -> dict[str, Any]:
    """Attach a generated MediaAsset directly to an existing LinkedIn or Threads draft.

    Args:
        platform: "linkedin" or "threads".
        draft_id: The integer ID of the LinkedInDraft or ThreadsDraft.
        asset_id: The UUID of the MediaAsset to attach.
    """
    try:
        asset = MediaAsset.objects.get(id=asset_id)
        if not asset.file:
            return {"error": f"MediaAsset {asset_id} has no file."}

        norm_platform = platform.lower().strip()
        if norm_platform == "linkedin":
            draft = LinkedInDraft.objects.get(id=draft_id)
            draft.image.name = asset.file.name
            draft.save(update_fields=["image", "updated_at"])
            return {
                "attached": True,
                "platform": "linkedin",
                "draft_id": draft.id,
                "asset_id": str(asset.id),
                "image_url": draft.image.url if draft.image else "",
            }
        elif norm_platform == "threads":
            draft = ThreadsDraft.objects.get(id=draft_id)
            draft.image.name = asset.file.name
            draft.save(update_fields=["image", "updated_at"])
            return {
                "attached": True,
                "platform": "threads",
                "draft_id": draft.id,
                "asset_id": str(asset.id),
                "image_url": draft.image.url if draft.image else "",
            }
        else:
            return {"error": f"Unsupported platform {platform!r}. Supported platforms: 'linkedin', 'threads'."}
    except MediaAsset.DoesNotExist:
        return {"error": f"MediaAsset {asset_id} not found."}
    except (LinkedInDraft.DoesNotExist, ThreadsDraft.DoesNotExist):
        return {"error": f"{platform.capitalize()} draft {draft_id} not found."}
    except Exception as exc:
        logger.error("attach_media_to_social_draft tool error: %s", exc)
        return {"error": f"Failed to attach media to draft: {exc}"}


TOOLS = [
    generate_image,
    generate_video,
    generate_image_to_video,
    check_media_job_status,
    get_media_asset_details,
    list_recent_media_assets,
    generate_media_variations,
    analyze_media_asset,
    attach_media_to_social_draft,
]
