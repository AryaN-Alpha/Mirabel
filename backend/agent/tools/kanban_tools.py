"""Kanban board tools — list/create/update tasks, and turn a free-text
brain dump into board cards. Everything here is a local, editable/deletable
DB write, so nothing is gated behind confirmation."""

from __future__ import annotations

from langchain_core.tools import tool

from kanban.models import KanbanTask, Project
from kanban.services.braindump import process_braindump


@tool
def list_kanban_projects() -> list[dict]:
    """List every Kanban project (board) that exists, with id, name, and description.
    Call this first if the user refers to a project by name and you need its id."""
    return [{"id": p.id, "name": p.name, "description": p.description} for p in Project.objects.all()]


@tool
def list_kanban_tasks(project_id: int, status: str = "") -> list[dict]:
    """List the tasks/cards on one Kanban project's board.

    Args:
        project_id: The Kanban project's id (see list_kanban_projects).
        status: Optional filter — one of "todo", "in_progress", "done". Leave empty for all statuses.
    """
    qs = KanbanTask.objects.filter(project_id=project_id)
    if status:
        qs = qs.filter(status=status)
    return [_serialize_task(t) for t in qs]


@tool
def create_kanban_task(
    project_id: int,
    title: str,
    description_markdown: str = "",
    priority: str = "Medium",
    effort: str = "Medium",
    due_date: str = "",
) -> dict:
    """Create a new task/card on a Kanban project's board.

    Args:
        project_id: The Kanban project's id (see list_kanban_projects).
        title: Short task title.
        description_markdown: Optional longer description, markdown supported.
        priority: One of "High", "Medium", "Low".
        effort: One of "High", "Medium", "Low".
        due_date: Optional ISO date (YYYY-MM-DD). Leave empty for no due date.
    """
    task = KanbanTask.objects.create(
        project_id=project_id,
        title=title[:200],
        description_markdown=description_markdown,
        priority=priority if priority in {"High", "Medium", "Low"} else "Medium",
        effort=effort if effort in {"High", "Medium", "Low"} else "Medium",
        due_date=due_date or None,
        source=KanbanTask.SOURCE_AI,
    )
    return _serialize_task(task)


@tool
def update_kanban_task(task_id: int, status: str = "", title: str = "", description_markdown: str = "") -> dict:
    """Update an existing Kanban task — move it to a new status column and/or edit its text.
    Leave any argument empty/unset to keep that field unchanged.

    Args:
        task_id: The task's id (see list_kanban_tasks).
        status: New status, one of "todo", "in_progress", "done".
        title: New title.
        description_markdown: New description.
    """
    try:
        task = KanbanTask.objects.get(pk=task_id)
    except KanbanTask.DoesNotExist:
        return {"error": f"No Kanban task with id {task_id}."}
    if status:
        task.status = status
    if title:
        task.title = title[:200]
    if description_markdown:
        task.description_markdown = description_markdown
    task.save()
    return _serialize_task(task)


@tool
def braindump_to_kanban_tasks(project_id: int, transcript: str, create: bool = True) -> dict:
    """Turn a free-text brain dump (a stream-of-consciousness note or transcript) into
    structured Kanban tasks using AI, optionally creating them right away as real cards.

    Args:
        project_id: The Kanban project's id to create tasks under (see list_kanban_projects).
        transcript: The free-text brain dump to extract tasks from.
        create: If True (default), persist the extracted tasks as real cards. If False, only
            return proposals without saving anything.
    """
    result = process_braindump(transcript)
    if result["error"]:
        return {"created": [], "error": True, "reason": result["reason"]}

    if not create:
        return {"proposed": result["tasks"], "error": False}

    created = [
        _serialize_task(
            KanbanTask.objects.create(
                project_id=project_id,
                title=item["title"],
                description_markdown=item["description_markdown"],
                priority=item["priority"],
                effort=item["effort"],
                due_date=item["due_date"],
                original_transcript_snippet=item["original_transcript_snippet"],
                source=KanbanTask.SOURCE_AI,
            )
        )
        for item in result["tasks"]
    ]
    return {"created": created, "error": False}


def _serialize_task(task: KanbanTask) -> dict:
    return {
        "id": task.id,
        "project_id": task.project_id,
        "title": task.title,
        "status": task.status,
        "priority": task.priority,
        "effort": task.effort,
        "due_date": task.due_date.isoformat() if task.due_date else None,
    }


TOOLS = [list_kanban_projects, list_kanban_tasks, create_kanban_task, update_kanban_task, braindump_to_kanban_tasks]
