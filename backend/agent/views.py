from rest_framework.decorators import api_view, throttle_classes
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle

from agent.models import AgentTask
from agent.tasks import resume_agent_task, run_agent_task
from core.models import Conversation

MAX_INSTRUCTION_LENGTH = 4000


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
        return Response({"tasks": [_serialize(t) for t in AgentTask.objects.all()[:100]]})

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
def task_detail(_request: Request, task_id: int) -> Response:
    try:
        task = AgentTask.objects.get(pk=task_id)
    except AgentTask.DoesNotExist:
        return Response({"error": "task not found"}, status=404)
    return Response(_serialize(task))


def _resume(task_id: int, resume_value: dict, *, expected_status: str, not_found_error: str) -> Response:
    try:
        task = AgentTask.objects.get(pk=task_id, status=expected_status)
    except AgentTask.DoesNotExist:
        return Response({"error": not_found_error}, status=404)

    task.status = AgentTask.Status.RUNNING
    task.pending_action = None
    async_result = resume_agent_task.delay(task.id, resume_value)
    task.celery_task_id = async_result.id
    task.save(update_fields=["status", "pending_action", "celery_task_id"])
    return Response(_serialize(task))


@api_view(["POST"])
def approve_task(request: Request, task_id: int) -> Response:
    edited_args = request.data.get("args")
    task = AgentTask.objects.filter(pk=task_id, status=AgentTask.Status.AWAITING_CONFIRMATION).first()
    if task and isinstance(edited_args, dict):
        # Editing only makes sense for the fields the pending action already
        # exposed — never let the client smuggle in arbitrary new keys the
        # tool never asked for.
        allowed_keys = set((task.pending_action or {}).get("args") or {})
        edited_args = {k: v for k, v in edited_args.items() if k in allowed_keys} or None
    else:
        edited_args = None
    return _resume(
        task_id,
        {"approved": True, "args": edited_args},
        expected_status=AgentTask.Status.AWAITING_CONFIRMATION,
        not_found_error="No task awaiting confirmation with that id.",
    )


@api_view(["POST"])
def reject_task(_request: Request, task_id: int) -> Response:
    return _resume(
        task_id,
        {"approved": False, "args": None},
        expected_status=AgentTask.Status.AWAITING_CONFIRMATION,
        not_found_error="No task awaiting confirmation with that id.",
    )


@api_view(["POST"])
def answer_task(request: Request, task_id: int) -> Response:
    answer = (request.data.get("answer") or "").strip()
    if not answer:
        return Response({"error": "answer is required"}, status=400)
    if len(answer) > MAX_INSTRUCTION_LENGTH:
        return Response({"error": f"answer must be under {MAX_INSTRUCTION_LENGTH} characters"}, status=400)
    return _resume(
        task_id,
        {"answer": answer},
        expected_status=AgentTask.Status.AWAITING_CLARIFICATION,
        not_found_error="No task awaiting clarification with that id.",
    )


@api_view(["POST"])
def cancel_task(_request: Request, task_id: int) -> Response:
    try:
        task = AgentTask.objects.get(
            pk=task_id, status__in=[AgentTask.Status.QUEUED, AgentTask.Status.AWAITING_CONFIRMATION]
        )
    except AgentTask.DoesNotExist:
        return Response({"error": "No cancellable task with that id."}, status=404)

    # Best-effort only: if the task already started running (past QUEUED),
    # revoke can't stop a graph mid-invoke() — the run finishes and its
    # result is simply discarded since status is already CANCELLED here.
    if task.celery_task_id:
        run_agent_task.app.control.revoke(task.celery_task_id)

    task.status = AgentTask.Status.CANCELLED
    task.pending_action = None
    task.save(update_fields=["status", "pending_action"])
    return Response(_serialize(task))
