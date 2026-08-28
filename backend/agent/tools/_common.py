"""Shared helpers for agent tools. See agent/tools/registry.py for the
aggregated tool list every future tool gets added to."""

from __future__ import annotations

from typing import Any

from langgraph.types import interrupt


def require_confirmation(*, tool: str, summary: str, args: dict[str, Any]) -> dict[str, Any]:
    """Pauses the agent run and waits for a human approve/reject/edit.

    Call this from a "sensitive" tool (publish/send/turn-in) before it does
    anything irreversible. Returns the human's decision as
    {"approved": bool, "args": dict | None} — never raises. `args` is the
    (possibly user-edited) argument dict to actually act on; the caller
    should fall back to its own `args` when it's None/absent, e.g. to catch
    a misheard email address before it's used:

        decision = require_confirmation(tool=..., summary=summary, args=args)
        if not decision["approved"]:
            return {"sent": False, "message": rejected_message(summary)}
        final_args = decision.get("args") or args

    The pause itself is LangGraph's interrupt(): it halts graph execution
    at this exact point, and (because the graph is built with a Postgres
    checkpointer, see agent/graph.py) the state survives even though the
    Celery task that was running it ends. agent/tasks.py::run_agent_task
    detects the pause, records `summary`/`args` on AgentTask.pending_action,
    and sets status=awaiting_confirmation. agent/tasks.py::resume_agent_task
    later re-enters this exact call with the human's decision — note that
    per LangGraph's interrupt() contract, the whole tool function re-runs
    from the top on resume, so any code before this call must be safe to
    repeat (every sensitive tool in this codebase only does read-only
    lookups before calling require_confirmation — no writes happen until
    after approval).
    """
    decision = interrupt({"kind": "confirm", "tool": tool, "summary": summary, "args": args})
    if not isinstance(decision, dict):
        return {"approved": False, "args": None}
    return {"approved": bool(decision.get("approved")), "args": decision.get("args")}


def rejected_message(summary: str) -> str:
    """Standard tool-result text when a sensitive action is rejected, so the
    model has something concrete to acknowledge instead of retrying blindly."""
    return f'The user did not approve this action ("{summary}"). Do not retry it — tell them plainly that you held off.'
