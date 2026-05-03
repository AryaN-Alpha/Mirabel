from django.urls import path

from core import views

urlpatterns = [
    path("chat/", views.chat, name="chat"),
    path("health/", views.health, name="health"),
]
