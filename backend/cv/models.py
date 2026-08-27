from django.db import models

from cv.schema import empty_sections


class CVProfile(models.Model):
    """One saved CV version. A user can keep multiple (e.g. "Backend-focused",
    "Full-stack") and switch between them — same multi-row pattern as
    kanban.models.Project, no auth/multi-user system needed since there's
    still only one person using this app (see ModelPreference, core/models.py,
    for the same no-auth reasoning applied to a true singleton). original_file
    is kept only as the ingestion artifact from upload — it is never
    re-parsed after the initial AI-structuring pass; sections is the single
    source of truth from then on, edited directly (manually or via AI section
    generation) and rendered live on the frontend and at PDF-export time.
    """

    name = models.CharField(max_length=200, default="Main")
    original_file = models.FileField(upload_to="cv/", blank=True, null=True)
    sections = models.JSONField(default=empty_sections, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["created_at"]

    def __str__(self) -> str:
        return f"CVProfile({self.name!r}, updated {self.updated_at})"
