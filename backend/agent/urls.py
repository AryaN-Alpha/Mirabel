from django.urls import path

from agent import views

urlpatterns = [
    path("tasks/", views.tasks, name="agent-tasks"),
    path("tasks/<int:task_id>/", views.task_detail, name="agent-task-detail"),
    path("tasks/<int:task_id>/approve/", views.approve_task, name="agent-task-approve"),
    path("tasks/<int:task_id>/reject/", views.reject_task, name="agent-task-reject"),
    path("tasks/<int:task_id>/answer/", views.answer_task, name="agent-task-answer"),
    path("tasks/<int:task_id>/cancel/", views.cancel_task, name="agent-task-cancel"),
]
