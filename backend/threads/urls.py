from django.urls import path

from threads import views

urlpatterns = [
    # OAuth & Connection
    path("auth/start/", views.auth_start, name="threads-auth-start"),
    path("auth/callback/", views.auth_callback, name="threads-auth-callback"),
    path("status/", views.status, name="threads-status"),
    path("disconnect/", views.disconnect, name="threads-disconnect"),
    # Meta Compliance Callbacks
    path("deauthorize/", views.deauthorize_callback, name="threads-deauthorize"),
    path("data-deletion/", views.data_deletion_callback, name="threads-data-deletion"),
    # Drafts & Publishing
    path("drafts/", views.drafts, name="threads-drafts"),
    path("drafts/<int:draft_id>/", views.draft_detail, name="threads-draft-detail"),
    path("drafts/<int:draft_id>/publish/", views.publish_draft_view, name="threads-draft-publish"),
    path("posts/", views.publish_post, name="threads-publish-post"),
    path("posts/generate/", views.generate_post_view, name="threads-generate-post"),
    path("images/", views.upload_image, name="threads-upload-image"),
    # Replies
    path("replies/", views.post_reply, name="threads-post-reply"),
    path("replies/generate/", views.generate_reply_view, name="threads-generate-reply"),
    # Profile & Activity
    path("profile/", views.profile, name="threads-profile"),
    path("profile/history/", views.profile_history, name="threads-profile-history"),
    path("sync/", views.sync_now, name="threads-sync"),
    path("activity/", views.activity, name="threads-activity"),
    path("overview/", views.overview, name="threads-overview"),
    path("user-threads/", views.user_threads, name="threads-user-threads"),
    path("rate-limit/", views.rate_limit_status, name="threads-rate-limit"),
    # Automations
    path("automations/", views.automations, name="threads-automations"),
    path("automations/<int:automation_id>/", views.automation_detail, name="threads-automation-detail"),
    path("automations/<int:automation_id>/run/", views.automation_run_now, name="threads-automation-run-now"),
    path("automation-runs/", views.automation_runs, name="threads-automation-runs"),
]
