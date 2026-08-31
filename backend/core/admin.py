from django.contrib import admin

from core.models import BudgetSettings, LLMCallLog, OptimizationEvent, PricingConfig


@admin.register(PricingConfig)
class PricingConfigAdmin(admin.ModelAdmin):
    """Where provider/model pricing is configured — see PricingConfig's
    docstring for why the Stats dashboard doesn't ship with guessed prices
    baked in."""

    list_display = (
        "provider",
        "model",
        "input_price_per_1m",
        "output_price_per_1m",
        "cache_read_price_per_1m",
        "cache_write_price_per_1m",
        "updated_at",
    )
    list_filter = ("provider",)
    search_fields = ("provider", "model")


@admin.register(BudgetSettings)
class BudgetSettingsAdmin(admin.ModelAdmin):
    list_display = ("monthly_budget_usd", "alert_thresholds", "alerts_fired", "alerts_period", "updated_at")

    def has_add_permission(self, request):
        # Singleton (pk=1) — same convention as ModelPreference.
        return not BudgetSettings.objects.exists()


@admin.register(LLMCallLog)
class LLMCallLogAdmin(admin.ModelAdmin):
    list_display = (
        "created_at", "provider", "model", "call_site",
        "input_tokens", "output_tokens", "cache_read_tokens", "cache_write_tokens",
        "latency_ms", "estimated", "error",
    )
    list_filter = ("provider", "call_site", "estimated", "error")
    date_hierarchy = "created_at"
    search_fields = ("provider", "model", "call_site")

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False


@admin.register(OptimizationEvent)
class OptimizationEventAdmin(admin.ModelAdmin):
    list_display = ("created_at", "category", "outcome", "count", "extra")
    list_filter = ("category", "outcome")
    date_hierarchy = "created_at"

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False
