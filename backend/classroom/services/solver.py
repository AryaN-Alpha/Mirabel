import logging
from typing import Any

from core.models import ModelPreference
from core.services.providers import ProviderError, get_provider

from classroom.prompts import solver_system_prompt

logger = logging.getLogger("classroom.services.solver")


def _generate(*, system: str, user_content: str) -> dict[str, Any]:
    """Never-crash contract, matching linkedin.services.generation._generate /
    outlook.services.email_ai._generate."""
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
        logger.error("Classroom solve failed: %s", exc)
        return {"text": "", "error": True, "reason": "unknown"}


def solve_coursework(
    *, coursework: dict, course_name: str, attachment_text: str
) -> dict[str, Any]:
    """Pure generation, no DB/HTTP side effects — the caller (views.solve_view)
    is responsible for creating the ClassroomSubmissionDraft row."""
    title = coursework.get("title", "")
    description = coursework.get("description", "")
    work_type = coursework.get("workType", "ASSIGNMENT")

    parts = [f"Title: {title}"]
    if description:
        parts.append(f"Description:\n{description}")
    if attachment_text:
        parts.append(f"Attached document text:\n{attachment_text}")
    user_content = "\n\n".join(parts)

    system = solver_system_prompt(work_type=work_type, course_name=course_name)
    return _generate(system=system, user_content=user_content)
