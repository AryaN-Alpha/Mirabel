import io
import os
import re

from django.template.loader import render_to_string

FONT_FAMILY = "CVSans"
_fonts_registered = False


def _register_fonts() -> None:
    """Embeds Bitstream Vera Sans (bundled with reportlab — a hard dependency
    of xhtml2pdf, so this file is always present, no extra download needed)
    so the exported PDF renders identically everywhere.

    Without this, xhtml2pdf uses reportlab's non-embedded core-14
    "Helvetica" alias, which every PDF viewer substitutes with its own local
    font — inconsistently, since Windows has no Helvetica at all. That's
    what caused the exported PDF to render in a random serif/italic
    fallback in some viewers despite looking fine in others.

    This deliberately does NOT use CSS @font-face (the "normal" xhtml2pdf
    way to add a font): xhtml2pdf's @font-face handler copies the font file
    through a NamedTemporaryFile and reopens it by path, which fails with a
    PermissionError on Windows — the temp file is still open/locked by its
    own handle. Registering directly with reportlab and then seeding
    xhtml2pdf's *own* font-name table (which is a separate lookup from
    reportlab's, populated only by @font-face processing otherwise) sidesteps
    that path entirely.
    """
    global _fonts_registered
    if _fonts_registered:
        return
    import reportlab
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    from xhtml2pdf import default as pisa_default

    fonts_dir = os.path.join(os.path.dirname(reportlab.__file__), "fonts")
    pdfmetrics.registerFont(TTFont(FONT_FAMILY, os.path.join(fonts_dir, "Vera.ttf")))
    pdfmetrics.registerFont(TTFont(f"{FONT_FAMILY}-Bold", os.path.join(fonts_dir, "VeraBd.ttf")))
    pdfmetrics.registerFont(TTFont(f"{FONT_FAMILY}-Italic", os.path.join(fonts_dir, "VeraIt.ttf")))
    pdfmetrics.registerFont(TTFont(f"{FONT_FAMILY}-BoldItalic", os.path.join(fonts_dir, "VeraBI.ttf")))
    pdfmetrics.registerFontFamily(
        FONT_FAMILY,
        normal=FONT_FAMILY,
        bold=f"{FONT_FAMILY}-Bold",
        italic=f"{FONT_FAMILY}-Italic",
        boldItalic=f"{FONT_FAMILY}-BoldItalic",
    )
    pisa_default.DEFAULT_FONT[FONT_FAMILY.lower()] = FONT_FAMILY
    _fonts_registered = True


_SAFE_SCHEMES = re.compile(r"^(https?|mailto|tel):", re.IGNORECASE)
_ANY_SCHEME = re.compile(r"^[a-z][a-z0-9+.-]*:", re.IGNORECASE)
_SCHEME_PREFIX = re.compile(r"^[a-z][a-z0-9+.-]*:/*", re.IGNORECASE)


def _as_href(url: str) -> str:
    """CV links/project URLs are free-typed text (e.g. "linkedin.com/in/x"
    pasted without a scheme, or AI-extracted bare domains) — used verbatim as
    an <a href> that becomes relative to the PDF's own (nonexistent) base
    URL, producing a dead link. Mirrors frontend/src/utils/url.js's
    normalizeUrl so the same free-text value ends up clickable everywhere.

    Any scheme outside the safe allowlist (javascript:, data:, ...) is
    stripped and treated as a bare domain instead of passed through as an
    href verbatim — this field has no server-side sanitization, so a value
    like "javascript:..." would otherwise land in the exported PDF as a
    clickable link action."""
    url = (url or "").strip()
    if not url:
        return ""
    if _SAFE_SCHEMES.match(url):
        return url
    if _ANY_SCHEME.match(url):
        return f"https://{_SCHEME_PREFIX.sub('', url)}"
    if "@" in url and "/" not in url:
        return f"mailto:{url}"
    return f"https://{url}"


def _with_description_lines(projects: list[dict]) -> list[dict]:
    """xhtml2pdf's HTML->PDF engine has no reliable way to split a string by
    newline in-template, so bullet-per-line project descriptions (both
    AI-generated and structured-from-PDF ones can contain multiple lines)
    are pre-split here into a fresh list of dicts — the original `sections`
    passed in is never mutated. Also stamps a normalized `href` for the
    project link so the template can emit a real clickable PDF hyperlink."""
    return [
        {
            **proj,
            "href": _as_href(proj.get("link", "")),
            "description_lines": [line.strip() for line in proj.get("description", "").split("\n") if line.strip()],
        }
        for proj in projects
    ]


def _with_hrefs(links: list[dict]) -> list[dict]:
    return [{**link, "href": _as_href(link.get("url", ""))} for link in links]


def render_cv_pdf(sections: dict) -> bytes:
    # Imported lazily so a machine without xhtml2pdf's (pure-Python, no
    # system deps) dependencies installed doesn't break every manage.py
    # command via Django's eager urls.py import chain — same reasoning as
    # the old weasyprint import here.
    from xhtml2pdf import pisa

    _register_fonts()
    personal_info = sections.get("personal_info", {})
    context = {
        "font_family": FONT_FAMILY,
        "sections": {
            **sections,
            "personal_info": {
                **personal_info,
                "links": _with_hrefs(personal_info.get("links", [])),
            },
            "projects": _with_description_lines(sections.get("projects", [])),
        },
    }
    html = render_to_string("cv/resume.html", context)

    buffer = io.BytesIO()
    result = pisa.CreatePDF(html, dest=buffer)
    if result.err:
        raise RuntimeError(f"xhtml2pdf failed to render the CV ({result.err} error(s))")
    return buffer.getvalue()
