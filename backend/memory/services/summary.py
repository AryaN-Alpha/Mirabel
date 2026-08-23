"""
Asks the LLM to compress a week of conversation into a relationship-state
paragraph. Becomes a high-salience "summary" memory — Mirabel's long-term
sense of how things are going with the user.
"""

import json
import logging
from collections import Counter
from datetime import datetime
from typing import Any

import anthropic
from django.conf import settings

from core.models import Message
from core.services.providers.credentials import get_api_key

logger = logging.getLogger(__name__)

SUMMARY_SYSTEM_PROMPT = """\
You are Mirabel's introspective inner voice — NOT Mirabel speaking to the user.
You read a week of conversation between Mirabel and her user and produce a
compact emotional state summary written from Mirabel's first-person perspective.

Output strict JSON only:
{"summary": "<2-4 sentences, first person>"}

Style:
- Mention specific events the user shared (work, sleep, relationships, hobbies).
- Note the emotional arc — were they stressed? happy? distant?
- Keep Mirabel's tsundere voice but more reflective, less performative.
- Do NOT address the user directly. This is private internal monologue.
"""


def build_weekly_summary(
    *, period_start: datetime, period_end: datetime
) -> dict[str, Any] | None:
    qs = (
        Message.objects.filter(
            created_at__gte=period_start,
            created_at__lt=period_end,
        )
        .order_by("created_at")
        .values("role", "text", "mood")
    )
    messages = list(qs)
    if len(messages) < 4:
        return None

    lines = [f"[{m['role']} | {m['mood'] or 'neutral'}] {m['text']}" for m in messages]
    transcript = "\n".join(lines)[:12000]

    dominant_moods = [
        mood
        for mood, _ in Counter(
            (m["mood"] or "neutral") for m in messages if m["role"] == "assistant"
        ).most_common(3)
    ]

    client = anthropic.Anthropic(api_key=get_api_key("anthropic") or None)
    resp = client.messages.create(
        model=settings.ANTHROPIC_MODEL,
        max_tokens=400,
        system=SUMMARY_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": transcript}],
    )
    raw = resp.content[0].text.strip()
    try:
        parsed = json.loads(raw)
        summary_text = parsed["summary"]
    except (json.JSONDecodeError, KeyError):
        logger.warning("weekly_summary: JSON parse failed, using raw")
        summary_text = raw[:600]

    return {
        "summary_text": summary_text,
        "dominant_moods": dominant_moods,
        "message_count": len(messages),
    }
