import logging

from django.http import HttpResponse
from rest_framework.decorators import api_view
from rest_framework.request import Request
from rest_framework.response import Response

from cv.models import CoverLetter, CVProfile, CvStylePreference
from cv.schema import MAX_FIELD_LENGTH, default_section_order, normalize_sections
from cv.services.consistency import check_cv_consistency
from cv.services.generation import generate_cover_letter, generate_project_description, regenerate_section
from cv.services.parsing import MAX_EXTRACTED_CHARS, extract_hyperlinks, extract_text
from cv.services.pdf_export import render_cover_letter_pdf, render_cv_pdf
from cv.services.structuring import structure_cv
from cv.services.tailoring import auto_tailor_sections, tailor_cv_to_job
from cv.style_catalog import FONTS, TEMPLATES, THEMES

logger = logging.getLogger("cv.views")

MAX_UPLOAD_BYTES = 10 * 1024 * 1024
MAX_INSTRUCTIONS_LENGTH = 1000
MAX_CURRENT_TEXT_LENGTH = 5000
MAX_CV_NAME_LENGTH = 200
MAX_JOB_DESCRIPTION_LENGTH = 8000

# Section types an "Ask AI" action can target. "projects" is the only one
# that currently supports generating a brand-new entry from scratch (title +
# tech + one-liner) — the others only support rewriting an existing entry.
SECTION_TYPES = {"experience", "education", "projects", "certifications", "summary", "strengths"}


def _get_cv(cv_id: int) -> CVProfile | None:
    try:
        return CVProfile.objects.get(pk=cv_id)
    except CVProfile.DoesNotExist:
        return None


def _serialize_cv_meta(cv: CVProfile) -> dict:
    return {
        "id": cv.id,
        "name": cv.name,
        "has_file": bool(cv.original_file),
        "updated_at": cv.updated_at,
    }


def _serialize(cv: CVProfile) -> dict:
    return {
        "id": cv.id,
        "name": cv.name,
        "sections": cv.sections,
        "has_file": bool(cv.original_file),
        "file_url": cv.original_file.url if cv.original_file else "",
        "updated_at": cv.updated_at,
    }


@api_view(["GET", "POST"])
def cv_list(request: Request) -> Response:
    if request.method == "GET":
        cvs = CVProfile.objects.all()
        return Response({"cvs": [_serialize_cv_meta(cv) for cv in cvs]})

    name = (request.data.get("name") or "").strip()
    if not name:
        return Response({"error": "name is required"}, status=400)
    if len(name) > MAX_CV_NAME_LENGTH:
        return Response({"error": f"name must be under {MAX_CV_NAME_LENGTH} characters"}, status=400)

    cv = CVProfile.objects.create(name=name)
    return Response(_serialize(cv), status=201)


@api_view(["GET", "PUT", "DELETE"])
def cv_detail(request: Request, cv_id: int) -> Response:
    cv = _get_cv(cv_id)
    if cv is None:
        return Response({"error": "CV not found."}, status=404)

    if request.method == "GET":
        return Response(_serialize(cv))

    if request.method == "DELETE":
        cv.delete()
        return Response(status=204)

    if "name" in request.data:
        name = (request.data.get("name") or "").strip()
        if not name:
            return Response({"error": "name cannot be empty"}, status=400)
        if len(name) > MAX_CV_NAME_LENGTH:
            return Response({"error": f"name must be under {MAX_CV_NAME_LENGTH} characters"}, status=400)
        cv.name = name

    if "sections" in request.data:
        sections = request.data.get("sections")
        if not isinstance(sections, dict):
            # Reject rather than defaulting to {} — normalize_sections() would
            # otherwise happily coerce a missing/malformed body into an empty
            # CV and silently wipe out everything the user has, since this is
            # a full-replace field by design (see CvPage.jsx's autosave).
            return Response({"error": "sections must be an object"}, status=400)
        cv.sections = normalize_sections(sections)

    cv.save()
    return Response(_serialize(cv))


