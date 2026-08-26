from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include("core.urls")),
    path("api/outlook/", include("outlook.urls")),
    path("api/linkedin/", include("linkedin.urls")),
    path("api/classroom/", include("classroom.urls")),
    path("api/cv/", include("cv.urls")),
    path("api/memory/", include("memory.urls")),
    path("api/", include("kanban.urls")),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
