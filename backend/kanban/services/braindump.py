import json
import logging
from datetime import date
from typing import Any

from core.models import ModelPreference
from core.services.providers import ProviderError, get_provider
from kanban.prompts import braindump_system_prompt

logger = logging.getLogger("kanban.services.braindump")

_ALLOWED_PRIORITY = {"High", "Medium", "Low"}
_ALLOWED_EFFORT = {"High", "Medium", "Low"}
_MAX_TITLE_LENGTH = 200


def _strip_code_fence(raw: str) -> str:
    raw = raw.strip()
    if raw.startswith("```json"):
        raw = raw[7:]
    elif raw.startswith("```"):
        raw = raw[3:]
    if raw.endswith("```"):
        raw = raw[:-3]
    return raw.strip()


def _coerce_due_date(value: Any) -> str | None:
    if not value:
        return None
    try:
        return date.fromisoformat(str(value)).isoformat()
    except ValueError:
        return None


def _coerce_task(item: dict) -> dict[str, Any] | None:
    title = str(item.get("title") or "").strip()
    if not title:
        return None

    priority = item.get("priority")
    if priority not in _ALLOWED_PRIORITY:
        priority = "Medium"

    effort = item.get("effort")
    if effort not in _ALLOWED_EFFORT:
        effort = "Medium"

    return {
        "title": title[:_MAX_TITLE_LENGTH],
        "description_markdown": str(item.get("description_markdown") or ""),
        "priority": priority,
        "effort": effort,
        "due_date": _coerce_due_date(item.get("due_date")),
        "original_transcript_snippet": str(item.get("original_transcript_snippet") or ""),
    }


def process_braindump(transcript: str) -> dict[str, Any]:
    """Never-crash contract, matching outlook/services/email_ai.py::_generate.

    Returns proposed task dicts WITHOUT persisting them — the frontend shows
    them for review and creates the accepted ones through the same
    POST /api/tasks/ endpoint a manually-typed card goes through.
    """
    pref = ModelPreference.current()
    system = braindump_system_prompt(date.today().isoformat())

    try:
        provider = get_provider(pref.provider)
        raw = provider.generate_text(
            model=pref.model,
            system=system,
            history=[{"role": "user", "content": transcript}],
            max_tokens=pref.max_tokens,
            temperature=pref.temperature,
        )
    except ProviderError as exc:
        logger.error("%s provider call failed: %s", pref.provider, exc)
        return {"tasks": [], "error": True, "reason": "provider"}
    except Exception as exc:
        logger.error("Brain dump processing failed: %s", exc)
        return {"tasks": [], "error": True, "reason": "unknown"}

    raw = _strip_code_fence(raw)
    try:
        data = json.loads(raw)
        items = data["tasks"]
        if not isinstance(items, list):
            raise TypeError("tasks is not a list")
    except (json.JSONDecodeError, KeyError, TypeError) as exc:
        logger.warning("Brain dump JSON parse failure (%s). Raw: %r", exc, raw[:300])
        return {"tasks": [], "error": True, "reason": "unknown"}

    tasks = [t for t in (_coerce_task(item) for item in items if isinstance(item, dict)) if t]
    return {"tasks": tasks, "error": False, "reason": None}