@api_view(["POST"])
def upload(request: Request, cv_id: int) -> Response:
    cv = _get_cv(cv_id)
    if cv is None:
        return Response({"error": "CV not found."}, status=404)

    file = request.FILES.get("file")
    if not file:
        return Response({"error": "file is required"}, status=400)
    if file.content_type != "application/pdf" and not file.name.lower().endswith(".pdf"):
        return Response({"error": "file must be a PDF"}, status=400)
    if file.size > MAX_UPLOAD_BYTES:
        return Response({"error": "file must be under 10MB"}, status=400)

    cv.original_file = file
    cv.save()

    try:
        raw_text = extract_text(cv.original_file)
        hyperlinks = extract_hyperlinks(cv.original_file)
    except Exception as exc:
        # pdfplumber/pdfminer raise a variety of exception types for a
        # corrupted, empty, or password-protected PDF — none of them are
        # transient or worth surfacing verbatim to the client, but "your PDF
        # was unreadable" is a much more specific and actionable message
        # than the generic 500 the global handler would otherwise return.
        logger.error("Failed to extract text from uploaded CV: %s", exc)
        return Response(
            {"error": "Couldn't read that PDF — it may be corrupted or password-protected.", "reason": "unreadable"},
            status=422,
        )
    if not raw_text:
        return Response(
            {"error": "Couldn't extract any text from that PDF — it may be a scanned image.", "reason": "no_text"},
            status=422,
        )

    result = structure_cv(raw_text, hyperlinks=hyperlinks)
    cv.sections = result["sections"]
    cv.save()
    return Response(
        {
            **_serialize(cv),
            "error": result["error"],
            "reason": result["reason"],
            "truncated": len(raw_text) >= MAX_EXTRACTED_CHARS,
        }
    )


@api_view(["POST"])
def generate_section(request: Request, cv_id: int, section_type: str) -> Response:
    cv = _get_cv(cv_id)
    if cv is None:
        return Response({"error": "CV not found."}, status=404)
    if section_type not in SECTION_TYPES:
        return Response({"error": "unknown section type"}, status=404)
    if section_type != "projects":
        return Response({"error": f"AI generation for new '{section_type}' entries isn't supported yet"}, status=400)

    title = (request.data.get("title") or "").strip()[:MAX_FIELD_LENGTH]
    if not title:
        return Response({"error": "title is required"}, status=400)
    tech = (request.data.get("tech") or "").strip()[:MAX_FIELD_LENGTH]
    one_liner = (request.data.get("one_liner") or "").strip()[:MAX_FIELD_LENGTH]

    result = generate_project_description(title=title, tech=tech, one_liner=one_liner, sections=cv.sections)
    return Response(result)


@api_view(["POST"])
def regenerate_section_view(request: Request, cv_id: int, section_type: str) -> Response:
    cv = _get_cv(cv_id)
    if cv is None:
        return Response({"error": "CV not found."}, status=404)
    if section_type not in SECTION_TYPES:
        return Response({"error": "unknown section type"}, status=404)
    current_text = (request.data.get("current_text") or "").strip()[:MAX_CURRENT_TEXT_LENGTH]
    if not current_text:
        return Response({"error": "current_text is required"}, status=400)
    instructions = (request.data.get("instructions") or "").strip()[:MAX_INSTRUCTIONS_LENGTH]

    result = regenerate_section(
        section_type=section_type, current_text=current_text, instructions=instructions, sections=cv.sections
    )
    return Response(result)


@api_view(["GET"])
def export_pdf(_request: Request, cv_id: int) -> HttpResponse:
    cv = _get_cv(cv_id)
    if cv is None:
        return Response({"error": "CV not found."}, status=404)
    style_pref = CvStylePreference.current()
    # Font is deliberately excluded — the PDF keeps its own hardcoded
    # embedded font (pdf_export.FONT_FAMILY) to avoid the cross-viewer
    # font-substitution bug documented there; only theme/section-order/
    # template apply to the export.
    style = {
        "theme": THEMES.get(style_pref.theme_choice, THEMES[CvStylePreference.DEFAULT_THEME]),
        "section_order": style_pref.section_order,
        "template_choice": style_pref.template_choice,
    }
    pdf_bytes = render_cv_pdf(cv.sections, style)
    response = HttpResponse(pdf_bytes, content_type="application/pdf")
    response["Content-Disposition"] = 'attachment; filename="cv.pdf"'
    return response


