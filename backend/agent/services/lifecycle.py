"""AgentTask lifecycle transitions shared by the REST endpoints
(agent/views.py) and the WebSocket voice path (voice/consumers.py), so a
task can be resumed/cancelled identically whether the human answers via the
on-screen card, chat, or voice.

Each function is a DB-status-guarded transition: it only acts if the task is
currently in the expected state, returning None otherwise (mirrors the REST
views' 404-when-wrong-state behavior). None of this touches the LangGraph
run itself — it only flips AgentTask.status/pending_action and enqueues the
Celery task that actually re-enters the paused graph (agent/tasks.py).
"""

from __future__ import annotations

from agent.models import AgentTask
from agent.tasks import resume_agent_task, run_agent_task


def resume_confirmation(task_id: int, *, approved: bool, args: dict | None) -> AgentTask | None:
    task = AgentTask.objects.filter(pk=task_id, status=AgentTask.Status.AWAITING_CONFIRMATION).first()
    if task is None:
        return None

    if isinstance(args, dict):
        # Editing only makes sense for the fields the pending action already
        # exposed — never let the caller smuggle in arbitrary new keys the
        # tool never asked for.
        allowed_keys = set((task.pending_action or {}).get("args") or {})
        args = {k: v for k, v in args.items() if k in allowed_keys} or None
    else:
        args = None

    task.status = AgentTask.Status.RUNNING
    task.pending_action = None
    async_result = resume_agent_task.delay(task.id, {"approved": approved, "args": args})
    task.celery_task_id = async_result.id
    task.save(update_fields=["status", "pending_action", "celery_task_id"])
    return task


def resume_clarification(task_id: int, *, answer: str) -> AgentTask | None:
    task = AgentTask.objects.filter(pk=task_id, status=AgentTask.Status.AWAITING_CLARIFICATION).first()
    if task is None:
        return None

    task.status = AgentTask.Status.RUNNING
    task.pending_action = None
    async_result = resume_agent_task.delay(task.id, {"answer": answer})
    task.celery_task_id = async_result.id
    task.save(update_fields=["status", "pending_action", "celery_task_id"])
    return task


def cancel_if_cancellable(task_id: int) -> AgentTask | None:
    """Only QUEUED and AWAITING_CONFIRMATION are safely cancellable — nothing
    irreversible has run yet in either state. A RUNNING task cannot be
    cancelled here: the graph may be past a confirmed side effect with no
    idempotency key to safely verify against, so killing the worker
    mid-execution is out of scope (see agent/tools/_common.py)."""
    task = AgentTask.objects.filter(
        pk=task_id, status__in=[AgentTask.Status.QUEUED, AgentTask.Status.AWAITING_CONFIRMATION]
    ).first()
    if task is None:
        return None

    if task.celery_task_id:
        run_agent_task.app.control.revoke(task.celery_task_id)

    task.status = AgentTask.Status.CANCELLED
    task.pending_action = None
    task.save(update_fields=["status", "pending_action"])
    return task
