import uuid
from cryptography.fernet import Fernet, InvalidToken
from django.conf import settings
from django.db import models
from django.utils import timezone


def _fernet() -> Fernet:
    return Fernet(settings.CREDENTIAL_ENCRYPTION_KEY.encode())


class ThreadsCredential(models.Model):
    """Singleton row (pk=1) holding the Meta Threads OAuth token + cached profile.

    Follows the same pattern as LinkedInCredential / OutlookCredential:
    global singleton (single hardcoded user), access_token is Fernet-encrypted
    at rest with graceful fallback to legacy plaintext on InvalidToken.
    """

    access_token = models.TextField(blank=True, default="")
    token_expires_at = models.DateTimeField(null=True, blank=True)
    permission_expires_at = models.DateTimeField(null=True, blank=True)
    is_private_profile = models.BooleanField(default=False)
    needs_reauth = models.BooleanField(default=False)
    scope = models.CharField(max_length=500, blank=True, default="")

    threads_user_id = models.CharField(max_length=255, blank=True, default="")
    username = models.CharField(max_length=255, blank=True, default="")
    name = models.CharField(max_length=255, blank=True, default="")
    biography = models.TextField(blank=True, default="")
    profile_picture_url = models.URLField(max_length=1000, blank=True, default="")

    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return f"ThreadsCredential({self.username or self.name or 'not connected'})"

    @classmethod
    def current(cls) -> "ThreadsCredential":
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj

    @property
    def is_connected(self) -> bool:
        return bool(self.access_token and self.threads_user_id)

    @property
    def is_expired(self) -> bool:
        return self.token_expires_at is None or timezone.now() >= self.token_expires_at

    @property
    def is_permission_expired(self) -> bool:
        return self.permission_expires_at is not None and timezone.now() >= self.permission_expires_at

    @property
    def token_age_hours(self) -> float:
        """Estimate token age based on 60-day standard expiry (5184000 seconds)."""
        if not self.token_expires_at:
            return 0.0
        issued_approx = self.token_expires_at - timezone.timedelta(days=60)
        age = (timezone.now() - issued_approx).total_seconds() / 3600.0
        return max(0.0, age)

    def set_access_token(self, raw: str) -> None:
        self.access_token = _fernet().encrypt(raw.encode()).decode() if raw else ""

    def get_access_token(self) -> str:
        if not self.access_token:
            return ""
        try:
            return _fernet().decrypt(self.access_token.encode()).decode()
        except InvalidToken:
            return self.access_token

    def clear_tokens(self) -> None:
        self.access_token = ""
        self.token_expires_at = None
        self.permission_expires_at = None
        self.is_private_profile = False
        self.needs_reauth = False
        self.scope = ""
        self.threads_user_id = ""
        self.username = ""
        self.name = ""
        self.biography = ""
        self.profile_picture_url = ""


class ThreadsRateLimitSnapshot(models.Model):
    """Dynamic publishing rate-limit snapshot polled from GET /{user_id}/threads_publishing_limit."""

    fetched_at = models.DateTimeField(auto_now_add=True)
    quota_usage = models.IntegerField(default=0)
    quota_total = models.IntegerField(default=250)
    reply_quota_usage = models.IntegerField(null=True, blank=True)
    reply_quota_total = models.IntegerField(null=True, blank=True)
    raw_response = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ["-fetched_at"]

    def __str__(self) -> str:
        return f"ThreadsRateLimitSnapshot({self.quota_usage}/{self.quota_total} at {self.fetched_at:%Y-%m-%d %H:%M})"

    @property
    def is_exhausted(self) -> bool:
        return self.quota_total > 0 and self.quota_usage >= self.quota_total

    @classmethod
    def latest(cls) -> "ThreadsRateLimitSnapshot | None":
        return cls.objects.first()


