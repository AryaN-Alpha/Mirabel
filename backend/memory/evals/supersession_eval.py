"""Supersession-judgment accuracy eval — requires a live Anthropic API key
AND a live Chroma. Spends real tokens (one judgment call per case above the
similarity threshold), so this is opt-in only, never part of the default
`run_evals` suite selection. Cleans up seeded rows on any exit path."""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from core.evals.base import EvalResult, Mismatch
from core.services.providers.credentials import get_api_key
from memory.evals.cases import SUPERSESSION_CASES
from memory.services.chroma_client import add_memory, delete_memories, get_collection
from memory.services.supersession import find_superseded_fact

logger = logging.getLogger(__name__)

_ID_PREFIX = "eval_supersession_"


def run() -> EvalResult:
    result = EvalResult(suite="supersession", note="spends real Anthropic tokens")

    if not get_api_key("anthropic"):
        result.skipped_reason = "no anthropic API key configured"
        return result
    try:
        get_collection()
    except Exception as exc:
        result.skipped_reason = f"chroma unavailable: {exc}"
        return result

    seeded_ids: list[str] = []
    try:
        now_iso = datetime.now(timezone.utc).isoformat()
        for i, (old_text, new_text, fact_type, expected) in enumerate(SUPERSESSION_CASES):
            chroma_id = f"{_ID_PREFIX}{i}"
            seeded_ids.append(chroma_id)
            add_memory(
                memory_id=chroma_id,
                text=old_text,
                metadata={
                    "kind": "fact",
                    "status": "active",
                    "fact_type": fact_type,
                    "role": "user",
                    "mood": "neutral",
                    "salience": 0.75,
                    "created_at": now_iso,
                },
            )

            result.total += 1
            hit = find_superseded_fact(new_text, fact_type)
            actual = hit is not None
            if actual == expected:
                result.correct += 1
            else:
                result.mismatches.append(
                    Mismatch(input=f"{old_text!r} -> {new_text!r}", expected=expected, actual=actual)
                )
    except Exception as exc:
        logger.exception("supersession_eval: run failed mid-way")
        result.skipped_reason = f"error mid-run: {exc}"
    finally:
        delete_memories(seeded_ids)

    return result
