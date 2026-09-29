import functools
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


def _build_contact_items(personal_info: dict) -> list[dict]:
    """Flattens phone, email, location, and web links into an ordered list
    of text/href dicts so templates (like resume_minimal.html) can render a
    single inline contact row separated by middots with no floating/dangling
    delimiters when fields are omitted."""
    items = []
    if personal_info.get("phone"):
        items.append({"text": personal_info["phone"], "href": ""})
    if personal_info.get("email"):
        items.append({"text": personal_info["email"], "href": f"mailto:{personal_info['email']}"})
    if personal_info.get("location"):
        items.append({"text": personal_info["location"], "href": ""})
    for link in personal_info.get("links", []):
        url = link.get("url", "")
        label = link.get("label", "") or url
        if label or url:
            items.append({"text": label, "href": link.get("href") or _as_href(url)})
    return items


def _ordered_blocks(sections: dict, section_order: dict) -> tuple[list[dict], list[dict]]:
    """Builds the two columns' block lists in the order `section_order`
    specifies, one dict per section keyed by `kind` so the template can
    dispatch on it with an if/elif chain — see resume.html/resume_minimal.html.
    Mirrors CvPreview.jsx's sidebarSections/mainSections lookup-by-key
    approach on the frontend. Unknown keys in section_order are silently
    skipped rather than erroring — the view already validates section_order
    against exactly this key-set before it's ever saved (cv/views.py), so
    this is just defense in depth, not the primary guard."""
    main_data = {
        "summary": sections.get("summary"),
        "experience": sections.get("experience", []),
        "projects": sections.get("projects", []),
        "certifications": sections.get("certifications", []),
    }
    sidebar_data = {
        "skills": sections.get("skill_groups", []),
        "education": sections.get("education", []),
        "strengths": sections.get("strengths", []),
    }
    main_blocks = [{"kind": k, "data": main_data[k]} for k in section_order.get("main", []) if k in main_data]
    sidebar_blocks = [
        {"kind": k, "data": sidebar_data[k]} for k in section_order.get("sidebar", []) if k in sidebar_data
    ]
    return main_blocks, sidebar_blocks


_DEFAULT_SECTION_ORDER = {
    "main": ["summary", "experience", "projects", "certifications"],
    "sidebar": ["skills", "education", "strengths"],
}
_DEFAULT_THEME = {"sidebar_bg": "#262626", "sidebar_text": "#e8e8e8", "accent": "#e0a878"}

_TEMPLATE_FILES = {
    "two-column": "cv/resume.html",
    "minimal-single-column": "cv/resume_minimal.html",
}


@functools.lru_cache(maxsize=32)
def _generate_sidebar_bg_data_uri(sidebar_bg: str) -> str:
    """Generates a base64 PNG data URI of A4 dimensions (595x842 pt) where the
    left 34% (202 pt) is filled with `sidebar_bg` and the remaining 66% is
    white. This is applied as @page background-image so every single page of
    a multi-page two-column CV maintains the full-height sidebar background
    without relying on fixed CSS height constraints that break pagination.
    """
    import base64
    from PIL import Image, ImageDraw

    bg_color = sidebar_bg or _DEFAULT_THEME["sidebar_bg"]
    # Main column background: #faf6f1 (warm off-white, matches CvPreview.jsx mainStyle).
    # Sidebar strip width: 34% of (595 − 26pt right margin) = 193px. The background
    # image covers the full 595×842pt A4 page, so the dark stripe must align with
    # the sidebar td's actual rendered width inside the content area.
    try:
        img = Image.new("RGB", (595, 842), "#faf6f1")
        draw = ImageDraw.Draw(img)
        draw.rectangle([0, 0, 193, 842], fill=bg_color)
    except Exception:
        img = Image.new("RGB", (595, 842), "#faf6f1")
        draw = ImageDraw.Draw(img)
        draw.rectangle([0, 0, 193, 842], fill=_DEFAULT_THEME["sidebar_bg"])

    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    b64 = base64.b64encode(buffer.getvalue()).decode("ascii")
    return f"data:image/png;base64,{b64}"


