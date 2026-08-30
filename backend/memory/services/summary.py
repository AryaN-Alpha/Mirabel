"""
Asks the LLM to compress a week of conversation into a relationship-state
paragraph. Becomes a high-salience "summary" memory — Mirabel's long-term
sense of how things are going with the user.

Routes through core.services.providers.get_provider(ModelPreference.current()
.provider) rather than a hand-rolled Anthropic client (see
memory/services/facts.py's docstring for why — a hardcoded client silently
skips the weekly summary for any non-Anthropic ModelPreference). Unlike
facts.py/supersession.py, a provider failure here is deliberately left to
propagate rather than caught — memory.tasks.run_weekly_summary is a Celery
task with autoretry_for=(Exception,), so letting it raise gets a real retry
instead of a silently-skipped week.
"""

import json
import logging
from collections import Counter
from datetime import datetime
from typing import Any

from core.models import Message, ModelPreference
from core.services.providers import get_provider
from core.services.text_utils import truncate_chars

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
    transcript = truncate_chars(
        "\n".join(lines), 12000, label="weekly transcript", call_site="memory.weekly_summary"
    )

    dominant_moods = [
        mood
        for mood, _ in Counter(
            (m["mood"] or "neutral") for m in messages if m["role"] == "assistant"
        ).most_common(3)
    ]

    pref = ModelPreference.current()
    provider = get_provider(pref.provider)
    raw = provider.generate_text(
        model=pref.model,
        system=SUMMARY_SYSTEM_PROMPT,
        history=[{"role": "user", "content": transcript}],
        max_tokens=400,
        temperature=0.7,
        call_site="memory.weekly_summary",
    ).strip()
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
