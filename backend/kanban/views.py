from datetime import date, time

from rest_framework.decorators import api_view
from rest_framework.request import Request
from rest_framework.response import Response

from kanban.models import KanbanTask, Project
from kanban.services.braindump import process_braindump

MAX_TITLE_LENGTH = 200
MAX_PROJECT_NAME_LENGTH = 200
MAX_TRANSCRIPT_LENGTH = 4000  # matches core chat MAX_MESSAGE_LENGTH convention


def _serialize_project(project: Project) -> dict:
    return {
        "id": project.id,
        "name": project.name,
        "description": project.description,
        "created_at": project.created_at,
        "updated_at": project.updated_at,
    }


def _serialize(task: KanbanTask) -> dict:
    return {
        "id": task.id,
        "project": task.project_id,
        "title": task.title,
        "description_markdown": task.description_markdown,
        "status": task.status,
        "priority": task.priority,
        "effort": task.effort,
        "due_date": task.due_date,
        "due_time": task.due_time,
        "source": task.source,
        "original_transcript_snippet": task.original_transcript_snippet,
        "position": task.position,
        "created_at": task.created_at,
        "updated_at": task.updated_at,
    }


def _parse_due_date(raw) -> date | None:
    if not raw:
        return None
    try:
        return date.fromisoformat(str(raw))
    except ValueError:
        return None


def _parse_due_time(raw) -> time | None:
    if not raw:
        return None
    try:
        return time.fromisoformat(str(raw))
    except ValueError:
        return None


def _get_project(project_id: int) -> Project | None:
    try:
        return Project.objects.get(pk=project_id)
    except Project.DoesNotExist:
        return None


@api_view(["GET", "POST"])
def project_list(request: Request) -> Response:
    if request.method == "GET":
        projects = Project.objects.all()
        return Response({"projects": [_serialize_project(p) for p in projects]})

    name = (request.data.get("name") or "").strip()
    if not name:
        return Response({"error": "name is required"}, status=400)
    if len(name) > MAX_PROJECT_NAME_LENGTH:
        return Response({"error": f"name must be under {MAX_PROJECT_NAME_LENGTH} characters"}, status=400)

    project = Project.objects.create(name=name, description=request.data.get("description") or "")
    return Response(_serialize_project(project), status=201)


@api_view(["GET", "PUT", "DELETE"])
def project_detail(request: Request, project_id: int) -> Response:
    project = _get_project(project_id)
    if project is None:
        return Response({"error": "Project not found."}, status=404)

    if request.method == "GET":
        return Response(_serialize_project(project))

    if request.method == "DELETE":
        project.delete()  # cascades to its tasks — see KanbanTask.project on_delete=CASCADE
        return Response(status=204)

    if "name" in request.data:
        name = (request.data.get("name") or "").strip()
        if not name:
            return Response({"error": "name cannot be empty"}, status=400)
        if len(name) > MAX_PROJECT_NAME_LENGTH:
            return Response({"error": f"name must be under {MAX_PROJECT_NAME_LENGTH} characters"}, status=400)
        project.name = name

    if "description" in request.data:
        project.description = request.data.get("description") or ""

    project.save()
    return Response(_serialize_project(project))


@api_view(["GET", "POST"])
def task_list(request: Request, project_id: int) -> Response:
    project = _get_project(project_id)
    if project is None:
        return Response({"error": "Project not found."}, status=404)

    if request.method == "GET":
        tasks = KanbanTask.objects.filter(project=project)
        return Response({"tasks": [_serialize(t) for t in tasks]})

    title = (request.data.get("title") or "").strip()
    if not title:
        return Response({"error": "title is required"}, status=400)
    if len(title) > MAX_TITLE_LENGTH:
        return Response({"error": f"title must be under {MAX_TITLE_LENGTH} characters"}, status=400)

    priority = request.data.get("priority") or KanbanTask.PRIORITY_MEDIUM
    if priority not in dict(KanbanTask.PRIORITY_CHOICES):
        return Response({"error": "invalid priority"}, status=400)

    effort = request.data.get("effort") or KanbanTask.PRIORITY_MEDIUM
    if effort not in dict(KanbanTask.EFFORT_CHOICES):
        return Response({"error": "invalid effort"}, status=400)

    status_value = request.data.get("status") or KanbanTask.STATUS_TODO
    if status_value not in dict(KanbanTask.STATUS_CHOICES):
        return Response({"error": "invalid status"}, status=400)

    source = request.data.get("source") or KanbanTask.SOURCE_MANUAL
    if source not in dict(KanbanTask.SOURCE_CHOICES):
        return Response({"error": "invalid source"}, status=400)

    due_date_raw = request.data.get("due_date")
    if due_date_raw and _parse_due_date(due_date_raw) is None:
        return Response({"error": "due_date must be a valid ISO date (YYYY-MM-DD)"}, status=400)

    due_time_raw = request.data.get("due_time")
    if due_time_raw and _parse_due_time(due_time_raw) is None:
        return Response({"error": "due_time must be a valid ISO time (HH:MM)"}, status=400)

    next_position = KanbanTask.objects.filter(project=project, status=status_value).count()
    task = KanbanTask.objects.create(
        project=project,
        title=title,
        description_markdown=request.data.get("description_markdown") or "",
        status=status_value,
        priority=priority,
        effort=effort,
        due_date=_parse_due_date(due_date_raw),
        due_time=_parse_due_time(due_time_raw),
        source=source,
        original_transcript_snippet=request.data.get("original_transcript_snippet") or "",
        position=next_position,
    )
    return Response(_serialize(task), status=201)


