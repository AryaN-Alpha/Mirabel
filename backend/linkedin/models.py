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
