"""Shared result type for the eval harness (core/management/commands/run_evals.py).
Deliberately tiny and dependency-free so memory/evals/* and agent/evals/*
can both depend on it without a circular import back to core."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class Mismatch:
    input: Any
    expected: Any
    actual: Any


@dataclass
class EvalResult:
    suite: str
    total: int = 0
    correct: int = 0
    mismatches: list[Mismatch] = field(default_factory=list)
    # Set when the suite couldn't run at all (e.g. no live Chroma / API key)
    # — distinct from a real failure, never counted as one.
    skipped_reason: str | None = None
    # Free-text note shown alongside results, e.g. flagging real LLM spend.
    note: str = ""

    @property
    def accuracy(self) -> float | None:
        if self.skipped_reason is not None or self.total == 0:
            return None
        return self.correct / self.total
