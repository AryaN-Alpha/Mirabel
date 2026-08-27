from django.db import models

from cv.schema import default_section_order, empty_sections


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


class CvStylePreference(models.Model):
    """Singleton row (pk=1) holding style choices for the CV feature — font,
    color theme, layout template, and section order. Global across every
    CVProfile version rather than per-version (a deliberate choice, unlike
    CVProfile itself): same no-auth/global-singleton reasoning as
    ModelPreference (core/models.py). Valid values for font_choice/
    theme_choice/template_choice are the keys of cv/style_catalog.py's
    FONTS/THEMES/TEMPLATES dicts — validated in the view, not here, same
    division of responsibility as ModelPreference/AVAILABLE_MODELS.
    """

    DEFAULT_FONT = "system-serif"
    DEFAULT_THEME = "classic-dark"
    DEFAULT_TEMPLATE = "two-column"

    font_choice = models.CharField(max_length=40, default=DEFAULT_FONT)
    theme_choice = models.CharField(max_length=40, default=DEFAULT_THEME)
    template_choice = models.CharField(max_length=40, default=DEFAULT_TEMPLATE)
    section_order = models.JSONField(default=default_section_order)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return f"CvStylePreference({self.font_choice}/{self.theme_choice}/{self.template_choice})"

    @classmethod
    def current(cls) -> "CvStylePreference":
        obj, _ = cls.objects.get_or_create(
            pk=1,
            defaults={
                "font_choice": cls.DEFAULT_FONT,
                "theme_choice": cls.DEFAULT_THEME,
                "template_choice": cls.DEFAULT_TEMPLATE,
                "section_order": default_section_order(),
            },
        )
        return obj
