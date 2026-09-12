from __future__ import annotations

import base64
import logging
import uuid
from typing import Any

from django.core.files.base import ContentFile
from django.db import transaction

from core.models import ModelPreference
from core.services.providers import get_api_key, get_media_provider
from core.services.providers.media_base import (
    MediaGenerationError,
    ProviderAuthenticationError,
    UnsupportedMediaOperation,
)
from core.services.text_utils import truncate_chars
from media_assets.models import MediaAsset, MediaGenerationJob

logger = logging.getLogger("media_assets")


def generate_image(
    prompt: str,
    *,
    aspect_ratio: str = "1:1",
    negative_prompt: str = "",
    number_of_images: int = 1,
    provider_name: str = "google",
) -> list[MediaAsset]:
    """Synchronously generates one or more images and persists them as MediaAssets."""
    provider = get_media_provider(provider_name)
    results = provider.generate_image(
        prompt,
        aspect_ratio=aspect_ratio,
        negative_prompt=negative_prompt,
        number_of_images=number_of_images,
    )

    created_assets: list[MediaAsset] = []
    for res in results:
        asset_id = uuid.uuid4()
        filename = f"{asset_id.hex}.jpg"
        asset = MediaAsset(
            id=asset_id,
            prompt=prompt,
            negative_prompt=negative_prompt,
            media_type=MediaAsset.MediaType.IMAGE,
            provider=provider_name,
            model_name=getattr(provider, "image_model", "imagen-3.0-generate-002"),
            aspect_ratio=aspect_ratio,
            mime_type=res.mime_type or "image/jpeg",
            file_size_bytes=len(res.image_bytes),
            generation_parameters={
                "aspect_ratio": aspect_ratio,
                "negative_prompt": negative_prompt,
            },
        )
        asset.file.save(filename, ContentFile(res.image_bytes), save=False)
        asset.save()
        created_assets.append(asset)
        logger.info("Created MediaAsset %s (type=image, model=%s)", asset.id, asset.model_name)

    return created_assets


def submit_video_generation(
    prompt: str,
    *,
    aspect_ratio: str = "16:9",
    duration_seconds: int = 6,
    provider_name: str = "google",
) -> MediaGenerationJob:
    """Submits an async video generation job and dispatches Celery processing."""
    from media_assets.tasks import process_video_generation_job

    provider = get_media_provider(provider_name)
    model_name = getattr(provider, "video_model", "veo-2.0-generate-001")

    with transaction.atomic():
        job = MediaGenerationJob.objects.create(
            provider=provider_name,
            model_name=model_name,
            media_type=MediaGenerationJob.MediaType.VIDEO,
            prompt=prompt,
            aspect_ratio=aspect_ratio,
            duration_seconds=duration_seconds,
            status=MediaGenerationJob.Status.PENDING,
            parameters={
                "aspect_ratio": aspect_ratio,
                "duration_seconds": duration_seconds,
            },
        )

    task_result = process_video_generation_job.delay(str(job.id))
    job.celery_task_id = task_result.id
    job.save(update_fields=["celery_task_id", "updated_at"])
    logger.info("Submitted MediaGenerationJob %s (task_id=%s)", job.id, task_result.id)
    return job


def submit_image_to_video(
    source_asset_id: str | uuid.UUID,
    *,
    prompt: str = "",
    aspect_ratio: str = "16:9",
    duration_seconds: int = 6,
    provider_name: str = "google",
) -> MediaGenerationJob:
    """Submits an async image-to-video generation job and dispatches Celery processing."""
    from media_assets.tasks import process_video_generation_job

    source_asset = MediaAsset.objects.get(id=source_asset_id)
    if source_asset.media_type != MediaAsset.MediaType.IMAGE:
        raise ValueError("Source asset for image-to-video must be an image.")

    provider = get_media_provider(provider_name)
    model_name = getattr(provider, "video_model", "veo-2.0-generate-001")

    with transaction.atomic():
        job = MediaGenerationJob.objects.create(
            provider=provider_name,
            model_name=model_name,
            media_type=MediaGenerationJob.MediaType.VIDEO,
            prompt=prompt or source_asset.prompt,
            aspect_ratio=aspect_ratio,
            duration_seconds=duration_seconds,
            status=MediaGenerationJob.Status.PENDING,
            source_asset=source_asset,
            parameters={
                "aspect_ratio": aspect_ratio,
                "duration_seconds": duration_seconds,
                "source_asset_id": str(source_asset.id),
            },
        )

    task_result = process_video_generation_job.delay(str(job.id))
    job.celery_task_id = task_result.id
    job.save(update_fields=["celery_task_id", "updated_at"])
    logger.info("Submitted image-to-video job %s (source=%s, task_id=%s)", job.id, source_asset.id, task_result.id)
    return job


