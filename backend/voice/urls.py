from django.urls import path

from voice import views_tts

urlpatterns = [
    path("keys/", views_tts.tts_keys, name="tts-keys"),
    path("keys/<int:key_id>/", views_tts.tts_key_detail, name="tts-key-detail"),
    path("keys/<int:key_id>/activate/", views_tts.tts_key_activate, name="tts-key-activate"),
    path("keys/<int:key_id>/test/", views_tts.tts_key_test, name="tts-key-test"),
    path("config/", views_tts.tts_config, name="tts-config"),
]
