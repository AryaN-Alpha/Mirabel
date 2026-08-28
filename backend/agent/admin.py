from django.contrib import admin

from agent.models import AgentTask


@admin.register(AgentTask)
class AgentTaskAdmin(admin.ModelAdmin):
    list_display = ("id", "status", "short_instruction", "created_at", "finished_at")
    list_filter = ("status",)
    readonly_fields = [f.name for f in AgentTask._meta.fields]

    @admin.display(description="instruction")
    def short_instruction(self, obj: AgentTask) -> str:
        return obj.instruction[:80]
