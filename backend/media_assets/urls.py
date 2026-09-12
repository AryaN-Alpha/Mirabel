from django.urls import path

from media_assets import views

urlpatterns = [
    path("assets/", views.MediaAssetListView.as_view(), name="media-asset-list"),
    path("assets/<uuid:pk>/", views.MediaAssetDetailView.as_view(), name="media-asset-detail"),
    path("assets/<uuid:pk>/attach/", views.AttachMediaToDraftView.as_view(), name="media-asset-attach"),
    path("assets/<uuid:pk>/variations/", views.MediaAssetVariationsView.as_view(), name="media-asset-variations"),
    path("assets/<uuid:pk>/analyze/", views.MediaAssetAnalyzeView.as_view(), name="media-asset-analyze"),
    path("generate/image/", views.GenerateImageView.as_view(), name="media-generate-image"),
    path("generate/video/", views.GenerateVideoView.as_view(), name="media-generate-video"),
    path("generate/image-to-video/", views.GenerateImageToVideoView.as_view(), name="media-generate-image-to-video"),
    path("jobs/", views.MediaJobListView.as_view(), name="media-job-list"),
    path("jobs/<uuid:pk>/", views.MediaJobDetailView.as_view(), name="media-job-detail"),
]
