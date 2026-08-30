"""
Fact extraction — pulls durable, typed claims about the user out of a
high-salience user message ("I work at Acme now" -> a "biographical" fact).

This is new LLM spend, not waste removal (unlike most of the rest of the
memory-tuning pipeline), so it is deliberately gated twice before ever
calling out: memory/tasks.py checks salience against
settings.MEMORY_FACT_EXTRACTION_SALIENCE_MIN, AND _has_extractable_signal
below — salience alone is a weak proxy for "contains a fact" (a purely
emotional, factless message can clear a high salience score on mood/length
alone with zero disclosure or entity content).

Routes through core.services.providers.get_provider(ModelPreference.current()
.provider) — the same multi-provider path every other generation call in
this app uses — rather than a hand-rolled Anthropic client. An earlier
version of this file hardcoded anthropic.Anthropic directly; that silently
disabled fact extraction for any user whose ModelPreference pointed at a
different provider (e.g. DeepSeek) and had no Anthropic key configured, with
no error surfaced anywhere above DEBUG-level logging — found in review.
Going through get_provider also picks up its retry-on-transient-error
behavior and telemetry logging for free instead of duplicating both by hand.
Never raises.
"""

from __future__ import annotations

import json
import logging
from typing import Any

from core.models import ModelPreference
from core.services.providers import ProviderError, get_provider
from memory.services.salience import DISCLOSURE_MARKERS, PROPER_NOUN_RX

logger = logging.getLogger(__name__)

ALLOWED_FACT_TYPES = frozenset(
    ["preference", "biographical", "relationship", "goal", "constraint", "other"]
)

FACT_EXTRACTION_SYSTEM_PROMPT = """\
You extract durable facts about the USER from a single message they sent to \
Mirabel, their voice assistant. A fact is a claim likely to still be true \
weeks from now (a job, a relationship, a preference, a goal, a constraint) \
— NOT a fleeting feeling or one-off event.

Output strict JSON only:
{"facts": [{"text": "<short third-person statement of the fact>", "fact_type": "<one of preference|biographical|relationship|goal|constraint|other>"}]}

Rules:
- If the message contains no durable fact, return {"facts": []}.
- Keep each fact text short (one sentence) and self-contained (don't say "the user" repeatedly, just state it: "Works at Acme as a backend engineer").
- Do not invent facts not stated or strongly implied by the message.
"""


def has_extractable_signal(text: str) -> bool:
    """Cheap, free, deterministic pre-filter: does this text even look like
    it might contain a fact worth an LLM call? Reuses salience.py's existing
    disclosure-marker and proper-noun signals rather than duplicating them."""
    lower = text.lower()
    if any(marker in lower for marker in DISCLOSURE_MARKERS):
        return True
    return bool(PROPER_NOUN_RX.search(text))


def extract_facts(text: str) -> list[dict[str, Any]]:
    """Returns a list of {"text": str, "fact_type": str} dicts, or [] on any
    failure (unparseable JSON, provider error, no key configured) — never
    raises, matching memory/services/dedup.py's fail-safe discipline."""
    pref = ModelPreference.current()
    try:
        provider = get_provider(pref.provider)
        raw = provider.generate_text(
            model=pref.model,
            system=FACT_EXTRACTION_SYSTEM_PROMPT,
            history=[{"role": "user", "content": text}],
            max_tokens=300,
            temperature=0.2,
            call_site="memory.fact_extraction",
        ).strip()
    except ProviderError as exc:
        logger.debug("extract_facts: %s provider call failed: %s", pref.provider, exc)
        return []
    except Exception:
        logger.exception("extract_facts: LLM call failed")
        return []

    try:
        parsed = json.loads(raw)
        facts = parsed["facts"]
    except (json.JSONDecodeError, KeyError, TypeError, IndexError):
        logger.warning("extract_facts: JSON parse failed, raw=%r", raw[:200])
        return []

    out: list[dict[str, Any]] = []
    for fact in facts:
        try:
            fact_text = str(fact["text"]).strip()
        except (KeyError, TypeError):
            continue
        if not fact_text:
            continue
        fact_type = str(fact.get("fact_type", "other")).lower()
        if fact_type not in ALLOWED_FACT_TYPES:
            fact_type = "other"
        out.append({"text": fact_text, "fact_type": fact_type})
    return out
