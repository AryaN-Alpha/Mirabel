import uuid
from django.db import models
from django.utils import timezone


class MediaAsset(models.Model):
    class MediaType(models.TextChoices):
        IMAGE = "image", "Image"
        VIDEO = "video", "Video"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title = models.CharField(max_length=255, blank=True, default="")
    prompt = models.TextField()
    revised_prompt = models.TextField(blank=True, default="")
    negative_prompt = models.TextField(blank=True, default="")
    media_type = models.CharField(max_length=20, choices=MediaType.choices, default=MediaType.IMAGE)
    provider = models.CharField(max_length=50, default="google")
    model_name = models.CharField(max_length=100)
    file = models.FileField(upload_to="media_assets/%Y/%m/")
    thumbnail = models.FileField(upload_to="media_assets/thumbnails/%Y/%m/", blank=True, null=True)
    aspect_ratio = models.CharField(max_length=20, blank=True, default="1:1")
    width = models.IntegerField(null=True, blank=True)
    height = models.IntegerField(null=True, blank=True)
    duration_seconds = models.FloatField(null=True, blank=True)
    mime_type = models.CharField(max_length=100, blank=True, default="")
    file_size_bytes = models.BigIntegerField(null=True, blank=True)
    source_asset = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="derived_assets",
    )
    generation_parameters = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"MediaAsset({self.id}, {self.media_type}, {self.model_name})"

    @property
    def url(self) -> str:
        return self.file.url if self.file else ""

    @property
    def thumbnail_url(self) -> str:
        return self.thumbnail.url if self.thumbnail else ""


class MediaGenerationJob(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        PROCESSING = "processing", "Processing"
        COMPLETED = "completed", "Completed"
        FAILED = "failed", "Failed"
        CANCELLED = "cancelled", "Cancelled"

    class MediaType(models.TextChoices):
        IMAGE = "image", "Image"
        VIDEO = "video", "Video"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    provider = models.CharField(max_length=50, default="google")
    model_name = models.CharField(max_length=100)
    media_type = models.CharField(max_length=20, choices=MediaType.choices, default=MediaType.VIDEO)
    prompt = models.TextField()
    aspect_ratio = models.CharField(max_length=20, default="16:9")
    duration_seconds = models.IntegerField(default=6)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    operation_name = models.CharField(max_length=255, blank=True, default="")
    celery_task_id = models.CharField(max_length=255, blank=True, default="")
    source_asset = models.ForeignKey(
        MediaAsset,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="video_jobs",
    )
    result_asset = models.ForeignKey(
        MediaAsset,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="generation_jobs",
    )
    error_message = models.TextField(blank=True, default="")
    parameters = models.JSONField(default=dict, blank=True)
    progress_percent = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"MediaGenerationJob({self.id}, {self.status}, {self.media_type})"

    def mark_completed(self, asset: MediaAsset) -> None:
        self.status = self.Status.COMPLETED
        self.result_asset = asset
        self.progress_percent = 100
        self.completed_at = timezone.now()
        self.save(update_fields=["status", "result_asset", "progress_percent", "completed_at", "updated_at"])

    def mark_failed(self, error: str) -> None:
        self.status = self.Status.FAILED
        self.error_message = error
        self.completed_at = timezone.now()
        self.save(update_fields=["status", "error_message", "completed_at", "updated_at"])
