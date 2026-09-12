from __future__ import annotations

import logging
import os
import socket
import time
from typing import Any

from google import genai
from google.genai import errors as genai_errors
from google.genai import types
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

from .credentials import get_api_key
from .media_base import (
    MediaCapability,
    MediaGenerationError,
    MediaProvider,
    ProviderAuthenticationError,
    ProviderImageResult,
    ProviderPolicyRejection,
    ProviderRateLimitError,
    ProviderTimeoutError,
    ProviderVideoJobResult,
    UnsupportedMediaOperation,
)

logger = logging.getLogger("media_assets")

_RETRYABLE = (genai_errors.ServerError,)


def _map_genai_error(exc: Exception) -> Exception:
    err_str = str(exc).upper()
    if isinstance(exc, genai_errors.ClientError):
        if any(k in err_str for k in ("401", "403", "API_KEY", "UNAUTHENTICATED", "PERMISSION_DENIED")):
            return ProviderAuthenticationError(f"Authentication failed with Google AI: {exc}")
        if any(k in err_str for k in ("429", "RESOURCE_EXHAUSTED", "QUOTA")):
            return ProviderRateLimitError(f"Google AI quota or rate limit exceeded: {exc}")
        if any(k in err_str for k in ("SAFETY", "BLOCKED", "POLICY", "PROHIBITED")):
            return ProviderPolicyRejection(f"Google AI safety/policy rejection: {exc}")
        return MediaGenerationError(f"Google AI client error: {exc}")
    if isinstance(exc, genai_errors.ServerError):
        return MediaGenerationError(f"Google AI server error: {exc}")
    if isinstance(exc, (TimeoutError, socket.timeout)):
        return ProviderTimeoutError(f"Google AI request timed out: {exc}")
    if isinstance(exc, genai_errors.APIError):
        return MediaGenerationError(f"Google AI API error: {exc}")
    return MediaGenerationError(f"Media generation failed: {exc}")


