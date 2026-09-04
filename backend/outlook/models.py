from cryptography.fernet import Fernet, InvalidToken
from django.conf import settings
from django.db import models


def _fernet() -> Fernet:
    return Fernet(settings.CREDENTIAL_ENCRYPTION_KEY.encode())


class OutlookCredential(models.Model):
    """Singleton row (pk=1) holding the Microsoft Graph OAuth tokens.

    No auth/multi-user system exists in this app, so this is global rather
    than per-user, same as ModelPreference. access_token/refresh_token are
    encrypted at rest (Fernet) following the exact ProviderCredential
    pattern in core/models.py — including the same "fall back to treating
    an undecryptable value as legacy plaintext" behavior on get(), kept for
    consistency even though these fields are always freshly encrypted.
    signature is plain text (not a secret).
    """

    access_token = models.TextField(blank=True, default="")
    refresh_token = models.TextField(blank=True, default="")
    token_expires_at = models.DateTimeField(null=True, blank=True)
    account_email = models.CharField(max_length=255, blank=True, default="")
    signature = models.TextField(blank=True, default="")
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return f"OutlookCredential({self.account_email or 'not connected'})"

    @classmethod
    def current(cls) -> "OutlookCredential":
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj

    @property
    def is_connected(self) -> bool:
        return bool(self.access_token and self.refresh_token)

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
        self.account_email = ""


class ScheduledEmail(models.Model):
    """A compose-tab email queued to send later.

    No FK to a user — same no-auth singleton convention as OutlookCredential.
    Sent by outlook.tasks.send_due_scheduled_emails, a Celery beat task
    (see mirabel/celery.py) that runs every minute.
    """

    STATUS_PENDING = "pending"
    # Transient: set atomically by send_due_scheduled_emails the instant a
    # row is claimed, before any network call — closes the window where two
    # Celery workers (or overlapping beat ticks) could both see STATUS_PENDING
    # and send the same email twice.
    STATUS_SENDING = "sending"
    STATUS_SENT = "sent"
    STATUS_FAILED = "failed"
    STATUS_CANCELLED = "cancelled"
    STATUS_CHOICES = [
        (STATUS_PENDING, "Pending"),
        (STATUS_SENDING, "Sending"),
        (STATUS_SENT, "Sent"),
        (STATUS_FAILED, "Failed"),
        (STATUS_CANCELLED, "Cancelled"),
    ]

    to = models.JSONField(default=list)
    subject = models.CharField(max_length=500)
    body_html = models.TextField()
    send_at = models.DateTimeField()
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default=STATUS_PENDING)
    error_message = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    sent_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["send_at"]

    def __str__(self) -> str:
        return f"ScheduledEmail({self.subject!r} -> {self.to}, {self.status})"
