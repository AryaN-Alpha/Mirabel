"""CV builder tools. Everything here generates or reads content the user
reviews afterward — there's no publish/send concept for a CV in this app —
so nothing is gated behind confirmation."""

from __future__ import annotations

from langchain_core.tools import tool

from cv.models import CVProfile
from cv.services.consistency import check_cv_consistency as _check_cv_consistency
from cv.services.generation import generate_cover_letter as _generate_cover_letter
from cv.services.generation import generate_project_description as _generate_project_description
from cv.services.generation import regenerate_section as _regenerate_section
from cv.services.tailoring import tailor_cv_to_job as _tailor_cv_to_job


@tool
def list_cv_profiles() -> list[dict]:
    """List every saved CV version (profile) with id and name."""
    return [{"id": c.id, "name": c.name} for c in CVProfile.objects.all()]


@tool
def get_cv_sections(cv_id: int) -> dict:
    """Get the full structured content (summary, experience, education, skills, etc.) of one CV version.

    Args:
        cv_id: The CV profile's id (see list_cv_profiles).
    """
    try:
        cv = CVProfile.objects.get(pk=cv_id)
    except CVProfile.DoesNotExist:
        return {"error": f"No CV with id {cv_id}."}
    return cv.sections


@tool
def regenerate_cv_section(cv_id: int, section_type: str, current_text: str, instructions: str = "") -> dict:
    """Use AI to rewrite one section of a CV (e.g. "summary"). Returns the new text WITHOUT
    saving it — report it back to the user rather than assuming it should be kept.

    Args:
        cv_id: The CV profile's id (see list_cv_profiles), used for tone/context.
        section_type: Which section to rewrite, e.g. "summary", "experience".
        current_text: The section's current text to improve on.
        instructions: Optional guidance, e.g. "make it more concise".
    """
    try:
        cv = CVProfile.objects.get(pk=cv_id)
    except CVProfile.DoesNotExist:
        return {"error": f"No CV with id {cv_id}."}
    return _regenerate_section(
        section_type=section_type, current_text=current_text, instructions=instructions, sections=cv.sections
    )


@tool
def generate_cv_project_description(cv_id: int, title: str, tech: str, one_liner: str) -> dict:
    """Use AI to write a polished project-description bullet for a CV, given a rough title/tech/summary.

    Args:
        cv_id: The CV profile's id (see list_cv_profiles), used for tone/context.
        title: Project title.
        tech: Tech stack used, comma-separated.
        one_liner: A rough one-line description of what the project does.
    """
    try:
        cv = CVProfile.objects.get(pk=cv_id)
    except CVProfile.DoesNotExist:
        return {"error": f"No CV with id {cv_id}."}
    return _generate_project_description(title=title, tech=tech, one_liner=one_liner, sections=cv.sections)


@tool
def tailor_cv_to_job(cv_id: int, job_description: str) -> dict:
    """Use AI to compare a CV against a job description — returns a match score, missing
    keywords, and section-by-section suggestions. Read-only, changes nothing.

    Args:
        cv_id: The CV profile's id (see list_cv_profiles).
        job_description: The full text of the job posting.
    """
    try:
        cv = CVProfile.objects.get(pk=cv_id)
    except CVProfile.DoesNotExist:
        return {"error": f"No CV with id {cv_id}."}
    return _tailor_cv_to_job(cv.sections, job_description)


@tool
def check_cv_consistency(cv_id: int) -> dict:
    """Use AI to scan a CV for internal inconsistencies (dates, tense, tone). Read-only.

    Args:
        cv_id: The CV profile's id (see list_cv_profiles).
    """
    try:
        cv = CVProfile.objects.get(pk=cv_id)
    except CVProfile.DoesNotExist:
        return {"error": f"No CV with id {cv_id}."}
    return _check_cv_consistency(cv.sections)


@tool
def generate_cv_cover_letter(cv_id: int, job_description: str, company_name: str = "", job_title: str = "") -> dict:
    """Use AI to draft a cover letter tailored to a job description, based on one CV version.
    Returns the drafted text WITHOUT saving it — report it back rather than assuming it
    should be kept as a permanent CoverLetter record.

    Args:
        cv_id: The CV profile's id (see list_cv_profiles).
        job_description: The full text of the job posting.
        company_name: Optional company name for personalization.
        job_title: Optional job title for personalization.
    """
    try:
        cv = CVProfile.objects.get(pk=cv_id)
    except CVProfile.DoesNotExist:
        return {"error": f"No CV with id {cv_id}."}
    return _generate_cover_letter(
        job_description=job_description, company_name=company_name, job_title=job_title, sections=cv.sections
    )


TOOLS = [
    list_cv_profiles,
    get_cv_sections,
    regenerate_cv_section,
    generate_cv_project_description,
    tailor_cv_to_job,
    check_cv_consistency,
    generate_cv_cover_letter,
]
