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


class LLMCallLog(models.Model):
    """Persistent per-call LLM usage/cost telemetry.

    Written by core/services/telemetry.py::log_llm_call() alongside the
    structured log line it already emits — the log line stays the source of
    truth for live `grep`-based debugging (see llm_cost_report), this table
    exists purely so the Stats dashboard (core/services/analytics.py) can
    filter/aggregate over date ranges without re-parsing the log file on
    every request. Never stores prompt/response content, only usage counts.
    """

    provider = models.CharField(max_length=20, db_index=True)
    model = models.CharField(max_length=100, db_index=True)
    call_site = models.CharField(max_length=50, db_index=True)
    input_tokens = models.PositiveIntegerField(null=True, blank=True)
    output_tokens = models.PositiveIntegerField(null=True, blank=True)
    cache_read_tokens = models.PositiveIntegerField(null=True, blank=True)
    cache_write_tokens = models.PositiveIntegerField(null=True, blank=True)
    latency_ms = models.FloatField(null=True, blank=True)
    estimated = models.BooleanField(default=False)
    error = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        indexes = [
            models.Index(fields=["created_at"]),
            models.Index(fields=["provider", "created_at"]),
            models.Index(fields=["model", "created_at"]),
            models.Index(fields=["call_site", "created_at"]),
        ]

    def __str__(self) -> str:
        return f"LLMCallLog({self.provider}/{self.model}, {self.call_site})"


class OptimizationEvent(models.Model):
    """Lightweight event counter backing the "Token Optimization Analytics"
    section of the Stats dashboard — memory gating/retrieval-cache, dedup,
    agent tool routing, agent history trimming (see CLAUDE.md's Pass 1-4
    notes). One row per observed event; the dashboard aggregates counts/
    rates. Never stores prompt content, only counts."""

    CATEGORY_CHOICES = [
        ("memory_gate", "Memory gate"),
        ("memory_retrieval", "Memory retrieval"),
        ("dedup", "Memory dedup"),
        ("tool_routing", "Agent tool routing"),
        ("agent_trim", "Agent history trim"),
        ("truncation", "Content truncation"),
    ]

    category = models.CharField(max_length=30, choices=CATEGORY_CHOICES, db_index=True)
    outcome = models.CharField(max_length=30, blank=True, default="")
    count = models.PositiveIntegerField(null=True, blank=True)
    extra = models.PositiveIntegerField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        indexes = [
            models.Index(fields=["category", "created_at"]),
        ]

    def __str__(self) -> str:
        return f"OptimizationEvent({self.category}, {self.outcome})"


class PricingConfig(models.Model):
    """User-supplied $ per 1M tokens for one provider/model.

    Deliberately NOT pre-populated with guessed prices: the model ids in
    core/services/providers/__init__.py's AVAILABLE_MODELS (claude-opus-5,
    gpt-5.6-sol, etc.) have no publicly verifiable pricing, and inventing a
    number would violate the Stats dashboard's core accuracy rule. Cost
    calculations in core/services/pricing.py return None (surfaced in the
    UI as "Cost unavailable") for any provider/model without a row here.
    Configure via /admin/.
    """

    provider = models.CharField(max_length=20)
    model = models.CharField(max_length=100)
    input_price_per_1m = models.FloatField(null=True, blank=True)
    output_price_per_1m = models.FloatField(null=True, blank=True)
    cache_read_price_per_1m = models.FloatField(null=True, blank=True)
    cache_write_price_per_1m = models.FloatField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["provider", "model"], name="unique_pricing_provider_model"),
        ]

    def __str__(self) -> str:
        return f"PricingConfig({self.provider}/{self.model})"


class BudgetSettings(models.Model):
    """Singleton row (pk=1) — same convention as ModelPreference, since no
    auth/multi-user system exists yet. Purely an application-side spend
    target computed from LLMCallLog + PricingConfig; NOT a provider-reported
    account balance (no provider used here exposes one via API). See
    core/services/analytics.py::get_budget() for how it's distinguished in
    the API response.

    `alerts_fired`/`alerts_period` track which thresholds have already
    crossed in the current calendar month so a dashboard load doesn't
    re-fire an already-crossed threshold — this app has no notification
    dispatch channel, so "firing" means the UI shows the crossed state
    rather than sending anything.
    """

    monthly_budget_usd = models.FloatField(null=True, blank=True)
    alert_thresholds = models.CharField(max_length=100, default="50,75,90,100")
    alerts_fired = models.CharField(max_length=100, blank=True, default="")
    alerts_period = models.CharField(max_length=7, blank=True, default="")
    updated_at = models.DateTimeField(auto_now=True)

    @classmethod
    def current(cls) -> "BudgetSettings":
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj

    @staticmethod
    def _parse_int_csv(value: str) -> list[int]:
        return sorted({int(part.strip()) for part in value.split(",") if part.strip().isdigit()})

    def thresholds(self) -> list[int]:
        return self._parse_int_csv(self.alert_thresholds)

    def fired_thresholds(self) -> list[int]:
        return self._parse_int_csv(self.alerts_fired)

    def __str__(self) -> str:
        return f"BudgetSettings(monthly=${self.monthly_budget_usd})"
