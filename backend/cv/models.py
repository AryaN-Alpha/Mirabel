from django.db import models

from cv.schema import empty_sections


class CVProfile(models.Model):
    """Singleton row (pk=1) holding the user's structured CV.

    No auth/multi-user system exists in this app, so this is global rather
    than per-user, same as ModelPreference (core/models.py). original_file is
    kept only as the ingestion artifact from upload — it is never re-parsed
    after the initial AI-structuring pass; sections is the single source of
    truth from then on, edited directly (manually or via AI section
    generation) and rendered live on the frontend and at PDF-export time.
    """

    original_file = models.FileField(upload_to="cv/", blank=True, null=True)
    sections = models.JSONField(default=empty_sections, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return f"CVProfile(updated {self.updated_at})"

    @classmethod
    def current(cls) -> "CVProfile":
        obj, _ = cls.objects.get_or_create(pk=1, defaults={"sections": empty_sections()})
        return obj
