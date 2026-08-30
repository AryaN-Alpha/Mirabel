import json
import logging
from typing import Any

from core.models import ModelPreference
from core.services.providers import ProviderError, get_provider
from cv.prompts import consistency_check_system_prompt
from cv.services.generation import format_cv_context
from cv.services.json_utils import extract_json_object

logger = logging.getLogger("cv.services.consistency")

_VALID_SECTION_TYPES = {"experience", "education", "projects", "certifications", "summary", "strengths"}
_VALID_SEVERITIES = {"low", "medium", "high"}


def _fallback(*, error: bool, reason: str | None) -> dict[str, Any]:
    return {"issues": [], "error": error, "reason": reason}


def _normalize_result(parsed: dict) -> dict[str, Any]:
    issues = [
        {
            "section_type": issue.get("section_type"),
            "message": str(issue.get("message", "")),
            "severity": issue.get("severity") if issue.get("severity") in _VALID_SEVERITIES else "medium",
        }
        for issue in parsed.get("issues", [])
        if isinstance(issue, dict) and issue.get("section_type") in _VALID_SECTION_TYPES and issue.get("message")
    ][:20]
    return {"issues": issues, "error": False, "reason": None}


def check_cv_consistency(sections: dict) -> dict[str, Any]:
    """Never-crash contract, same shape as cv.services.tailoring.tailor_cv_to_job."""
    context = format_cv_context(sections)
    pref = ModelPreference.current()
    try:
        provider = get_provider(pref.provider)
        text = provider.generate_text(
            model=pref.model,
            system=consistency_check_system_prompt(context),
            history=[{"role": "user", "content": "Check this CV for tense/tone/grammar consistency."}],
            max_tokens=max(pref.max_tokens, 1000),
            temperature=0.2,
            call_site="cv.consistency_check",
        )
    except ProviderError as exc:
        logger.error("%s provider call failed checking CV consistency: %s", pref.provider, exc)
        return _fallback(error=True, reason="provider")
    except Exception as exc:
        logger.error("CV consistency check failed: %s", exc)
        return _fallback(error=True, reason="unknown")

    try:
        parsed = json.loads(extract_json_object(text))
    except json.JSONDecodeError as exc:
        logger.error("CV consistency check returned invalid JSON: %s", exc)
        return _fallback(error=False, reason=None)

    if not isinstance(parsed, dict):
        logger.error("CV consistency check returned valid but non-object JSON: %r", type(parsed))
        return _fallback(error=False, reason=None)

    return _normalize_result(parsed)
