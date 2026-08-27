"""Curated, hardcoded catalogs of CV style choices — same "small fixed menu,
not user-defined" shape as core/services/providers' AVAILABLE_MODELS. Every
font/theme/template a user can pick lives here; CvStylePreference (models.py)
only ever stores one of these keys, never a raw value, so the frontend can't
smuggle in an arbitrary CSS font-family or color.

FONTS values are frontend-preview-only (see CvPreview.jsx) — deliberately not
applied to the PDF export, which keeps its own hardcoded embedded font
(pdf_export.py's FONT_FAMILY) to avoid the cross-viewer font-substitution bug
documented there. THEMES and TEMPLATES, by contrast, DO apply to both the
live preview and the exported PDF once their phases land.
"""

# "css" is the exact font-family stack CvPreview.jsx applies inline.
# "system-serif" matches the CV's original hardcoded default exactly, so
# picking no font at all (DEFAULT_FONT) never changes today's look.
FONTS = {
    "system-serif": {
        "label": "Classic Serif",
        "css": "Georgia, 'Times New Roman', Times, serif",
    },
    "system-sans": {
        "label": "Clean Sans",
        "css": "-apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    },
    "lora": {
        "label": "Lora",
        "css": "'Lora', Georgia, serif",
        "google_font": "Lora",
    },
    "merriweather": {
        "label": "Merriweather",
        "css": "'Merriweather', Georgia, serif",
        "google_font": "Merriweather",
    },
}

# "classic-dark" matches the CV's original hardcoded sidebar/accent colors
# exactly (#262626 / #e0a878), so DEFAULT_THEME never changes today's look.
THEMES = {
    "classic-dark": {
        "label": "Classic Dark",
        "sidebar_bg": "#262626",
        "sidebar_text": "#e8e8e8",
        "accent": "#e0a878",
    },
    "midnight-blue": {
        "label": "Midnight Blue",
        "sidebar_bg": "#1e2a38",
        "sidebar_text": "#dbe4ec",
        "accent": "#7fa9c9",
    },
    "forest": {
        "label": "Forest",
        "sidebar_bg": "#1f2b22",
        "sidebar_text": "#dbe9df",
        "accent": "#8bb894",
    },
    "wine": {
        "label": "Wine",
        "sidebar_bg": "#2b1e22",
        "sidebar_text": "#ecdfe2",
        "accent": "#c98b9c",
    },
}

# Only the CV's current (only) layout exists so far — "minimal-single-column"
# is added here once its renderer (CvPreviewMinimal.jsx) actually exists, not
# before, so the catalog never advertises a template that does nothing yet.
TEMPLATES = {
    "two-column": {"label": "Two-column"},
}
