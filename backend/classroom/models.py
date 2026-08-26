from cryptography.fernet import Fernet, InvalidToken
from django.conf import settings
from django.db import models
from django.utils import timezone


def _fernet() -> Fernet:
    return Fernet(settings.CREDENTIAL_ENCRYPTION_KEY.encode())


class ClassroomCredential(models.Model):
    """Singleton row (pk=1) holding the Google OAuth tokens + cached profile.

    Same encrypted-at-rest pattern as outlook.models.OutlookCredential /
    linkedin.models.LinkedInCredential. Unlike LinkedInCredential, this
    follows OutlookCredential's auto-refresh-on-expiry model rather than
    LinkedIn's refuse-and-ask-to-reconnect model — Google reliably issues a
    refresh_token when the auth URL passes access_type=offline&prompt=consent
    (see services/oauth.py), so a silent refresh is safe here.
    """

    access_token = models.TextField(blank=True, default="")
    refresh_token = models.TextField(blank=True, default="")
    token_expires_at = models.DateTimeField(null=True, blank=True)
    scope = models.CharField(max_length=1000, blank=True, default="")

    google_sub = models.CharField(max_length=255, blank=True, default="")
    email = models.CharField(max_length=255, blank=True, default="")
    name = models.CharField(max_length=255, blank=True, default="")
    picture_url = models.URLField(max_length=1000, blank=True, default="")

    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return f"ClassroomCredential({self.email or 'not connected'})"

    @classmethod
    def current(cls) -> "ClassroomCredential":
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj

    @property
    def is_connected(self) -> bool:
        return bool(self.access_token and self.google_sub)

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
        self.scope = ""
        self.google_sub = ""
        self.email = ""
        self.name = ""
        self.picture_url = ""


class ClassroomSubmissionDraft(models.Model):
    """An AI-drafted answer to a piece of coursework, staged for human review
    before it's turned in to real Google Classroom. Turning in is a separate,
    explicit action (see views.turn_in_view) — this row is never submitted
    automatically just because it was created.

    work_type mirrors (a subset of) Google Classroom's CourseWork.workType
    enum. Only ASSIGNMENT and SHORT_ANSWER_QUESTION are supported for
    solve+turn-in in this app; MULTIPLE_CHOICE_QUESTION and MATERIAL items
    are visible in the assignments list but can't produce a draft here.
    """

    class WorkType(models.TextChoices):
        ASSIGNMENT = "ASSIGNMENT", "Assignment"
        SHORT_ANSWER_QUESTION = "SHORT_ANSWER_QUESTION", "Short answer question"

    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        TURNED_IN = "turned_in", "Turned in"

    course_id = models.CharField(max_length=64)
    course_name = models.CharField(max_length=255, blank=True, default="")
    coursework_id = models.CharField(max_length=64)
    coursework_title = models.CharField(max_length=500, blank=True, default="")
    work_type = models.CharField(max_length=32, choices=WorkType.choices)
    due_date = models.DateTimeField(null=True, blank=True)

    google_submission_id = models.CharField(max_length=64, blank=True, default="")

    answer_text = models.TextField(blank=True, default="")
    solution_doc_id = models.CharField(max_length=128, blank=True, default="")
    solution_doc_url = models.URLField(max_length=1000, blank=True, default="")

    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.DRAFT
    )
    google_turned_in_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at"]

    def __str__(self) -> str:
        return f"ClassroomSubmissionDraft({self.id}, {self.status})"