def _is_valid_section_order(order) -> bool:
    if not isinstance(order, dict) or set(order) != {"main", "sidebar"}:
        return False
    expected = default_section_order()
    for column, keys in expected.items():
        value = order[column]
        if not isinstance(value, list) or set(value) != set(keys) or len(value) != len(keys):
            return False
    return True


@api_view(["GET", "PUT"])
def cv_style_preference(request: Request) -> Response:
    pref = CvStylePreference.current()

    if request.method == "GET":
        return Response(
            {
                "font_choice": pref.font_choice,
                "theme_choice": pref.theme_choice,
                "template_choice": pref.template_choice,
                "section_order": pref.section_order,
                "available": {"fonts": FONTS, "themes": THEMES, "templates": TEMPLATES},
            }
        )

    font_choice = request.data.get("font_choice", pref.font_choice)
    theme_choice = request.data.get("theme_choice", pref.theme_choice)
    template_choice = request.data.get("template_choice", pref.template_choice)
    section_order = request.data.get("section_order", pref.section_order)

    if font_choice not in FONTS:
        return Response({"error": f"unknown font_choice: {font_choice!r}"}, status=400)
    if theme_choice not in THEMES:
        return Response({"error": f"unknown theme_choice: {theme_choice!r}"}, status=400)
    if template_choice not in TEMPLATES:
        return Response({"error": f"unknown template_choice: {template_choice!r}"}, status=400)
    if not _is_valid_section_order(section_order):
        return Response({"error": "section_order must list each section exactly once per column"}, status=400)

    pref.font_choice = font_choice
    pref.theme_choice = theme_choice
    pref.template_choice = template_choice
    pref.section_order = section_order
    pref.save()
    return Response(
        {
            "font_choice": pref.font_choice,
            "theme_choice": pref.theme_choice,
            "template_choice": pref.template_choice,
            "section_order": pref.section_order,
            "available": {"fonts": FONTS, "themes": THEMES, "templates": TEMPLATES},
        }
    )


@api_view(["POST"])
def tailor_to_job(request: Request, cv_id: int) -> Response:
    cv = _get_cv(cv_id)
    if cv is None:
        return Response({"error": "CV not found."}, status=404)
    job_description = (request.data.get("job_description") or "").strip()[:MAX_JOB_DESCRIPTION_LENGTH]
    if not job_description:
        return Response({"error": "job_description is required"}, status=400)
    result = tailor_cv_to_job(cv.sections, job_description)
    return Response(result)


@api_view(["POST"])
def apply_tailoring(request: Request, cv_id: int) -> Response:
    """Takes a tailor_to_job result the frontend already has in state
    (suggestions + missing_keywords) and creates a NEW CVProfile with only
    the flagged sections rewritten — the original CV is never mutated. See
    cv.services.tailoring.auto_tailor_sections for why this reuses the
    already-paid-for suggestions instead of re-running the job-fit analysis
    (and never re-sends the job description) — the client-supplied
    suggestions are LLM output from moments ago in the same session, not
    user-authored input, and this app has no auth/multi-user boundary for
    them to cross (see CLAUDE.md's "no auth" gap)."""
    cv = _get_cv(cv_id)
    if cv is None:
        return Response({"error": "CV not found."}, status=404)
    suggestions = request.data.get("suggestions")
    if not isinstance(suggestions, list):
        return Response({"error": "suggestions must be a list"}, status=400)
    missing_keywords = request.data.get("missing_keywords")
    if not isinstance(missing_keywords, list):
        missing_keywords = []

    result = auto_tailor_sections(cv.sections, suggestions, missing_keywords)
    new_cv = CVProfile.objects.create(name=f"{cv.name} — Tailored", sections=result["sections"])
    return Response(
        {
            **_serialize(new_cv),
            "changed_sections": result["changed_sections"],
            "changes": result["changes"],
            "error": result["error"],
            "reason": result["reason"],
        },
        status=201,
    )


