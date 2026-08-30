from django.contrib import admin

from memory.models import MemoryFact, MemorySummary


@admin.register(MemorySummary)
class MemorySummaryAdmin(admin.ModelAdmin):
    list_display = ("period_start", "period_end", "message_count", "created_at")
    readonly_fields = ("chroma_id", "created_at")


@admin.register(MemoryFact)
class MemoryFactAdmin(admin.ModelAdmin):
    list_display = ("fact_text", "fact_type", "status", "created_at", "superseded_at")
    list_filter = ("status", "fact_type")
    readonly_fields = ("chroma_id", "created_at", "superseded_at")