@api_view(["PUT", "DELETE"])
def task_detail(request: Request, project_id: int, task_id: int) -> Response:
    project = _get_project(project_id)
    if project is None:
        return Response({"error": "Project not found."}, status=404)

    try:
        # Scoping the lookup by project (not just pk) means a task id from a
        # different project 404s here instead of being editable/deletable
        # through the wrong project's URL.
        task = KanbanTask.objects.get(pk=task_id, project=project)
    except KanbanTask.DoesNotExist:
        return Response({"error": "Task not found."}, status=404)

    if request.method == "DELETE":
        task.delete()
        return Response(status=204)

    if "title" in request.data:
        title = (request.data.get("title") or "").strip()
        if not title:
            return Response({"error": "title cannot be empty"}, status=400)
        if len(title) > MAX_TITLE_LENGTH:
            return Response({"error": f"title must be under {MAX_TITLE_LENGTH} characters"}, status=400)
        task.title = title

    if "description_markdown" in request.data:
        task.description_markdown = request.data.get("description_markdown") or ""

    if "priority" in request.data:
        priority = request.data.get("priority")
        if priority not in dict(KanbanTask.PRIORITY_CHOICES):
            return Response({"error": "invalid priority"}, status=400)
        task.priority = priority

    if "effort" in request.data:
        effort = request.data.get("effort")
        if effort not in dict(KanbanTask.EFFORT_CHOICES):
            return Response({"error": "invalid effort"}, status=400)
        task.effort = effort

    if "due_date" in request.data:
        due_date_raw = request.data.get("due_date")
        if due_date_raw and _parse_due_date(due_date_raw) is None:
            return Response({"error": "due_date must be a valid ISO date (YYYY-MM-DD)"}, status=400)
        task.due_date = _parse_due_date(due_date_raw)

    if "due_time" in request.data:
        due_time_raw = request.data.get("due_time")
        if due_time_raw and _parse_due_time(due_time_raw) is None:
            return Response({"error": "due_time must be a valid ISO time (HH:MM)"}, status=400)
        task.due_time = _parse_due_time(due_time_raw)

    if "status" in request.data:
        new_status = request.data.get("status")
        if new_status not in dict(KanbanTask.STATUS_CHOICES):
            return Response({"error": "invalid status"}, status=400)
        if new_status != task.status:
            # Manual status change (e.g. the edit modal, as a non-drag
            # alternative) — append to the end of the target column within
            # this project rather than colliding with an existing position.
            task.status = new_status
            task.position = (
                KanbanTask.objects.filter(project=project, status=new_status).exclude(pk=task.pk).count()
            )

    task.save()
    return Response(_serialize(task))


@api_view(["PATCH"])
def reorder_column(request: Request, project_id: int) -> Response:
    """Move/reorder cards within or across a single column of one project.

    The frontend's drag-and-drop always knows the full resulting order of
    whichever column a card was dropped into, so it sends that as the source
    of truth rather than the backend trying to shift positions incrementally.
    """
    project = _get_project(project_id)
    if project is None:
        return Response({"error": "Project not found."}, status=404)

    status_value = request.data.get("status")
    if status_value not in dict(KanbanTask.STATUS_CHOICES):
        return Response({"error": "invalid status"}, status=400)

    ordered_ids = request.data.get("ordered_ids")
    if not isinstance(ordered_ids, list) or not all(isinstance(i, int) for i in ordered_ids):
        return Response({"error": "ordered_ids must be a list of task ids"}, status=400)

    # Scoped to this project — an id belonging to another project simply
    # won't be found here, which is what makes cross-project reordering
    # impossible rather than something we have to separately guard against.
    tasks = {t.id: t for t in KanbanTask.objects.filter(project=project, pk__in=ordered_ids)}
    if len(tasks) != len(set(ordered_ids)):
        return Response({"error": "one or more task ids not found in this project"}, status=400)

    for position, task_id in enumerate(ordered_ids):
        task = tasks[task_id]
        if task.status != status_value or task.position != position:
            task.status = status_value
            task.position = position
            task.save(update_fields=["status", "position", "updated_at"])

    return Response({"tasks": [_serialize(tasks[i]) for i in ordered_ids]})


@api_view(["POST"])
def braindump(request: Request, project_id: int) -> Response:
    project = _get_project(project_id)
    if project is None:
        return Response({"error": "Project not found."}, status=404)

    transcript = (request.data.get("transcript") or "").strip()
    if not transcript:
        return Response({"error": "transcript is required"}, status=400)
    if len(transcript) > MAX_TRANSCRIPT_LENGTH:
        return Response({"error": f"transcript must be under {MAX_TRANSCRIPT_LENGTH} characters"}, status=400)

    # process_braindump is project-agnostic by design — it only proposes
    # tasks. Project association happens when a suggestion is accepted
    # through POST /api/projects/<project_id>/tasks/, the same path a
    # manually-typed card goes through, so there's exactly one place tasks
    # get created.
    result = process_braindump(transcript)
    return Response(result)
