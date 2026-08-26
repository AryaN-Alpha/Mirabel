from django.contrib import admin

from kanban.models import KanbanTask, Project


@admin.register(Project)
class ProjectAdmin(admin.ModelAdmin):
    list_display = ("name", "created_at", "updated_at")
    readonly_fields = ("created_at", "updated_at")


@admin.register(KanbanTask)
class KanbanTaskAdmin(admin.ModelAdmin):
    list_display = ("title", "project", "status", "priority", "effort", "due_date", "source", "position")
    list_filter = ("project", "status", "priority", "effort", "source")
    readonly_fields = ("created_at", "updated_at")
