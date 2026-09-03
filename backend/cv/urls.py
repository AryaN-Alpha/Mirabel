from django.urls import path

from cv import views

urlpatterns = [
    path("", views.cv_list, name="cv-list"),
    path("style/", views.cv_style_preference, name="cv-style-preference"),
    path("<int:cv_id>/", views.cv_detail, name="cv-detail"),
    path("<int:cv_id>/upload/", views.upload, name="cv-upload"),
    path("<int:cv_id>/export/", views.export_pdf, name="cv-export"),
    path("<int:cv_id>/sections/<str:section_type>/generate/", views.generate_section, name="cv-generate-section"),
    path(
        "<int:cv_id>/sections/<str:section_type>/regenerate/",
        views.regenerate_section_view,
        name="cv-regenerate-section",
    ),
    path("<int:cv_id>/tailor/", views.tailor_to_job, name="cv-tailor"),
    path("<int:cv_id>/tailor/apply/", views.apply_tailoring, name="cv-tailor-apply"),
    path("<int:cv_id>/consistency-check/", views.consistency_check, name="cv-consistency-check"),
    path("<int:cv_id>/cover-letters/", views.cover_letter_list, name="cv-cover-letter-list"),
    path("<int:cv_id>/cover-letters/<int:letter_id>/", views.cover_letter_detail, name="cv-cover-letter-detail"),
    path(
        "<int:cv_id>/cover-letters/<int:letter_id>/export/", views.cover_letter_export, name="cv-cover-letter-export"
    ),
]
