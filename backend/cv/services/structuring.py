import json
import logging
from typing import Any

from core.models import ModelPreference
from core.services.providers import ProviderError, get_provider
from cv.prompts import structure_system_prompt
from cv.schema import empty_sections, normalize_sections

logger = logging.getLogger("cv.services.structuring")


def structure_cv(raw_text: str, hyperlinks: list[dict] | None = None) -> dict[str, Any]:
    """Never-crash contract, matching linkedin/services/generation.py::_generate.

    On a provider failure, or on the model returning JSON that doesn't parse,
    falls back to a minimal sections dict carrying the raw text as the
    summary — a degraded-but-usable result rather than a hard failure, same
    "fall back and log" discipline as the mood-tag JSON contract in
    persona.py.

    `hyperlinks` (from cv.services.parsing.extract_hyperlinks) is a list of
    {label, url} pairs recovered from the PDF's link annotations — plain
    text extraction alone only ever sees the visible label ("LinkedIn"),
    never the actual href, so without this the model has no way to fill in
    a real URL and would either invent one or leave the label in its place.
    """
    user_content = raw_text
    if hyperlinks:
        links_block = "\n".join(f"- {link['label']} -> {link['url']}" for link in hyperlinks)
        user_content = f"{raw_text}\n\nLinks found in the PDF (label -> actual URL):\n{links_block}"

    pref = ModelPreference.current()
    try:
        provider = get_provider(pref.provider)
        text = provider.generate_text(
            model=pref.model,
            system=structure_system_prompt(),
            history=[{"role": "user", "content": user_content}],
            max_tokens=max(pref.max_tokens, 4000),
            temperature=0.2,
        )
    except ProviderError as exc:
        logger.error("%s provider call failed structuring CV: %s", pref.provider, exc)
        return _fallback(raw_text, error=True, reason="provider")
    except Exception as exc:
        logger.error("CV structuring failed: %s", exc)
        return _fallback(raw_text, error=True, reason="unknown")

    try:
        parsed = json.loads(_extract_json_object(text))
    except json.JSONDecodeError as exc:
        logger.error("CV structuring returned invalid JSON: %s", exc)
        return _fallback(raw_text, error=False, reason=None)

    if not isinstance(parsed, dict):
        # Valid JSON but not an object (e.g. the model returned a bare list)
        # — normalize_sections() would silently coerce this to an all-empty
        # CV, discarding raw_text entirely. Fall back the same way an
        # unparseable response does, so the user still gets their text back.
        logger.error("CV structuring returned valid but non-object JSON: %r", type(parsed))
        return _fallback(raw_text, error=False, reason=None)

    return {"sections": normalize_sections(parsed), "error": False, "reason": None}


def _extract_json_object(text: str) -> str:
    """Strips a markdown code fence if present, then narrows to the outermost
    {...} span — covers models that add stray commentary before/after the
    JSON despite being told not to (the prompt says "no commentary", but
    that's not a guarantee)."""
    stripped = text.strip()
    if stripped.startswith("```"):
        stripped = stripped.strip("`")
        if stripped.lower().startswith("json"):
            stripped = stripped[4:]
        stripped = stripped.strip()
    start, end = stripped.find("{"), stripped.rfind("}")
    if start != -1 and end != -1 and end > start:
        return stripped[start : end + 1]
    return stripped


def _fallback(raw_text: str, *, error: bool, reason: str | None) -> dict[str, Any]:
    sections = empty_sections()
    sections["summary"] = raw_text[:2000]
    return {"sections": sections, "error": error, "reason": reason}
