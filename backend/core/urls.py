from django.urls import path

from core import views

urlpatterns = [
    path("chat/", views.chat, name="chat"),
    path("settings/model/", views.model_preference, name="model-preference"),
    path("settings/models/<str:provider>/", views.provider_models, name="provider-models"),
    path("settings/credentials/<str:provider>/", views.provider_credential, name="provider-credential"),
    path("health/", views.health, name="health"),
]
