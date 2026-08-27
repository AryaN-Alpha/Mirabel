from django.urls import path

from cv import views

urlpatterns = [
    path("", views.cv_list, name="cv-list"),
    path("<int:cv_id>/", views.cv_detail, name="cv-detail"),
    path("<int:cv_id>/upload/", views.upload, name="cv-upload"),
    path("<int:cv_id>/export/", views.export_pdf, name="cv-export"),
    path("<int:cv_id>/sections/<str:section_type>/generate/", views.generate_section, name="cv-generate-section"),
    path(
        "<int:cv_id>/sections/<str:section_type>/regenerate/",
        views.regenerate_section_view,
        name="cv-regenerate-section",
    ),
]