def generate_variations(
    asset_id: str | uuid.UUID,
    *,
    count: int = 1,
    provider_name: str = "google",
) -> list[MediaAsset]:
    """Generates visual variations of an existing image asset."""
    parent_asset = MediaAsset.objects.get(id=asset_id)
    if parent_asset.media_type != MediaAsset.MediaType.IMAGE:
        raise ValueError("Variations are currently supported for image assets only.")

    provider = get_media_provider(provider_name)
    results = provider.generate_image(
        parent_asset.prompt,
        aspect_ratio=parent_asset.aspect_ratio or "1:1",
        negative_prompt=parent_asset.negative_prompt,
        number_of_images=count,
    )

    created: list[MediaAsset] = []
    for res in results:
        new_id = uuid.uuid4()
        asset = MediaAsset(
            id=new_id,
            title=f"Variation of {parent_asset.title or parent_asset.id}",
            prompt=parent_asset.prompt,
            negative_prompt=parent_asset.negative_prompt,
            media_type=MediaAsset.MediaType.IMAGE,
            provider=provider_name,
            model_name=getattr(provider, "image_model", "imagen-3.0-generate-002"),
            aspect_ratio=parent_asset.aspect_ratio,
            mime_type=res.mime_type or "image/jpeg",
            file_size_bytes=len(res.image_bytes),
            source_asset=parent_asset,
            generation_parameters={
                "aspect_ratio": parent_asset.aspect_ratio,
                "parent_asset_id": str(parent_asset.id),
                "is_variation": True,
            },
        )
        asset.file.save(f"{new_id.hex}.jpg", ContentFile(res.image_bytes), save=False)
        asset.save()
        created.append(asset)

    logger.info("Created %d variations for asset %s", len(created), parent_asset.id)
    return created


def analyze_media(asset_id: str | uuid.UUID, focus: str = "") -> dict[str, Any]:
    """Multimodal analysis of a media asset using the active ModelPreference provider."""
    asset = MediaAsset.objects.get(id=asset_id)
    if not asset.file:
        raise ValueError(f"MediaAsset {asset_id} has no associated file.")

    # Guard against loading huge video files into memory (50 MB cap)
    MAX_ANALYSIS_BYTES = 50 * 1024 * 1024
    if asset.file_size_bytes and asset.file_size_bytes > MAX_ANALYSIS_BYTES:
        raise ValueError(
            f"MediaAsset {asset_id} is {asset.file_size_bytes // (1024 * 1024)} MB — "
            "files larger than 50 MB cannot be analyzed inline. "
            "Use the Google File API for large video analysis."
        )

    asset.file.open("rb")
    try:
        raw_bytes = asset.file.read()
    finally:
        asset.file.close()

    # Extra runtime guard: actual byte count may differ from stored metadata
    if len(raw_bytes) > MAX_ANALYSIS_BYTES:
        raise ValueError(
            f"MediaAsset {asset_id} content exceeds the 50 MB inline analysis limit."
        )

    pref = ModelPreference.current()
    provider_name = pref.provider
    model_name = pref.model

    prompt_text = (
        "Analyze this media file in detail. Describe the visual composition, style, subject matter, "
        "color palette, and key visual elements."
    )
    if focus:
        prompt_text += f" Focus specifically on: {focus}"

    analysis_text = ""

    if provider_name == "gemini":
        from google import genai
        from google.genai import types

        api_key = get_api_key("gemini")
        if not api_key:
            raise ProviderAuthenticationError("No Gemini API key configured.")

        client = genai.Client(api_key=api_key)
        mime = asset.mime_type or ("video/mp4" if asset.media_type == "video" else "image/jpeg")
        response = client.models.generate_content(
            model=model_name,
            contents=[
                types.Part(inline_data=types.Blob(mime_type=mime, data=raw_bytes)),
                prompt_text,
            ],
        )
        analysis_text = response.text or ""

    elif provider_name == "openai":
        import openai

        api_key = get_api_key("openai")
        if not api_key:
            raise ProviderAuthenticationError("No OpenAI API key configured.")

        client = openai.OpenAI(api_key=api_key)
        b64 = base64.b64encode(raw_bytes).decode("utf-8")
        mime = asset.mime_type or "image/jpeg"
        response = client.chat.completions.create(
            model=model_name,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt_text},
                        {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{b64}"}},
                    ],
                }
            ],
            max_completion_tokens=600,
        )
        analysis_text = response.choices[0].message.content or ""

    elif provider_name == "anthropic":
        import anthropic

        api_key = get_api_key("anthropic")
        if not api_key:
            raise ProviderAuthenticationError("No Anthropic API key configured.")

        client = anthropic.Anthropic(api_key=api_key)
        b64 = base64.b64encode(raw_bytes).decode("utf-8")
        mime = asset.mime_type or "image/jpeg"
        response = client.messages.create(
            model=model_name,
            max_tokens=600,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image",
                            "source": {"type": "base64", "media_type": mime, "data": b64},
                        },
                        {"type": "text", "text": prompt_text},
                    ],
                }
            ],
        )
        analysis_text = response.content[0].text if response.content else ""

    else:
        # Fallback to Gemini if current text provider lacks multimodal direct adapter
        gemini_key = get_api_key("gemini")
        if gemini_key:
            from google import genai
            from google.genai import types

            client = genai.Client(api_key=gemini_key)
            mime = asset.mime_type or "image/jpeg"
            response = client.models.generate_content(
                model="gemini-2.5-flash",
                contents=[
                    types.Part(inline_data=types.Blob(mime_type=mime, data=raw_bytes)),
                    prompt_text,
                ],
            )
            analysis_text = response.text or ""
            provider_name = "gemini"
            model_name = "gemini-2.5-flash"
        else:
            raise UnsupportedMediaOperation(
                f"Provider {provider_name} does not support media analysis and no Gemini fallback key is available."
            )

    bounded_analysis = truncate_chars(analysis_text, 2000, label="media analysis", call_site="media_service.analyze")
    return {
        "asset_id": str(asset.id),
        "analysis": bounded_analysis,
        "provider": provider_name,
        "model": model_name,
        "media_type": asset.media_type,
    }
