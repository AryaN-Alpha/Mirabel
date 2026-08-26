from django.urls import path

from linkedin import views

urlpatterns = [
    path("auth/start/", views.auth_start, name="linkedin-auth-start"),
    path("auth/callback/", views.auth_callback, name="linkedin-auth-callback"),
    path("status/", views.status, name="linkedin-status"),
    path("disconnect/", views.disconnect, name="linkedin-disconnect"),
    path("drafts/", views.drafts, name="linkedin-drafts"),
    path("drafts/<int:draft_id>/", views.draft_detail, name="linkedin-draft-detail"),
    path("drafts/<int:draft_id>/publish/", views.publish_draft, name="linkedin-draft-publish"),
    path("posts/", views.publish_post, name="linkedin-publish-post"),
    path("posts/generate/", views.generate_post_view, name="linkedin-generate-post"),
    path("images/", views.upload_image, name="linkedin-upload-image"),
    path("comments/", views.post_comment, name="linkedin-post-comment"),
    path("comments/generate/", views.generate_comment, name="linkedin-generate-comment"),
]
