"""Free, deterministic, zero-I/O — always runnable, no external dependency.
Covers core/services/text_utils.py's select_relevant_sentences and
encode_compact_list: the correctness bar is "does required content survive"
and "does the CSV encoder round-trip correctly," not an LLM-judged
groundedness score (which would itself add cost — out of scope until a
gated semantic-compression pass is actually justified by evidence)."""

from __future__ import annotations

import csv
import io
import json

from core.evals.base import EvalResult, Mismatch
from core.evals.cases import COMPACT_LIST_CASES, EXTRACTION_CASES, SMALL_COMPACT_LIST_CASES
from core.services.text_utils import encode_compact_list, select_relevant_sentences


def run() -> EvalResult:
    result = EvalResult(suite="compression")

    for text, query, max_chars, required_terms in EXTRACTION_CASES:
        result.total += 1
        extracted = select_relevant_sentences(text, query=query, max_chars=max_chars)
        lower = extracted.lower()
        missing = [t for t in required_terms if t not in lower]
        if not missing and len(extracted) <= max_chars + 200:  # + marker overhead
            result.correct += 1
        else:
            result.mismatches.append(
                Mismatch(input=text[:60] + "...", expected=f"contains {required_terms}", actual=extracted)
            )

    for items in COMPACT_LIST_CASES:
        result.total += 1
        encoded = encode_compact_list(items)
        json_len = len(json.dumps(items))
        if encoded is None:
            result.mismatches.append(Mismatch(input=f"{len(items)} items", expected="non-None", actual=None))
            continue
        if len(encoded) >= json_len:
            result.mismatches.append(
                Mismatch(input=f"{len(items)} items", expected=f"< {json_len} chars", actual=len(encoded))
            )
            continue
        # Round-trip correctness: every field value must survive exactly,
        # including ones containing commas/quotes/newlines.
        rows = list(csv.reader(io.StringIO(encoded.split("\n", 1)[1])))
        header, data_rows = rows[0], rows[1:]
        round_tripped_ok = len(data_rows) == len(items) and all(
            [
                str(item.get(k)) if item.get(k) is not None else ""
                for k in header
            ]
            == row
            for item, row in zip(items, data_rows)
        )
        if round_tripped_ok:
            result.correct += 1
        else:
            result.mismatches.append(Mismatch(input=f"{len(items)} items", expected="round-trip match", actual=rows))

    for items in SMALL_COMPACT_LIST_CASES:
        result.total += 1
        encoded = encode_compact_list(items)
        if encoded is None:
            result.correct += 1
        else:
            result.mismatches.append(Mismatch(input=f"{len(items)} items", expected=None, actual=encoded))

    return result
