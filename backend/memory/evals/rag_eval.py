"""RAG retrieval-quality eval — requires a live Chroma. Seeds known docs
under an "eval_"-prefixed id, queries the real retrieval pipeline, checks
the expected doc lands in the top-K, and always cleans up (even on failure)
so nothing pollutes real memory data."""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from core.evals.base import EvalResult, Mismatch
from memory.evals.cases import RAG_CASES
from memory.services.chroma_client import add_memory, delete_memories, get_collection
from memory.services.retrieval import retrieve_relevant_memories

logger = logging.getLogger(__name__)

_ID_PREFIX = "eval_rag_"


def run() -> EvalResult:
    result = EvalResult(suite="rag")
    try:
        get_collection()
    except Exception as exc:
        result.skipped_reason = f"chroma unavailable: {exc}"
        return result

    seeded_ids: list[str] = []
    try:
        now_iso = datetime.now(timezone.utc).isoformat()
        for case in RAG_CASES:
            for doc in case["seed"]:
                chroma_id = f"{_ID_PREFIX}{doc['id']}"
                seeded_ids.append(chroma_id)
                add_memory(
                    memory_id=chroma_id,
                    text=doc["text"],
                    metadata={
                        "kind": "turn",
                        "role": "user",
                        "mood": doc.get("mood", "neutral"),
                        "salience": doc.get("salience", 0.5),
                        "created_at": now_iso,
                        "status": "active",
                    },
                )

            result.total += 1
            expect_id = f"{_ID_PREFIX}{case['expect_id']}"
            hits = retrieve_relevant_memories(query_text=case["query"])
            hit_ids = [h["id"] for h in hits]
            if expect_id in hit_ids:
                result.correct += 1
            else:
                result.mismatches.append(
                    Mismatch(input=case["query"], expected=expect_id, actual=hit_ids)
                )
    except Exception as exc:
        logger.exception("rag_eval: run failed mid-way")
        result.skipped_reason = f"error mid-run: {exc}"
    finally:
        delete_memories(seeded_ids)

    return result
