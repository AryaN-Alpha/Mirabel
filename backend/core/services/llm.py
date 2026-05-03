import json
import logging
import os
from typing import Any

import anthropic
from django.conf import settings
from tenacity import retry, stop_after_attempt, wait_exponential

from core.prompts.persona import ALLOWED_MOODS, MIRABEL_SYSTEM_PROMPT
from memory.services.retrieval import format_memories_for_prompt, retrieve_relevant_memories

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
def _call_api(model: str, system: str, history: list[dict]) -> str:
    response = _get_client().messages.create(
        model=model,
        system=system,
        messages=history,
        max_tokens=400,
    )
    return response.content[0].text


def generate_reply(*, history: list[dict], user_label: str) -> dict[str, Any]:
    """
    Call the Anthropic API with RAG-augmented system prompt.
    Returns a validated {text, mood, memories_used} dict.
    Falls back gracefully on any error.
    """
    model = getattr(settings, "ANTHROPIC_MODEL", "claude-sonnet-4-6")

    # Latest user message is the retrieval query.
    latest_user_msg = next(
        (m["content"] for m in reversed(history) if m["role"] == "user"), ""
    )
    memories = retrieve_relevant_memories(
        user_label=user_label, query_text=latest_user_msg
    )
    memory_block = format_memories_for_prompt(memories)

    system = MIRABEL_SYSTEM_PROMPT
    if memory_block:
        system = f"{system}\n\n{memory_block}"

    try:
        raw = _call_api(model, system, history)
    except Exception as exc:
        logger.error("Anthropic API call failed after retries: %s", exc)
        return {"text": "...", "mood": "neutral", "memories_used": 0}

    try:
        data = json.loads(raw)
        text = str(data["text"])
        mood = str(data["mood"]).lower()
        if mood not in ALLOWED_MOODS:
            logger.warning("Invalid mood tag %r from LLM, falling back to neutral", mood)
            mood = "neutral"
        return {"text": text, "mood": mood, "memories_used": len(memories)}
    except (json.JSONDecodeError, KeyError, TypeError) as exc:
        logger.warning("LLM JSON parse failure (%s). Raw: %r", exc, raw[:200])
        return {"text": raw, "mood": "neutral", "memories_used": len(memories)}
