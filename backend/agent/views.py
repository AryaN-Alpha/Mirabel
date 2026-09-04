from rest_framework.decorators import api_view, throttle_classes
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle

from agent.models import AgentTask
from agent.services.lifecycle import (
    cancel_if_cancellable,
    resume_clarification,
    resume_confirmation,
)
from agent.tasks import run_agent_task
from core.models import Conversation

MAX_INSTRUCTION_LENGTH = 4000
DEFAULT_PAGE_SIZE = 20
MAX_PAGE_SIZE = 100


def _serialize(task: AgentTask) -> dict:
    return {
        "id": task.id,
        "instruction": task.instruction,
        "conversation_id": task.conversation_id,
        "status": task.status,
        "pending_action": task.pending_action,
        "steps": task.steps,
        "current_step": task.current_step,
        "result_text": task.result_text,
        "result_links": task.result_links,
        "result_mood": task.result_mood,
        "error_message": task.error_message,
        "created_at": task.created_at,
        "started_at": task.started_at,
        "finished_at": task.finished_at,
    }


@api_view(["GET", "POST"])
@throttle_classes([AnonRateThrottle])
def tasks(request: Request) -> Response:
    if request.method == "GET":
        try:
            page = max(1, int(request.GET.get("page", 1)))
        except ValueError:
            page = 1
        try:
            page_size = int(request.GET.get("page_size", DEFAULT_PAGE_SIZE))
        except ValueError:
            page_size = DEFAULT_PAGE_SIZE
        page_size = max(1, min(page_size, MAX_PAGE_SIZE))

        queryset = AgentTask.objects.all()
        total = queryset.count()
        offset = (page - 1) * page_size
        return Response(
            {
                "total": total,
                "page": page,
                "page_size": page_size,
                "tasks": [_serialize(t) for t in queryset[offset : offset + page_size]],
            }
        )

    instruction = (request.data.get("instruction") or "").strip()
    if not instruction:
        return Response({"error": "instruction is required"}, status=400)
    if len(instruction) > MAX_INSTRUCTION_LENGTH:
        return Response({"error": f"instruction must be under {MAX_INSTRUCTION_LENGTH} characters"}, status=400)

    conversation_id = request.data.get("conversation_id")
    conversation = None
    if conversation_id:
        try:
            conversation = Conversation.objects.get(id=conversation_id)
        except Conversation.DoesNotExist:
            conversation = None

    task = AgentTask.objects.create(instruction=instruction, conversation=conversation)
    async_result = run_agent_task.delay(task.id)
    task.celery_task_id = async_result.id
    task.save(update_fields=["celery_task_id"])
    return Response(_serialize(task), status=201)


@api_view(["GET"])
# Polled every 1.5s while a task is running (see pollAgentTask) — the global
# 30/min AnonRateThrottle (mirabel/settings.py) starts 429ing this well
# before a longer-running task finishes. Read-only, cheap, no LLM/cost
# surface, so exempting it doesn't reopen the DoS concern the throttle
# otherwise guards against.
@throttle_classes([])
def task_detail(_request: Request, task_id: int) -> Response:
    try:
        task = AgentTask.objects.get(pk=task_id)
    except AgentTask.DoesNotExist:
        return Response({"error": "task not found"}, status=404)
    return Response(_serialize(task))


@api_view(["POST"])
def approve_task(request: Request, task_id: int) -> Response:
    edited_args = request.data.get("args")
    task = resume_confirmation(task_id, approved=True, args=edited_args)
    if task is None:
        return Response({"error": "No task awaiting confirmation with that id."}, status=404)
    return Response(_serialize(task))


@api_view(["POST"])
def reject_task(_request: Request, task_id: int) -> Response:
    task = resume_confirmation(task_id, approved=False, args=None)
    if task is None:
        return Response({"error": "No task awaiting confirmation with that id."}, status=404)
    return Response(_serialize(task))


@api_view(["POST"])
def answer_task(request: Request, task_id: int) -> Response:
    answer = (request.data.get("answer") or "").strip()
    if not answer:
        return Response({"error": "answer is required"}, status=400)
    if len(answer) > MAX_INSTRUCTION_LENGTH:
        return Response({"error": f"answer must be under {MAX_INSTRUCTION_LENGTH} characters"}, status=400)
    task = resume_clarification(task_id, answer=answer)
    if task is None:
        return Response({"error": "No task awaiting clarification with that id."}, status=404)
    return Response(_serialize(task))


@api_view(["POST"])
def cancel_task(_request: Request, task_id: int) -> Response:
    task = cancel_if_cancellable(task_id)
    if task is None:
        return Response({"error": "No cancellable task with that id."}, status=404)
    return Response(_serialize(task))