class GoogleMediaProvider(MediaProvider):
    """Google Media Provider implementing Imagen 3 and Veo 2 models."""

    def __init__(
        self,
        image_model: str | None = None,
        video_model: str | None = None,
    ) -> None:
        self.image_model = image_model or os.getenv("GOOGLE_IMAGE_MODEL", "imagen-3.0-generate-002")
        self.video_model = video_model or os.getenv("GOOGLE_VIDEO_MODEL", "veo-2.0-generate-001")

    def _get_client(self) -> genai.Client:
        api_key = get_api_key("gemini")
        if not api_key:
            raise ProviderAuthenticationError("No Gemini API key configured.")
        return genai.Client(api_key=api_key)

    def supports(self, capability: MediaCapability) -> bool:
        return capability in {
            MediaCapability.IMAGE_GENERATION,
            MediaCapability.VIDEO_GENERATION,
            MediaCapability.IMAGE_TO_VIDEO,
            MediaCapability.IMAGE_EDITING,
        }

    # =========================================================================
    # Tenacity-retried SDK invocations (reraise=True, no exception conversion)
    # =========================================================================

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=8),
        retry=retry_if_exception_type(_RETRYABLE),
        reraise=True,
    )
    def _call_generate_images(self, client: genai.Client, **kwargs: Any) -> types.GenerateImagesResponse:
        return client.models.generate_images(**kwargs)

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=8),
        retry=retry_if_exception_type(_RETRYABLE),
        reraise=True,
    )
    def _call_generate_videos(self, client: genai.Client, **kwargs: Any) -> types.GenerateVideosOperation:
        return client.models.generate_videos(**kwargs)

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=8),
        retry=retry_if_exception_type(_RETRYABLE),
        reraise=True,
    )
    def _call_get_operation(self, client: genai.Client, **kwargs: Any) -> types.GenerateVideosOperation:
        return client.operations.get(**kwargs)

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=8),
        retry=retry_if_exception_type(_RETRYABLE),
        reraise=True,
    )
    def _call_edit_image(self, client: genai.Client, **kwargs: Any) -> types.EditImageResponse:
        return client.models.edit_image(**kwargs)

    # =========================================================================
    # Public Provider Interface with Exception Mapping
    # =========================================================================

    def generate_image(
        self,
        prompt: str,
        *,
        aspect_ratio: str = "1:1",
        negative_prompt: str = "",
        number_of_images: int = 1,
        **kwargs: Any,
    ) -> list[ProviderImageResult]:
        client = self._get_client()
        cfg = types.GenerateImagesConfig(
            number_of_images=number_of_images,
            aspect_ratio=aspect_ratio,
            negative_prompt=negative_prompt or None,
            output_mime_type="image/jpeg",
        )
        try:
            started = time.perf_counter()
            response = self._call_generate_images(
                client,
                model=self.image_model,
                prompt=prompt,
                config=cfg,
            )
            elapsed = time.perf_counter() - started
            logger.info("google_media image generated in %.2fs (count=%d)", elapsed, len(response.generated_images))
        except Exception as exc:
            mapped = _map_genai_error(exc)
            logger.error("google_media generate_image failed: %s", mapped)
            raise mapped from exc

        results: list[ProviderImageResult] = []
        for gen_img in getattr(response, "generated_images", []):
            img_obj = getattr(gen_img, "image", None)
            raw_bytes = getattr(img_obj, "image_bytes", None)
            if raw_bytes:
                results.append(
                    ProviderImageResult(
                        image_bytes=raw_bytes,
                        mime_type="image/jpeg",
                        aspect_ratio=aspect_ratio,
                    )
                )
        if not results:
            raise MediaGenerationError("Google Imagen returned no image data.")
        return results

    def start_video_generation(
        self,
        prompt: str,
        *,
        aspect_ratio: str = "16:9",
        duration_seconds: int = 6,
        **kwargs: Any,
    ) -> ProviderVideoJobResult:
        client = self._get_client()
        cfg = types.GenerateVideosConfig(
            aspect_ratio=aspect_ratio,
            duration_seconds=duration_seconds,
            number_of_videos=1,
        )
        try:
            op = self._call_generate_videos(
                client,
                model=self.video_model,
                prompt=prompt,
                config=cfg,
            )
            logger.info("google_media video generation initiated: operation=%s", op.name)
            return ProviderVideoJobResult(
                operation_name=op.name,
                status="processing" if not op.done else "completed",
                done=bool(op.done),
            )
        except Exception as exc:
            mapped = _map_genai_error(exc)
            logger.error("google_media start_video_generation failed: %s", mapped)
            raise mapped from exc

    def start_image_to_video(
        self,
        image_bytes: bytes,
        mime_type: str,
        *,
        prompt: str = "",
        aspect_ratio: str = "16:9",
        duration_seconds: int = 6,
        **kwargs: Any,
    ) -> ProviderVideoJobResult:
        client = self._get_client()
        cfg = types.GenerateVideosConfig(
            aspect_ratio=aspect_ratio,
            duration_seconds=duration_seconds,
            number_of_videos=1,
        )
        try:
            image_input = types.Image(image_bytes=image_bytes, mime_type=mime_type)
            op = self._call_generate_videos(
                client,
                model=self.video_model,
                prompt=prompt or None,
                image=image_input,
                config=cfg,
            )
            logger.info("google_media image-to-video initiated: operation=%s", op.name)
            return ProviderVideoJobResult(
                operation_name=op.name,
                status="processing" if not op.done else "completed",
                done=bool(op.done),
            )
        except Exception as exc:
            mapped = _map_genai_error(exc)
            logger.error("google_media start_image_to_video failed: %s", mapped)
            raise mapped from exc

    def poll_video_generation(self, operation_name: str) -> ProviderVideoJobResult:
        client = self._get_client()
        try:
            operation_stub = types.GenerateVideosOperation(name=operation_name)
            op = self._call_get_operation(client, operation=operation_stub)
        except Exception as exc:
            mapped = _map_genai_error(exc)
            logger.error("google_media poll_video_generation error for %s: %s", operation_name, mapped)
            raise mapped from exc

        if not op.done:
            return ProviderVideoJobResult(
                operation_name=operation_name,
                status="processing",
                done=False,
            )

        if op.error:
            error_msg = str(op.error)
            logger.warning("google_media video operation completed with error: %s", error_msg)
            return ProviderVideoJobResult(
                operation_name=operation_name,
                status="failed",
                done=True,
                error=error_msg,
            )

        # Extract video bytes from completed response
        response = op.response
        generated_videos = getattr(response, "generated_videos", []) if response else []
        video_bytes = None
        mime_type = "video/mp4"

        if generated_videos:
            first_video = generated_videos[0].video
            video_bytes = getattr(first_video, "video_bytes", None)
            mime_type = getattr(first_video, "mime_type", "video/mp4")

        return ProviderVideoJobResult(
            operation_name=operation_name,
            status="completed" if video_bytes else "failed",
            done=True,
            video_bytes=video_bytes,
            mime_type=mime_type,
            error="" if video_bytes else "No video bytes returned in completed operation",
        )

    def edit_image(
        self,
        prompt: str,
        base_image_bytes: bytes,
        base_mime_type: str,
        *,
        aspect_ratio: str = "1:1",
        **kwargs: Any,
    ) -> list[ProviderImageResult]:
        client = self._get_client()
        cfg = types.EditImageConfig(
            number_of_images=1,
            aspect_ratio=aspect_ratio or None,
            output_mime_type="image/jpeg",
        )
        ref_image = types.Image(image_bytes=base_image_bytes, mime_type=base_mime_type)
        try:
            response = self._call_edit_image(
                client,
                model=self.image_model,
                prompt=prompt,
                reference_images=[ref_image],
                config=cfg,
            )
        except Exception as exc:
            mapped = _map_genai_error(exc)
            logger.error("google_media edit_image failed: %s", mapped)
            raise mapped from exc

        results: list[ProviderImageResult] = []
        for gen_img in getattr(response, "generated_images", []):
            img_obj = getattr(gen_img, "image", None)
            raw_bytes = getattr(img_obj, "image_bytes", None)
            if raw_bytes:
                results.append(
                    ProviderImageResult(
                        image_bytes=raw_bytes,
                        mime_type="image/jpeg",
                        aspect_ratio=aspect_ratio,
                    )
                )
        if not results:
            raise MediaGenerationError("Google Imagen returned no edited image data.")
        return results
