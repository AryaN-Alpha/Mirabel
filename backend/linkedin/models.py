from cryptography.fernet import Fernet, InvalidToken
from django.conf import settings
from django.db import models
from django.utils import timezone


def _fernet() -> Fernet:
    return Fernet(settings.CREDENTIAL_ENCRYPTION_KEY.encode())


class LinkedInCredential(models.Model):
    """Singleton row (pk=1) holding the LinkedIn OAuth tokens + cached profile.

    Same pattern as outlook.models.OutlookCredential / core.models.ProviderCredential:
    global rather than per-user (no auth system), access_token/refresh_token are
    Fernet-encrypted at rest with the same fall-back-to-plaintext-on-InvalidToken
    behavior on get(). refresh_token is only ever populated when LinkedIn actually
    returns one — see settings.LINKEDIN_ENABLE_REFRESH_TOKEN (standard developer
    apps normally don't get one).
    """

    access_token = models.TextField(blank=True, default="")
    refresh_token = models.TextField(blank=True, default="")
    token_expires_at = models.DateTimeField(null=True, blank=True)
    refresh_token_expires_at = models.DateTimeField(null=True, blank=True)
    scope = models.CharField(max_length=255, blank=True, default="")

    member_sub = models.CharField(max_length=255, blank=True, default="")
    member_urn = models.CharField(max_length=255, blank=True, default="")
    name = models.CharField(max_length=255, blank=True, default="")
    email = models.CharField(max_length=255, blank=True, default="")
    picture_url = models.URLField(max_length=1000, blank=True, default="")

    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return f"LinkedInCredential({self.name or 'not connected'})"

    @classmethod
    def current(cls) -> "LinkedInCredential":
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj

    @property
    def is_connected(self) -> bool:
        return bool(self.access_token and self.member_urn)

    @property
    def is_expired(self) -> bool:
        return self.token_expires_at is None or timezone.now() >= self.token_expires_at

    def set_access_token(self, raw: str) -> None:
        self.access_token = _fernet().encrypt(raw.encode()).decode() if raw else ""

    def get_access_token(self) -> str:
        if not self.access_token:
            return ""
        try:
            return _fernet().decrypt(self.access_token.encode()).decode()
        except InvalidToken:
            return self.access_token

    def set_refresh_token(self, raw: str) -> None:
        self.refresh_token = _fernet().encrypt(raw.encode()).decode() if raw else ""

    def get_refresh_token(self) -> str:
        if not self.refresh_token:
            return ""
        try:
            return _fernet().decrypt(self.refresh_token.encode()).decode()
        except InvalidToken:
            return self.refresh_token

    def clear_tokens(self) -> None:
        self.access_token = ""
        self.refresh_token = ""
        self.token_expires_at = None
        self.refresh_token_expires_at = None
        self.scope = ""
        self.member_sub = ""
        self.member_urn = ""
        self.name = ""
        self.email = ""
        self.picture_url = ""


class LinkedInDraft(models.Model):
    class Visibility(models.TextChoices):
        PUBLIC = "PUBLIC", "Public"
        CONNECTIONS = "CONNECTIONS", "Connections"

    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        PUBLISHED = "published", "Published"

    body = models.TextField(blank=True, default="")
    visibility = models.CharField(max_length=20, choices=Visibility.choices, default=Visibility.PUBLIC)
    link_url = models.URLField(max_length=1000, blank=True, default="")
    image = models.FileField(upload_to="linkedin/", blank=True, null=True)
    prompt = models.TextField(blank=True, default="")
    tone = models.CharField(max_length=32, blank=True, default="")
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT)
    linkedin_post_urn = models.CharField(max_length=255, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at"]

    def __str__(self) -> str:
        return f"LinkedInDraft({self.id}, {self.status})"


class LinkedInProfileSnapshot(models.Model):
    """A normalized snapshot of the fields LinkedIn actually exposes through
    this integration's OAuth scope (openid profile email) — see
    linkedin/services/profile.py::TRACKED_FIELDS. A new row is only created
    when content_hash changes from the latest one, per the "don't store
    unnecessary duplicate snapshots" rule.
    """

    name = models.CharField(max_length=255, blank=True, default="")
    email = models.CharField(max_length=255, blank=True, default="")
    picture_url = models.URLField(max_length=1000, blank=True, default="")
    content_hash = models.CharField(max_length=64, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"LinkedInProfileSnapshot({self.created_at:%Y-%m-%d %H:%M})"


class LinkedInProfileChange(models.Model):
    """One detected field-level change, produced by diffing a new snapshot
    against the previous one (linkedin/services/profile.py::sync_profile)."""

    snapshot = models.ForeignKey(
        LinkedInProfileSnapshot, on_delete=models.CASCADE, related_name="changes", null=True
    )
    field = models.CharField(max_length=32)
    old_value = models.TextField(blank=True, default="")
    new_value = models.TextField(blank=True, default="")
    detected_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-detected_at"]

    def __str__(self) -> str:
        return f"LinkedInProfileChange({self.field}, {self.detected_at:%Y-%m-%d})"


class LinkedInAutomation(models.Model):
    """A scheduled LinkedIn background job. Only automation types the
    connected LinkedIn API can actually support are implemented — see
    linkedin/services/automation.py. No auto-publish automation exists: any
    automation that would post/comment must still go through the same
    agent-tool require_confirmation gate as a human-initiated action, so
    scheduling one here isn't offered.
    """

    class Type(models.TextChoices):
        PROFILE_SYNC = "profile_sync", "Profile Sync"
        DAILY_BRIEFING = "daily_briefing", "Daily LinkedIn Briefing"
        WEEKLY_REPORT = "weekly_report", "Weekly LinkedIn Report"

    name = models.CharField(max_length=255)
    type = models.CharField(max_length=32, choices=Type.choices)
    enabled = models.BooleanField(default=True)
    # Only meaningful for PROFILE_SYNC — daily_briefing/weekly_report run on
    # a fixed 1-day/7-day cadence (see services/automation.py::compute_next_run_at).
    interval_hours = models.PositiveIntegerField(default=6)
    configuration = models.JSONField(default=dict, blank=True)
    last_run_at = models.DateTimeField(null=True, blank=True)
    next_run_at = models.DateTimeField(null=True, blank=True, db_index=True)
    last_status = models.CharField(max_length=16, blank=True, default="")
    failure_count = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return f"LinkedInAutomation({self.name}, {self.type}, {'on' if self.enabled else 'off'})"


class LinkedInAutomationRun(models.Model):
    """One execution record of a LinkedInAutomation, for the automation
    history screen and audit trail."""

    automation = models.ForeignKey(LinkedInAutomation, on_delete=models.CASCADE, related_name="runs")
    started_at = models.DateTimeField(auto_now_add=True)
    finished_at = models.DateTimeField(null=True, blank=True)
    status = models.CharField(max_length=16, default="running")
    detail = models.TextField(blank=True, default="")
    error_message = models.TextField(blank=True, default="")

    class Meta:
        ordering = ["-started_at"]

    def __str__(self) -> str:
        return f"LinkedInAutomationRun({self.automation_id}, {self.status})"
