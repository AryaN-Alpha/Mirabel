from django.urls import path

from classroom import views

urlpatterns = [
    path("auth/start/", views.auth_start, name="classroom-auth-start"),
    path("auth/callback/", views.auth_callback, name="classroom-auth-callback"),
    path("status/", views.status, name="classroom-status"),
    path("disconnect/", views.disconnect, name="classroom-disconnect"),
    path("courses/", views.list_courses_view, name="classroom-courses"),
    path("coursework/", views.list_coursework_view, name="classroom-coursework"),
    path(
        "courses/<str:course_id>/coursework/<str:coursework_id>/",
        views.coursework_detail,
        name="classroom-coursework-detail",
    ),
    path("solve/", views.solve_view, name="classroom-solve"),
    path("drafts/", views.drafts, name="classroom-drafts"),
    path("drafts/<int:draft_id>/", views.draft_detail, name="classroom-draft-detail"),
    path(
        "drafts/<int:draft_id>/turn-in/",
        views.turn_in_view,
        name="classroom-draft-turn-in",
    ),
]
