from django.contrib import admin

from memory.models import MemorySummary


@admin.register(MemorySummary)
class MemorySummaryAdmin(admin.ModelAdmin):
    list_display = ("user_label", "period_start", "period_end", "message_count", "created_at")
    list_filter = ("user_label",)
    readonly_fields = ("chroma_id", "created_at")