class ThreadsDraft(models.Model):
    class ReplyControl(models.TextChoices):
        EVERYONE = "everyone", "Everyone"
        ACCOUNTS_YOU_FOLLOW = "accounts_you_follow", "Profiles you follow"
        MENTIONED_ONLY = "mentioned_only", "Profiles you mention"

    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        PUBLISHED = "published", "Published"

    class ContainerStatus(models.TextChoices):
        IN_PROGRESS = "IN_PROGRESS", "In Progress"
        FINISHED = "FINISHED", "Finished"
        ERROR = "ERROR", "Error"
        EXPIRED = "EXPIRED", "Expired"

    body = models.TextField(blank=True, default="")
    reply_control = models.CharField(
        max_length=30, choices=ReplyControl.choices, default=ReplyControl.EVERYONE
    )
    link_url = models.URLField(max_length=1000, blank=True, default="")
    image = models.FileField(upload_to="threads/", blank=True, null=True)
    prompt = models.TextField(blank=True, default="")
    tone = models.CharField(max_length=32, blank=True, default="")
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT)

    container_id = models.CharField(max_length=64, blank=True, default="")
    container_status = models.CharField(max_length=32, blank=True, default="")
    container_expires_at = models.DateTimeField(null=True, blank=True)
    idempotency_key = models.UUIDField(default=uuid.uuid4, unique=True)
    parent_thread_id = models.CharField(max_length=64, blank=True, default="")

    threads_post_id = models.CharField(max_length=255, blank=True, default="")
    permalink = models.URLField(max_length=1000, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at"]

    def __str__(self) -> str:
        return f"ThreadsDraft({self.id}, {self.status})"


class ThreadsProfileSnapshot(models.Model):
    """Snapshot of public profile fields exposed via Meta Threads API."""

    username = models.CharField(max_length=255, blank=True, default="")
    name = models.CharField(max_length=255, blank=True, default="")
    biography = models.TextField(blank=True, default="")
    profile_picture_url = models.URLField(max_length=1000, blank=True, default="")
    is_private_profile = models.BooleanField(default=False)
    content_hash = models.CharField(max_length=64, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"ThreadsProfileSnapshot({self.username or self.id}, {self.created_at:%Y-%m-%d %H:%M})"


class ThreadsProfileChange(models.Model):
    snapshot = models.ForeignKey(
        ThreadsProfileSnapshot, on_delete=models.CASCADE, related_name="changes", null=True
    )
    field = models.CharField(max_length=32)
    old_value = models.TextField(blank=True, default="")
    new_value = models.TextField(blank=True, default="")
    detected_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-detected_at"]

    def __str__(self) -> str:
        return f"ThreadsProfileChange({self.field}, {self.detected_at:%Y-%m-%d})"


class ThreadsAutomation(models.Model):
    class Type(models.TextChoices):
        PROFILE_SYNC = "profile_sync", "Profile Sync"
        TOKEN_REFRESH = "token_refresh", "Token Refresh"
        RATE_LIMIT_SYNC = "rate_limit_sync", "Rate Limit Sync"
        DAILY_BRIEFING = "daily_briefing", "Daily Threads Briefing"
        WEEKLY_REPORT = "weekly_report", "Weekly Threads Report"

    name = models.CharField(max_length=255)
    type = models.CharField(max_length=32, choices=Type.choices)
    enabled = models.BooleanField(default=True)
    interval_hours = models.PositiveIntegerField(default=6)
    configuration = models.JSONField(default=dict, blank=True)
    last_run_at = models.DateTimeField(null=True, blank=True)
    next_run_at = models.DateTimeField(null=True, blank=True, db_index=True)
    last_status = models.CharField(max_length=16, blank=True, default="")
    failure_count = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return f"ThreadsAutomation({self.name}, {self.type}, {'on' if self.enabled else 'off'})"


class ThreadsAutomationRun(models.Model):
    automation = models.ForeignKey(
        ThreadsAutomation, on_delete=models.CASCADE, related_name="runs"
    )
    started_at = models.DateTimeField(auto_now_add=True)
    finished_at = models.DateTimeField(null=True, blank=True)
    status = models.CharField(max_length=16, default="running")
    detail = models.TextField(blank=True, default="")
    error_message = models.TextField(blank=True, default="")

    class Meta:
        ordering = ["-started_at"]

    def __str__(self) -> str:
        return f"ThreadsAutomationRun({self.automation_id}, {self.status})"
