import json
import logging
from typing import Any

from core.models import ModelPreference
from core.services.providers import ProviderError, get_provider
from cv.prompts import job_tailor_system_prompt
from cv.services.generation import format_cv_context
from cv.services.json_utils import extract_json_object

logger = logging.getLogger("cv.services.tailoring")

_VALID_SECTION_TYPES = {"experience", "education", "projects", "certifications", "summary", "strengths"}


def _fallback(*, error: bool, reason: str | None) -> dict[str, Any]:
    return {"match_score": None, "missing_keywords": [], "suggestions": [], "error": error, "reason": reason}


def _normalize_result(parsed: dict) -> dict[str, Any]:
    match_score = parsed.get("match_score")
    if not isinstance(match_score, (int, float)) or not (0 <= match_score <= 100):
        match_score = None
    missing_keywords = [str(k) for k in parsed.get("missing_keywords", []) if isinstance(k, (str, int, float))][:20]
    suggestions = [
        {"section_type": s.get("section_type"), "note": str(s.get("note", ""))}
        for s in parsed.get("suggestions", [])
        if isinstance(s, dict) and s.get("section_type") in _VALID_SECTION_TYPES and s.get("note")
    ][:10]
    return {
        "match_score": match_score,
        "missing_keywords": missing_keywords,
        "suggestions": suggestions,
        "error": False,
        "reason": None,
    }


def tailor_cv_to_job(sections: dict, job_description: str) -> dict[str, Any]:
    """Never-crash contract, matching cv.services.structuring.structure_cv's
    shape: provider call -> JSON parse -> normalize, falling back to an
    empty-but-valid result (never raises) at any failure point."""
    context = format_cv_context(sections)
    pref = ModelPreference.current()
    try:
        provider = get_provider(pref.provider)
        text = provider.generate_text(
            model=pref.model,
            system=job_tailor_system_prompt(context),
            history=[{"role": "user", "content": job_description}],
            max_tokens=max(pref.max_tokens, 1000),
            temperature=0.3,
        )
    except ProviderError as exc:
        logger.error("%s provider call failed tailoring CV: %s", pref.provider, exc)
        return _fallback(error=True, reason="provider")
    except Exception as exc:
        logger.error("CV tailoring failed: %s", exc)
        return _fallback(error=True, reason="unknown")

    try:
        parsed = json.loads(extract_json_object(text))
    except json.JSONDecodeError as exc:
        logger.error("CV tailoring returned invalid JSON: %s", exc)
        return _fallback(error=False, reason=None)

    if not isinstance(parsed, dict):
        logger.error("CV tailoring returned valid but non-object JSON: %r", type(parsed))
        return _fallback(error=False, reason=None)

    return _normalize_result(parsed)
