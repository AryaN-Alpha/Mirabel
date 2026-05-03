import json
import logging
import os

import anthropic
from tenacity import retry, stop_after_attempt, wait_exponential

from core.prompts.persona import ALLOWED_MOODS, MIRABEL_SYSTEM_PROMPT

logger = logging.getLogger("core.services.llm")

_client: anthropic.Anthropic | None = None


def _get_client() -> anthropic.Anthropic:
    global _client
    if _client is None:
        _client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    return _client


@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=1, max=8),
)
def _call_api(model: str, history: list[dict]) -> str:
    response = _get_client().messages.create(
        model=model,
        system=MIRABEL_SYSTEM_PROMPT,
        messages=history,
        max_tokens=400,
    )
    return response.content[0].text


def generate_reply(history: list[dict]) -> dict:
    """Call the Anthropic API and return a validated {text, mood} dict."""
    from django.conf import settings

    model = getattr(settings, "ANTHROPIC_MODEL", "claude-sonnet-4-6")

    try:
        raw = _call_api(model, history)
    except Exception as exc:
        logger.error("Anthropic API call failed after retries: %s", exc)
        return {"text": "...", "mood": "neutral"}

    try:
        data = json.loads(raw)
        text = str(data["text"])
        mood = str(data["mood"]).lower()
        if mood not in ALLOWED_MOODS:
            logger.warning("Invalid mood tag %r from LLM, falling back to neutral", mood)
            mood = "neutral"
        return {"text": text, "mood": mood}
    except (json.JSONDecodeError, KeyError, TypeError) as exc:
        logger.warning("LLM JSON parse failure (%s). Raw: %r", exc, raw)
        return {"text": raw, "mood": "neutral"}
