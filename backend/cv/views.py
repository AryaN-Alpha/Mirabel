import logging

from django.http import HttpResponse
from rest_framework.decorators import api_view
from rest_framework.request import Request
from rest_framework.response import Response

from cv.models import CVProfile
from cv.schema import MAX_FIELD_LENGTH, normalize_sections
from cv.services.generation import generate_project_description, regenerate_section
from cv.services.parsing import MAX_EXTRACTED_CHARS, extract_hyperlinks, extract_text
from cv.services.pdf_export import render_cv_pdf
from cv.services.structuring import structure_cv

logger = logging.getLogger("cv.views")

MAX_UPLOAD_BYTES = 10 * 1024 * 1024
MAX_INSTRUCTIONS_LENGTH = 1000
MAX_CURRENT_TEXT_LENGTH = 5000
MAX_CV_NAME_LENGTH = 200

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
    pdf_bytes = render_cv_pdf(cv.sections)
    response = HttpResponse(pdf_bytes, content_type="application/pdf")
    response["Content-Disposition"] = 'attachment; filename="cv.pdf"'
    return response
