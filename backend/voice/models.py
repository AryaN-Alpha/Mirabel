"""
CartesiaTTSKey — user-managed vault of Cartesia API keys.

Only one key is marked `is_active=True` at a time.  The `activate()`
class method handles the single-active-row invariant atomically.

Keys are encrypted at rest with the same Fernet key used by
core.models.ProviderCredential so no extra secrets are needed.
"""

from __future__ import annotations

from cryptography.fernet import Fernet, InvalidToken
from django.conf import settings
from django.db import models, transaction


def _fernet() -> Fernet:
    return Fernet(settings.CREDENTIAL_ENCRYPTION_KEY.encode())


class CartesiaTTSKey(models.Model):
    class Status(models.TextChoices):
        UNTESTED = "untested", "Untested"
        OK = "ok", "OK"
        QUOTA_EXCEEDED = "quota_exceeded", "Quota exceeded"
        ERROR = "error", "Error"

    name = models.CharField(max_length=80)
    # Fernet-encrypted ciphertext — same pattern as ProviderCredential.
    api_key = models.TextField(blank=True, default="")
    is_active = models.BooleanField(default=False, db_index=True)
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.UNTESTED,
    )
    # Last error / test result — kept short for display in the UI.
    status_note = models.CharField(max_length=200, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["created_at"]

    def __str__(self) -> str:
        return f"CartesiaTTSKey({self.name!r}, active={self.is_active})"

    # ------------------------------------------------------------------
    # Key encryption helpers
    # ------------------------------------------------------------------

    def set_api_key(self, raw: str) -> None:
        self.api_key = _fernet().encrypt(raw.encode()).decode() if raw else ""
        # Changing the key resets the test status.
        self.status = self.Status.UNTESTED
        self.status_note = ""

    def get_api_key(self) -> str:
        if not self.api_key:
            return ""
        try:
            return _fernet().decrypt(self.api_key.encode()).decode()
        except InvalidToken:
            # Graceful fallback for rows written before encryption was added.
            return self.api_key

    def masked(self) -> str:
        raw = self.get_api_key()
        if not raw:
            return ""
        if len(raw) <= 4:
            return "••••"
        return f"••••{raw[-4:]}"

    # ------------------------------------------------------------------
    # Active-key management
    # ------------------------------------------------------------------

    @classmethod
    def activate(cls, key_id: int) -> "CartesiaTTSKey":
        """Make `key_id` the active key; deactivate all others atomically."""
        with transaction.atomic():
            cls.objects.update(is_active=False)
            cls.objects.filter(pk=key_id).update(is_active=True)
        return cls.objects.get(pk=key_id)

    @classmethod
    def get_active(cls) -> "CartesiaTTSKey | None":
        """Return the currently active vault key, or None if vault is empty."""
        return cls.objects.filter(is_active=True).first()

    @classmethod
    def get_active_raw_key(cls) -> str:
        """
        Return the decrypted API key to use for Cartesia TTS calls.

        Priority:
        1. The vault's active key (if any).
        2. The CARTESIA_API_KEY setting / env var (original behaviour).
        """
        active = cls.get_active()
        if active:
            return active.get_api_key()
        return getattr(settings, "CARTESIA_API_KEY", "")