def _estimate_sidebar_height(personal_info: dict, sidebar_blocks: list[dict]) -> int:
    h = 0
    contact_count = sum(1 for k in ["phone", "email", "location"] if personal_info.get(k))
    contact_count += len(personal_info.get("links", []))
    h += 20 + contact_count * 14 + 16

    for block in sidebar_blocks:
        kind = block.get("kind")
        data = block.get("data", [])
        if not data:
            continue
        h += 20
        if kind == "skills":
            for grp in data:
                if grp.get("category"):
                    h += 16
                h += len(grp.get("skills", [])) * 12
        elif kind == "education":
            for edu in data:
                if edu.get("school") or edu.get("degree"):
                    h += 45
        elif kind == "strengths":
            for s in data:
                if s.get("title"):
                    h += 32
        h += 16
    return h


def _estimate_main_unit_height(unit: dict) -> int:
    kind = unit.get("kind")
    h = 0
    if unit.get("show_header"):
        h += 25
    if kind == "header_only":
        return 65
    elif kind == "header_and_summary":
        summary = unit.get("summary", "")
        lines = max(1, len(summary) // 80)
        return 65 + lines * 14 + 10
    elif kind == "summary_item":
        lines = max(1, len(str(unit.get("data", ""))) // 80)
        return lines * 14 + 10
    elif kind == "experience_item":
        h += 35
        bullets = unit.get("data", {}).get("bullets", [])
        for b in bullets:
            h += max(1, len(str(b)) // 70) * 14
        h += 10
    elif kind == "project_item":
        h += 35
        lines = unit.get("data", {}).get("description_lines", [])
        for line in lines:
            h += max(1, len(str(line)) // 70) * 14
        h += 10
    elif kind == "certification_item":
        h += 30
    return h


def _build_cv_rows(
    main_blocks: list[dict],
    sidebar_blocks: list[dict],
    personal_info: dict | None = None,
) -> list[dict]:
    """Packs sidebar sections and main sections into rows for the two-column template.

    To avoid artificial vertical gaps between sidebar items (which occurs when each
    sidebar item is stretched to match a tall main item in its table row), all sidebar
    sections (Contact, Education, Skills, Strengths) are rendered together in Row 0's
    sidebar cell.

    Row 0's main cell is filled with the header, summary, and initial main items
    (experience/projects/certifications) up to the height of the sidebar (or up to
    page 1 limit).

    Any remaining main items are placed into individual subsequent rows with an empty
    sidebar cell. Because an empty sidebar cell has height 0, subsequent rows are sized
    exactly to their own main item and break cleanly across pages (Page 2, Page 3, etc.)
    with zero font shrinking and natural vertical spacing.
    """
    personal_info = personal_info or {}

    main_units = []
    first_block = main_blocks[0] if main_blocks else None
    if first_block and first_block["kind"] == "summary" and first_block.get("data"):
        main_units.append({"kind": "header_and_summary", "summary": first_block["data"]})
        remaining_main = main_blocks[1:]
    else:
        main_units.append({"kind": "header_only"})
        remaining_main = main_blocks

    for block in remaining_main:
        if block["kind"] == "summary":
            if block.get("data"):
                main_units.append({"kind": "summary_item", "data": block["data"]})
        elif block["kind"] == "experience":
            exps = [e for e in block.get("data", []) if e.get("title") or e.get("company") or e.get("bullets")]
            for idx, exp in enumerate(exps):
                main_units.append({
                    "kind": "experience_item",
                    "show_header": (idx == 0),
                    "data": exp,
                })
        elif block["kind"] == "projects":
            projs = [p for p in block.get("data", []) if p.get("title") or p.get("description_lines")]
            for idx, proj in enumerate(projs):
                main_units.append({
                    "kind": "project_item",
                    "show_header": (idx == 0),
                    "data": proj,
                })
        elif block["kind"] == "certifications":
            certs = [c for c in block.get("data", []) if c.get("name")]
            for idx, cert in enumerate(certs):
                main_units.append({
                    "kind": "certification_item",
                    "show_header": (idx == 0),
                    "data": cert,
                })

    sidebar_h = _estimate_sidebar_height(personal_info, sidebar_blocks)

    row0_main = []
    current_main_h = 0
    remaining_idx = 0

    for idx, unit in enumerate(main_units):
        unit_h = _estimate_main_unit_height(unit)
        if not row0_main or (current_main_h + unit_h <= max(sidebar_h + 80, 450) and current_main_h + unit_h <= 620):
            row0_main.append(unit)
            current_main_h += unit_h
            remaining_idx = idx + 1
        else:
            break

    rows = []
    rows.append({
        "is_row_0": True,
        "main_units": row0_main,
    })

    for unit in main_units[remaining_idx:]:
        rows.append({
            "is_row_0": False,
            "main_units": [unit],
        })

    return rows


def render_cv_pdf(sections: dict, style: dict | None = None) -> bytes:
    # Imported lazily so a machine without xhtml2pdf's (pure-Python, no
    # system deps) dependencies installed doesn't break every manage.py
    # command via Django's eager urls.py import chain — same reasoning as
    # the old weasyprint import here.
    from xhtml2pdf import pisa

    _register_fonts()
    style = style or {}
    theme = style.get("theme") or _DEFAULT_THEME
    section_order = style.get("section_order") or _DEFAULT_SECTION_ORDER
    template_name = _TEMPLATE_FILES.get(style.get("template_choice"), _TEMPLATE_FILES["two-column"])

    personal_info = sections.get("personal_info", {})
    resolved_sections = {
        **sections,
        "personal_info": {
            **personal_info,
            "links": _with_hrefs(personal_info.get("links", [])),
        },
        "projects": _with_description_lines(sections.get("projects", [])),
    }
    main_blocks, sidebar_blocks = _ordered_blocks(resolved_sections, section_order)
    contact_items = _build_contact_items(resolved_sections["personal_info"])
    rows = []
    sidebar_bg_data_uri = ""
    if template_name == _TEMPLATE_FILES["two-column"]:
        rows = _build_cv_rows(
            main_blocks,
            sidebar_blocks,
            personal_info=resolved_sections.get("personal_info"),
        )
        sidebar_bg_data_uri = _generate_sidebar_bg_data_uri(theme["sidebar_bg"])

    context = {
        "font_family": FONT_FAMILY,
        "sections": resolved_sections,
        "contact_items": contact_items,
        "main_blocks": main_blocks,
        "sidebar_blocks": sidebar_blocks,
        "rows": rows,
        "sidebar_bg_data_uri": sidebar_bg_data_uri,
        "sidebar_bg": theme["sidebar_bg"],
        "sidebar_text": theme["sidebar_text"],
        "accent": theme["accent"],
    }
    html = render_to_string(template_name, context)

    buffer = io.BytesIO()
    result = pisa.CreatePDF(html, dest=buffer)
    if result.err:
        raise RuntimeError(f"xhtml2pdf failed to render the CV ({result.err} error(s))")
    return buffer.getvalue()


def render_cover_letter_pdf(cover_letter, personal_info: dict, style: dict | None = None) -> bytes:
    """Reuses `_register_fonts()`/FONT_FAMILY — same embedded-font-consistency
    reasoning as render_cv_pdf, no separate font registration for this
    document type. Accepts optional style to apply the active CV theme accent."""
    from xhtml2pdf import pisa

    _register_fonts()
    style = style or {}
    theme = style.get("theme") or _DEFAULT_THEME
    accent = theme.get("accent") or _DEFAULT_THEME["accent"]

    resolved_personal_info = {
        **personal_info,
        "links": _with_hrefs(personal_info.get("links", [])),
    }

    paragraphs = [p.strip() for p in (cover_letter.generated_text or "").split("\n") if p.strip()]
    has_salutation = bool(
        paragraphs and re.match(r"^(dear|to whom|hello|greetings)\b", paragraphs[0], re.IGNORECASE)
    )
    has_signoff = bool(
        paragraphs
        and re.search(
            r"\b(sincerely|regards|best regards|warm regards|respectfully|thank you)\b",
            paragraphs[-1],
            re.IGNORECASE,
        )
    )

    context = {
        "font_family": FONT_FAMILY,
        "accent": accent,
        "personal_info": resolved_personal_info,
        "job_title": cover_letter.job_title,
        "company_name": cover_letter.company_name,
        # "%-d" (no leading zero) is Linux-only — %#d is the Windows
        # equivalent and neither works on the other OS, so the day is
        # formatted separately as a plain int instead of relying on either.
        "date": (
            f"{cover_letter.updated_at:%B} {cover_letter.updated_at.day}, {cover_letter.updated_at:%Y}"
            if cover_letter.updated_at
            else ""
        ),
        "has_salutation": has_salutation,
        "has_signoff": has_signoff,
        "paragraphs": paragraphs,
    }
    html = render_to_string("cv/cover_letter.html", context)

    buffer = io.BytesIO()
    result = pisa.CreatePDF(html, dest=buffer)
    if result.err:
        raise RuntimeError(f"xhtml2pdf failed to render the cover letter ({result.err} error(s))")
    return buffer.getvalue()
