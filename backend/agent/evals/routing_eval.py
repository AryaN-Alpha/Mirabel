"""Free, deterministic, zero-I/O — always runnable, no external dependency.

Reuses agent/tools/routing.py's own domain->tools mapping (_DOMAIN_TOOLS)
rather than reconstructing a second copy of it here: a duplicated mapping
would silently drift out of sync if routing.py's domains ever change, which
is exactly the kind of second-source-of-truth bug this eval exists to catch
elsewhere."""

from __future__ import annotations

from agent.evals.cases import ROUTING_CASES
from agent.tools.registry import ALL_TOOLS
from agent.tools.routing import _DOMAIN_TOOLS, select_tools
from core.evals.base import EvalResult, Mismatch


def run() -> EvalResult:
    result = EvalResult(suite="routing", total=len(ROUTING_CASES))
    for instruction, expected_domains in ROUTING_CASES:
        tools = select_tools(instruction)
        tool_names = {t.name for t in tools}

        if expected_domains is None:
            ok = tools == ALL_TOOLS
        else:
            expected_names = {t.name for d in expected_domains for t in _DOMAIN_TOOLS[d]}
            ok = expected_names.issubset(tool_names) and tools != ALL_TOOLS

        if ok:
            result.correct += 1
        else:
            result.mismatches.append(
                Mismatch(input=instruction, expected=expected_domains, actual=sorted(tool_names))
            )
    return result
