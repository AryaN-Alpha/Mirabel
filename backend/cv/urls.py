from django.urls import path

from cv import views

urlpatterns = [
    path("", views.profile, name="cv-profile"),
    path("upload/", views.upload, name="cv-upload"),
    path("export/", views.export_pdf, name="cv-export"),
    path("sections/<str:section_type>/generate/", views.generate_section, name="cv-generate-section"),
    path("sections/<str:section_type>/regenerate/", views.regenerate_section_view, name="cv-regenerate-section"),
]
