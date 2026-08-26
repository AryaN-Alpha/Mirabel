from django.urls import path

from outlook import views

urlpatterns = [
    path("auth/start/", views.auth_start, name="outlook-auth-start"),
    path("auth/callback/", views.auth_callback, name="outlook-auth-callback"),
    path("status/", views.status, name="outlook-status"),
    path("disconnect/", views.disconnect, name="outlook-disconnect"),
    path("signature/", views.signature, name="outlook-signature"),
    path("inbox/", views.inbox, name="outlook-inbox"),
    path("messages/<str:message_id>/", views.message_detail, name="outlook-message-detail"),
    path("messages/<str:message_id>/reply/", views.reply_message, name="outlook-reply"),
    path("messages/<str:message_id>/generate-reply/", views.generate_reply, name="outlook-generate-reply"),
    path("compose/send/", views.send_new_message, name="outlook-send"),
    path("compose/generate/", views.generate_compose, name="outlook-generate-compose"),
    path("compose/schedule/", views.schedule_message, name="outlook-schedule"),
    path("scheduled/", views.list_scheduled, name="outlook-scheduled-list"),
    path("scheduled/<int:scheduled_id>/", views.cancel_scheduled, name="outlook-scheduled-cancel"),
]
