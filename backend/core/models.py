from cryptography.fernet import Fernet, InvalidToken
from django.conf import settings
from django.db import models


def _fernet() -> Fernet:
    return Fernet(settings.CREDENTIAL_ENCRYPTION_KEY.encode())


class Conversation(models.Model):
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"Conversation({self.id})"


class Message(models.Model):
    class Role(models.TextChoices):
        USER = "user", "User"
        ASSISTANT = "assistant", "Assistant"

    conversation = models.ForeignKey(
        Conversation, on_delete=models.CASCADE, related_name="messages"
    )
    role = models.CharField(max_length=16, choices=Role.choices)
    text = models.TextField()
    mood = models.CharField(max_length=32, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]

    def __str__(self) -> str:
        return f"Message({self.role}, mood={self.mood})"


class ModelPreference(models.Model):
    """Singleton row (pk=1) holding the currently selected LLM provider/model.

    No auth/multi-user system exists in this app, so preference is global
    rather than per-user.
    """

    DEFAULT_PROVIDER = "anthropic"
    DEFAULT_MODEL = "claude-sonnet-5"
    DEFAULT_MAX_TOKENS = 400
    DEFAULT_TEMPERATURE = 1.0

    provider = models.CharField(max_length=20, default=DEFAULT_PROVIDER)
    model = models.CharField(max_length=100, default=DEFAULT_MODEL)
    max_tokens = models.PositiveIntegerField(default=DEFAULT_MAX_TOKENS)
    temperature = models.FloatField(default=DEFAULT_TEMPERATURE)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return f"ModelPreference({self.provider}/{self.model})"

    @classmethod
    def current(cls) -> "ModelPreference":
        obj, _ = cls.objects.get_or_create(
            pk=1,
            defaults={
                "provider": cls.DEFAULT_PROVIDER,
                "model": cls.DEFAULT_MODEL,
                "max_tokens": cls.DEFAULT_MAX_TOKENS,
                "temperature": cls.DEFAULT_TEMPERATURE,
            },
        )
        return obj


class ProviderCredential(models.Model):
    """API key for one provider, editable from the frontend.

    Takes priority over the provider's env var when present — see
    core/services/providers/credentials.py. Stored encrypted (Fernet) at
    rest; api_key on this model is always ciphertext once set via
    set_api_key(). get_api_key() falls back to treating the stored value as
    plaintext if decryption fails, so rows written before encryption was
    added keep working until they're next re-saved.
    """

    provider = models.CharField(max_length=20, unique=True)
    api_key = models.CharField(max_length=255, blank=True, default="")
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return f"ProviderCredential({self.provider})"

    def set_api_key(self, raw: str) -> None:
        self.api_key = _fernet().encrypt(raw.encode()).decode() if raw else ""

    def get_api_key(self) -> str:
        if not self.api_key:
            return ""
        try:
            return _fernet().decrypt(self.api_key.encode()).decode()
        except InvalidToken:
            return self.api_key

    def masked(self) -> str:
        raw = self.get_api_key()
        if not raw:
            return ""
        if len(raw) <= 4:
            return "••••"
        return f"••••{raw[-4:]}"
