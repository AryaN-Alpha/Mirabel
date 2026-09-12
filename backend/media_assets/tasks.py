from __future__ import annotations

import logging
import time
import uuid

from celery import shared_task
from django.conf import settings
from django.core.files.base import ContentFile

from core.services.providers import get_media_provider
from core.services.providers.media_base import MediaGenerationError
from media_assets.models import MediaAsset, MediaGenerationJob

logger = logging.getLogger("media_assets")

_DEFAULT_TIME_LIMIT = getattr(settings, "MEDIA_VIDEO_TASK_TIME_LIMIT", 600)
_DEFAULT_SOFT_TIME_LIMIT = getattr(settings, "MEDIA_VIDEO_TASK_SOFT_TIME_LIMIT", 540)


@shared_task(
    time_limit=_DEFAULT_TIME_LIMIT,
    soft_time_limit=_DEFAULT_SOFT_TIME_LIMIT,
)
def process_video_generation_job(job_id: str) -> None:
    """Celery task on default queue to execute and poll asynchronous video generation."""
    try:
        job = MediaGenerationJob.objects.get(id=job_id)
    except MediaGenerationJob.DoesNotExist:
        logger.error("process_video_generation_job: Job %s does not exist", job_id)
        return

    # Idempotency check: don't process if already resolved
    if job.status in (
        MediaGenerationJob.Status.COMPLETED,
        MediaGenerationJob.Status.FAILED,
        MediaGenerationJob.Status.CANCELLED,
    ):
        logger.info("process_video_generation_job: Job %s is already settled (%s)", job_id, job.status)
        return

    try:
        provider = get_media_provider(job.provider)

        # Step 1: Initiate if not already initiated
        if not job.operation_name:
            if job.source_asset:
                job.source_asset.file.open("rb")
                try:
                    raw_bytes = job.source_asset.file.read()
                finally:
                    job.source_asset.file.close()

                init_res = provider.start_image_to_video(
                    raw_bytes,
                    job.source_asset.mime_type or "image/jpeg",
                    prompt=job.prompt,
                    aspect_ratio=job.aspect_ratio,
                    duration_seconds=job.duration_seconds,
                )
            else:
                init_res = provider.start_video_generation(
                    job.prompt,
                    aspect_ratio=job.aspect_ratio,
                    duration_seconds=job.duration_seconds,
                )

            job.operation_name = init_res.operation_name
            job.status = MediaGenerationJob.Status.PROCESSING
            job.progress_percent = 10
            job.save(update_fields=["operation_name", "status", "progress_percent", "updated_at"])
            logger.info("Job %s started with operation %s", job.id, job.operation_name)

        # Step 2: Poll until done or timeout
        start_time = time.time()
        max_poll_seconds = _DEFAULT_SOFT_TIME_LIMIT - 30

        while (time.time() - start_time) < max_poll_seconds:
            poll_result = provider.poll_video_generation(job.operation_name)

            if poll_result.done:
                if poll_result.error or not poll_result.video_bytes:
                    err = poll_result.error or "Video generation operation finished with no video data."
                    job.mark_failed(err)
                    logger.error("Job %s failed: %s", job.id, err)
                    return

                # Create resulting MediaAsset
                asset_id = uuid.uuid4()
                filename = f"{asset_id.hex}.mp4"
                asset = MediaAsset(
                    id=asset_id,
                    title=f"Video for {job.prompt[:40]}",
                    prompt=job.prompt,
                    media_type=MediaAsset.MediaType.VIDEO,
                    provider=job.provider,
                    model_name=job.model_name,
                    aspect_ratio=job.aspect_ratio,
                    duration_seconds=float(job.duration_seconds),
                    mime_type=poll_result.mime_type or "video/mp4",
                    file_size_bytes=len(poll_result.video_bytes),
                    source_asset=job.source_asset,
                    generation_parameters=job.parameters,
                )
                asset.file.save(filename, ContentFile(poll_result.video_bytes), save=False)
                asset.save()

                job.mark_completed(asset)
                logger.info("Job %s successfully completed -> MediaAsset %s", job.id, asset.id)
                return

            # Still processing: update estimated progress
            elapsed = time.time() - start_time
            # Progress gracefully climbs to 90%
            estimated_progress = min(90, int(15 + (elapsed / 240) * 75))
            if estimated_progress > job.progress_percent:
                job.progress_percent = estimated_progress
                job.save(update_fields=["progress_percent", "updated_at"])

            time.sleep(5)

        # If loop exited without finishing, mark as timed out
        timeout_msg = "Video generation timed out while awaiting provider completion."
        job.mark_failed(timeout_msg)
        logger.warning("Job %s timed out after %ds", job.id, int(time.time() - start_time))

    except Exception as exc:
        logger.exception("Unexpected error processing video generation job %s: %s", job_id, exc)
        job.mark_failed(f"Video generation failed: {exc}")
