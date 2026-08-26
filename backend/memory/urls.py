from django.urls import path

from memory import views

urlpatterns = [
    path("memories/", views.memories, name="memories"),
    path("stats/", views.memory_stats, name="memory-stats"),
]
