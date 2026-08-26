from django.urls import path

from kanban import views

urlpatterns = [
    path("projects/", views.project_list, name="kanban-project-list"),
    path("projects/<int:project_id>/", views.project_detail, name="kanban-project-detail"),
    path("projects/<int:project_id>/tasks/", views.task_list, name="kanban-task-list"),
    path("projects/<int:project_id>/tasks/reorder/", views.reorder_column, name="kanban-reorder"),
    path("projects/<int:project_id>/tasks/braindump/", views.braindump, name="kanban-braindump"),
    path("projects/<int:project_id>/tasks/<int:task_id>/", views.task_detail, name="kanban-task-detail"),
]
