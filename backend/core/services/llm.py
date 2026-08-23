import json
import logging
import re
from typing import Any

from core.models import ModelPreference
from core.prompts.persona import ALLOWED_MOODS, MIRABEL_SYSTEM_PROMPT
from core.services.providers import ProviderError, get_provider
from memory.services.retrieval import format_memories_for_prompt, retrieve_relevant_memories

logger = logging.getLogger("core.services.llm")


def generate_reply(*, history: list[dict]) -> dict[str, Any]:
    """
    Call the configured LLM provider with RAG-augmented system prompt.
    Returns a validated {text, mood, memories_used} dict.
    Falls back gracefully on any error.
    """
    pref = ModelPreference.current()

    # Latest user message is the retrieval query.
    latest_user_msg = next(
        (m["content"] for m in reversed(history) if m["role"] == "user"), ""
    )
    memories = retrieve_relevant_memories(query_text=latest_user_msg)
    memory_block = format_memories_for_prompt(memories)

    system = MIRABEL_SYSTEM_PROMPT
    if memory_block:
        system = f"{system}\n\n{memory_block}"

    try:
        provider = get_provider(pref.provider)
        raw = provider.generate_text(
            model=pref.model,
            system=system,
            history=history,
            max_tokens=pref.max_tokens,
            temperature=pref.temperature,
        )
    except ProviderError as exc:
        logger.error("%s provider call failed: %s", pref.provider, exc)
        return {"text": "...", "mood": "neutral", "memories_used": 0, "error": True, "reason": "provider"}
    except Exception as exc:
        logger.error("LLM call failed after retries: %s", exc)
        return {"text": "...", "mood": "neutral", "memories_used": 0, "error": True, "reason": "unknown"}

    raw = raw.strip()
    if raw.startswith("```json"):
        raw = raw[7:]
    elif raw.startswith("```"):
        raw = raw[3:]
    if raw.endswith("```"):
        raw = raw[:-3]
    raw = raw.strip()

    try:
        data = json.loads(raw)
        text = str(data["text"])
        mood = str(data["mood"]).lower()
        if mood not in ALLOWED_MOODS:
            logger.warning("Invalid mood tag %r from LLM, falling back to neutral", mood)
            mood = "neutral"
        return {"text": text, "mood": mood, "memories_used": len(memories), "error": False}
    except (json.JSONDecodeError, KeyError, TypeError) as exc:
        logger.warning("LLM JSON parse failure (%s). Raw: %r", exc, raw[:200])
        
        text = raw
        # Try to rescue truncated JSON using regex
        match = re.search(r'"text"\s*:\s*"((?:[^"\\]|\\.)*)', raw)
        if match:
            text = match.group(1)
            text = text.replace('\\"', '"').replace('\\n', '\n').replace('\\\\', '\\')
            
        return {"text": text, "mood": "neutral", "memories_used": len(memories), "error": False}
