"""Thin cross-app dispatcher for the eval harness — the one piece allowed to
know about both memory/evals and agent/evals, mirroring how
core/management/commands/llm_cost_report.py is already the established
cross-app-orchestrating convention (it aggregates a log every app writes to).
"""

from __future__ import annotations

from core.evals.base import EvalResult

FREE_SUITE_NAMES = ("gating", "routing", "compression")
COST_SUITE_NAMES = ("rag", "supersession")
ALL_SUITE_NAMES = FREE_SUITE_NAMES + COST_SUITE_NAMES


def run_suites(names: list[str]) -> list[EvalResult]:
    results: list[EvalResult] = []
    for name in names:
        if name == "gating":
            from memory.evals.gating_eval import run
        elif name == "routing":
            from agent.evals.routing_eval import run
        elif name == "compression":
            from core.evals.compression_eval import run
        elif name == "rag":
            from memory.evals.rag_eval import run
        elif name == "supersession":
            from memory.evals.supersession_eval import run
        else:
            raise ValueError(f"unknown eval suite: {name!r} (choices: {', '.join(ALL_SUITE_NAMES)})")
        results.append(run())
    return results
