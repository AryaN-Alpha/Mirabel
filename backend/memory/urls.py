from django.urls import path

from memory import views

urlpatterns = [
    path("memories/", views.memories, name="memories"),
    path("stats/", views.memory_stats, name="memory-stats"),
    path("delete-preview/", views.memory_delete_preview, name="memory-delete-preview"),
    path("delete/", views.memory_delete, name="memory-delete"),
]