@api_view(["POST"])
def consistency_check(_request: Request, cv_id: int) -> Response:
    cv = _get_cv(cv_id)
    if cv is None:
        return Response({"error": "CV not found."}, status=404)
    result = check_cv_consistency(cv.sections)
    return Response(result)


def _serialize_cover_letter_meta(letter: CoverLetter) -> dict:
    return {
        "id": letter.id,
        "job_title": letter.job_title,
        "company_name": letter.company_name,
        "created_at": letter.created_at,
        "updated_at": letter.updated_at,
    }


def _serialize_cover_letter(letter: CoverLetter) -> dict:
    return {
        **_serialize_cover_letter_meta(letter),
        "job_description": letter.job_description,
        "generated_text": letter.generated_text,
    }


def _get_cover_letter(cv: CVProfile, letter_id: int) -> CoverLetter | None:
    try:
        return cv.cover_letters.get(pk=letter_id)
    except CoverLetter.DoesNotExist:
        return None


@api_view(["GET", "POST"])
def cover_letter_list(request: Request, cv_id: int) -> Response:
    cv = _get_cv(cv_id)
    if cv is None:
        return Response({"error": "CV not found."}, status=404)

    if request.method == "GET":
        return Response({"cover_letters": [_serialize_cover_letter_meta(letter) for letter in cv.cover_letters.all()]})

    job_description = (request.data.get("job_description") or "").strip()[:MAX_JOB_DESCRIPTION_LENGTH]
    if not job_description:
        return Response({"error": "job_description is required"}, status=400)
    job_title = (request.data.get("job_title") or "").strip()[:MAX_FIELD_LENGTH]
    company_name = (request.data.get("company_name") or "").strip()[:MAX_FIELD_LENGTH]

    letter = CoverLetter.objects.create(
        cv=cv, job_title=job_title, company_name=company_name, job_description=job_description
    )
    result = generate_cover_letter(
        job_description=job_description, company_name=company_name, job_title=job_title, sections=cv.sections
    )
    letter.generated_text = result["text"]
    letter.save()
    return Response({**_serialize_cover_letter(letter), "error": result["error"], "reason": result["reason"]}, status=201)


@api_view(["GET", "PUT", "DELETE"])
def cover_letter_detail(request: Request, cv_id: int, letter_id: int) -> Response:
    cv = _get_cv(cv_id)
    if cv is None:
        return Response({"error": "CV not found."}, status=404)
    letter = _get_cover_letter(cv, letter_id)
    if letter is None:
        return Response({"error": "Cover letter not found."}, status=404)

    if request.method == "GET":
        return Response(_serialize_cover_letter(letter))

    if request.method == "DELETE":
        letter.delete()
        return Response(status=204)

    if "generated_text" in request.data:
        letter.generated_text = request.data.get("generated_text") or ""
        letter.save()
    return Response(_serialize_cover_letter(letter))


@api_view(["GET"])
def cover_letter_export(_request: Request, cv_id: int, letter_id: int) -> HttpResponse:
    cv = _get_cv(cv_id)
    if cv is None:
        return Response({"error": "CV not found."}, status=404)
    letter = _get_cover_letter(cv, letter_id)
    if letter is None:
        return Response({"error": "Cover letter not found."}, status=404)
    style_pref = CvStylePreference.current()
    style = {
        "theme": THEMES.get(style_pref.theme_choice, THEMES[CvStylePreference.DEFAULT_THEME]),
        "section_order": style_pref.section_order,
        "template_choice": style_pref.template_choice,
    }
    pdf_bytes = render_cover_letter_pdf(letter, cv.sections.get("personal_info", {}), style=style)
    response = HttpResponse(pdf_bytes, content_type="application/pdf")
    response["Content-Disposition"] = 'attachment; filename="cover-letter.pdf"'
    return response
