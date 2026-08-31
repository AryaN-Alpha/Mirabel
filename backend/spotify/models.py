from cryptography.fernet import Fernet, InvalidToken
from django.conf import settings
from django.db import models
from django.utils import timezone


def _fernet() -> Fernet:
    return Fernet(settings.CREDENTIAL_ENCRYPTION_KEY.encode())


class SpotifyCredential(models.Model):
    """Singleton row (pk=1) holding the Spotify OAuth tokens + cached profile.

    Same encrypted-at-rest pattern as outlook.models.OutlookCredential /
    classroom.models.ClassroomCredential — no auth/multi-user system exists
    in this app, so this is global rather than per-user, same as
    ModelPreference. Follows ClassroomCredential's auto-refresh-on-expiry
    model (Spotify reliably issues a refresh_token on the initial
    authorization code exchange, and token rotation may or may not return a
    new one on each refresh — see services/oauth.py::save_token_result).
    """

    access_token = models.TextField(blank=True, default="")
    refresh_token = models.TextField(blank=True, default="")
    token_expires_at = models.DateTimeField(null=True, blank=True)
    scope = models.CharField(max_length=1000, blank=True, default="")

    spotify_user_id = models.CharField(max_length=255, blank=True, default="")
    display_name = models.CharField(max_length=255, blank=True, default="")
    email = models.CharField(max_length=255, blank=True, default="")
    product = models.CharField(max_length=32, blank=True, default="")
    image_url = models.URLField(max_length=1000, blank=True, default="")

    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return f"SpotifyCredential({self.display_name or 'not connected'})"

    @classmethod
    def current(cls) -> "SpotifyCredential":
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj

    @property
    def is_connected(self) -> bool:
        return bool(self.access_token and self.spotify_user_id)

    @property
    def is_premium(self) -> bool:
        return self.product == "premium"

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
        self.spotify_user_id = ""
        self.display_name = ""
        self.email = ""
        self.product = ""
        self.image_url = ""
