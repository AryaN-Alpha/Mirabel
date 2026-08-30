"""Free, deterministic, zero-I/O — always runnable, no external dependency."""

from __future__ import annotations

from core.evals.base import EvalResult, Mismatch
from memory.evals.cases import GATING_CASES
from memory.services.gating import needs_memory


def run() -> EvalResult:
    result = EvalResult(suite="gating", total=len(GATING_CASES))
    for text, expected in GATING_CASES:
        actual = needs_memory(text)
        if actual == expected:
            result.correct += 1
        else:
            result.mismatches.append(Mismatch(input=text, expected=expected, actual=actual))
    return result
