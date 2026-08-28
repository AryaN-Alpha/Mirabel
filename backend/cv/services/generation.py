import logging
from typing import Any

from core.models import ModelPreference
from core.services.providers import ProviderError, get_provider
from cv.prompts import cover_letter_system_prompt, project_description_system_prompt, section_rewrite_system_prompt

logger = logging.getLogger("cv.services.generation")

MAX_CONTEXT_CHARS = 4000


def _generate(*, system: str, user_content: str) -> dict[str, Any]:
    """Never-crash contract, matching linkedin/services/generation.py::_generate."""
    pref = ModelPreference.current()
    try:
        provider = get_provider(pref.provider)
        text = provider.generate_text(
            model=pref.model,
            system=system,
            history=[{"role": "user", "content": user_content}],
            max_tokens=pref.max_tokens,
            temperature=pref.temperature,
        )
        return {"text": text.strip(), "error": False, "reason": None}
    except ProviderError as exc:
        logger.error("%s provider call failed: %s", pref.provider, exc)
        return {"text": "", "error": True, "reason": "provider"}
    except Exception as exc:
        logger.error("CV generation failed: %s", exc)
        return {"text": "", "error": True, "reason": "unknown"}


def format_cv_context(sections: dict) -> str:
    """Condenses the rest of the CV into a short block so AI-generated section
    content stays consistent in tone/seniority, without sending the whole
    structure verbatim on every call."""
    if not sections:
        return ""
    lines = []
    summary = (sections.get("summary") or "").strip()
    if summary:
        lines.append(f"Summary: {summary}")
    for exp in sections.get("experience", [])[:3]:
        title, company = exp.get("title", ""), exp.get("company", "")
        if title or company:
            lines.append(f"Experience: {title} at {company}".strip())
    # schema.py's shape is skill_groups (a list of {category, skills}), not a
    # flat "skills" key — that key never exists, so this always silently
    # produced zero skill context for every caller. Flatten it here instead.
    skills = [skill for group in sections.get("skill_groups", []) for skill in group.get("skills", [])]
    if skills:
        lines.append(f"Skills: {', '.join(skills[:15])}")
    return "\n".join(lines)[:MAX_CONTEXT_CHARS]


def generate_project_description(*, title: str, tech: str, one_liner: str, sections: dict) -> dict[str, Any]:
    context = format_cv_context(sections)
    user_content = f"Project title: {title}\nTech stack: {tech}\nWhat it does: {one_liner}"
    return _generate(system=project_description_system_prompt(context), user_content=user_content)


def regenerate_section(*, section_type: str, current_text: str, instructions: str, sections: dict) -> dict[str, Any]:
    context = format_cv_context(sections)
    user_content = f"Current text:\n{current_text}\n\n" + (
        f"Instructions: {instructions}" if instructions else "Improve this."
    )
    return _generate(system=section_rewrite_system_prompt(section_type, context), user_content=user_content)


def generate_cover_letter(*, job_description: str, company_name: str, job_title: str, sections: dict) -> dict[str, Any]:
    context = format_cv_context(sections)
    header = f"Job title: {job_title}\n" if job_title else ""
    header += f"Company: {company_name}\n" if company_name else ""
    user_content = f"{header}Job description:\n{job_description}"
    return _generate(system=cover_letter_system_prompt(context), user_content=user_content)
