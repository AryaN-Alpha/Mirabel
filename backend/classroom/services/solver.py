import logging
from typing import Any

from core.models import ModelPreference
from core.services.providers import ProviderError, get_provider
from core.services.text_utils import truncate_chars

from classroom.prompts import solver_system_prompt

logger = logging.getLogger("classroom.services.solver")

# Caps on unbounded user-provided content (pasted attachment text, long
# assignment descriptions) — these previously went into the prompt with no
# limit at all.
_MAX_DESCRIPTION_CHARS = 6000
_MAX_ATTACHMENT_CHARS = 6000


def _generate(*, system: str, user_content: str, call_site: str) -> dict[str, Any]:
    """Never-crash contract, matching linkedin.services.generation._generate /
    outlook.services.email_ai._generate.

    Deliberately does NOT switch to each provider's fast/non-reasoning model
    the way core/services/providers/model_select.py's other callers do:
    solving actual coursework is exactly the kind of task that benefits from
    a reasoning-tier model's chain-of-thought, unlike short-form drafting or
    JSON structuring. Instead this raises the max_tokens floor (same idea as
    cv/services/tailoring.py's floor, applied for the opposite reason — here
    to give real reasoning room to finish, not to avoid it) so that budget
    isn't silently exhausted mid-thought before any visible answer comes out."""
    pref = ModelPreference.current()
    try:
        provider = get_provider(pref.provider)
        text = provider.generate_text(
            model=pref.model,
            system=system,
            history=[{"role": "user", "content": user_content}],
            max_tokens=max(pref.max_tokens, 6000),
            temperature=pref.temperature,
            call_site=call_site,
        )
        return {"text": text.strip(), "error": False, "reason": None}
    except ProviderError as exc:
        logger.error("%s provider call failed: %s", pref.provider, exc)
        return {"text": "", "error": True, "reason": "provider"}
    except Exception as exc:
        logger.error("Classroom solve failed: %s", exc)
        return {"text": "", "error": True, "reason": "unknown"}


def solve_coursework(
    *,
    coursework: dict,
    course_name: str,
    attachment_text: str,
    extra_instructions: str = "",
) -> dict[str, Any]:
    """Pure generation, no DB/HTTP side effects — the caller (views.solve_view)
    is responsible for creating the ClassroomSubmissionDraft row."""
    title = coursework.get("title", "")
    description = coursework.get("description", "")
    work_type = coursework.get("workType", "ASSIGNMENT")

    parts = [f"Title: {title}"]
    if description:
        description = truncate_chars(
            description, _MAX_DESCRIPTION_CHARS, label="assignment description", call_site="classroom.solve"
        )
        parts.append(f"Description:\n{description}")
    if attachment_text:
        attachment_text = truncate_chars(
            attachment_text, _MAX_ATTACHMENT_CHARS, label="attachment", call_site="classroom.solve"
        )
        parts.append(f"Attached document text:\n{attachment_text}")
    if extra_instructions:
        parts.append(f"Additional instructions from the student:\n{extra_instructions}")
    user_content = "\n\n".join(parts)

    system = solver_system_prompt(work_type=work_type, course_name=course_name)
    return _generate(system=system, user_content=user_content, call_site="classroom.solve_coursework")
