"""
Semantic contradiction/supersession for kind="fact" memories — the piece
memory/services/dedup.py's docstring explicitly deferred ("does NOT attempt
semantic contradiction/supersession... requires an LLM judgment call...
out of scope here").

Two-stage, cost-bounded: a free Chroma similarity query first, then an LLM
judgment call ONLY for candidates above
settings.MEMORY_FACT_SUPERSESSION_SIMILARITY_THRESHOLD — deliberately below
dedup's 0.97 near-dup bar, since this is catching "related, possibly
conflicting" facts, not near-identical text. Fails open (returns None, i.e.
"not superseded") on any error, matching dedup.py's discipline exactly.

The judgment call routes through core.services.providers.get_provider(
ModelPreference.current().provider) rather than a hand-rolled Anthropic
client, for the same reason as memory/services/facts.py — a hardcoded
Anthropic client silently disabled this for non-Anthropic users.
"""

from __future__ import annotations

import json
import logging
from typing import Any

from django.conf import settings

from core.models import ModelPreference
from core.services.providers import ProviderError, get_provider
from core.services.providers.model_select import fast_model_for
from memory.services.chroma_client import query_memories

logger = logging.getLogger(__name__)

SUPERSESSION_SYSTEM_PROMPT = """\
You judge whether a NEW fact about a user supersedes (contradicts/replaces) \
an OLD fact about the same user, versus both being simultaneously true \
(e.g. "likes coffee" and "likes tea" can both be true; "works at Acme" and \
"works at Globex" cannot).

Output strict JSON only: {"supersedes": true or false}
"""


def find_superseded_fact(new_text: str, fact_type: str) -> dict[str, Any] | None:
    """Returns the full existing hit dict ({id, text, metadata, similarity})
    for the active fact that `new_text` supersedes, or None if nothing is
    superseded. Callers need the FULL metadata dict (not just the id) because
    Chroma's upsert overwrites metadata wholesale rather than merging it —
    see memory/tasks.py::extract_and_supersede_facts."""
    try:
        hits = query_memories(
            query_text=new_text,
            n_results=1,
            # Chroma requires a `where` dict to have exactly ONE top-level
            # key — multiple conditions must be wrapped in "$and" (same
            # pattern memory/views.py::_build_where already uses). A flat
            # multi-key dict here raises ValueError on every call, which the
            # except below silently swallows — this was a real bug that
            # made supersession completely inert until caught by review.
            where={
                "$and": [
                    {"kind": "fact"},
                    {"status": "active"},
                    {"fact_type": fact_type},
                ]
            },
        )
    except Exception:
        logger.debug("find_superseded_fact: query failed, assuming no supersession", exc_info=True)
        return None

    if not hits:
        return None
    candidate = hits[0]
    if candidate["similarity"] < settings.MEMORY_FACT_SUPERSESSION_SIMILARITY_THRESHOLD:
        return None

    pref = ModelPreference.current()
    try:
        provider = get_provider(pref.provider)
        raw = provider.generate_text(
            # fast_model_for(pref) — see core/services/providers/model_select.py.
            # This is a single-boolean JSON judgment on a 50-token budget, the
            # tightest in the app — on a reasoning-tier model, hidden
            # chain-of-thought alone can exceed the budget, truncating raw
            # before it ever parses. That failure is invisible: the broad
            # except Exception below (added for a prior, unrelated bug) just
            # returns None, "assuming no supersession."
            model=fast_model_for(pref),
            system=SUPERSESSION_SYSTEM_PROMPT,
            history=[
                {
                    "role": "user",
                    "content": f'OLD fact: "{candidate["text"]}"\nNEW fact: "{new_text}"',
                }
            ],
            max_tokens=50,
            temperature=0.0,
            call_site="memory.fact_supersession_check",
        ).strip()
        parsed = json.loads(raw)
        if bool(parsed.get("supersedes")):
            return candidate
        return None
    except ProviderError as exc:
        logger.debug("find_superseded_fact: %s provider call failed: %s", pref.provider, exc)
        return None
    except Exception:
        logger.debug("find_superseded_fact: judgment call failed, assuming no supersession", exc_info=True)
        return None
