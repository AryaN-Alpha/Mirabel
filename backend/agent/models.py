from django.db import models

from core.models import Conversation


class AgentTask(models.Model):
    """One autonomous agent run, driven by agent.tasks.run_agent_task on the
    dedicated 'agent' Celery queue (single worker for now — see
    mirabel/celery.py). Reads/drafts/generates run fully autonomously;
    genuinely irreversible actions (publishing to LinkedIn, sending an
    Outlook email, turning in a Classroom assignment) pause the run via
    LangGraph's interrupt() and sit here as AWAITING_CONFIRMATION until an
    explicit approve/reject resumes them — see agent/tools/_common.py and
    agent/tasks.py.
    """

    class Status(models.TextChoices):
        QUEUED = "queued", "Queued"
        RUNNING = "running", "Running"
        AWAITING_CONFIRMATION = "awaiting_confirmation", "Awaiting confirmation"
        AWAITING_CLARIFICATION = "awaiting_clarification", "Awaiting clarification"
        DONE = "done", "Done"
        FAILED = "failed", "Failed"
        CANCELLED = "cancelled", "Cancelled"

    instruction = models.TextField()
    conversation = models.ForeignKey(
        Conversation, null=True, blank=True, on_delete=models.SET_NULL, related_name="agent_tasks"
    )
    status = models.CharField(max_length=24, choices=Status.choices, default=Status.QUEUED)

    # {"tool": str, "summary": str, "args": dict} while status=awaiting_confirmation.
    pending_action = models.JSONField(null=True, blank=True)
    # [{"tool": str, "result_summary": str}, ...] — a simple audit trail, not a
    # full replay log.
    steps = models.JSONField(default=list, blank=True)
    # Human-readable "what she's doing right now" line, updated live while
    # status=running (e.g. "Reading your Outlook inbox…") — see
    # agent/tasks.py::_run_graph. Cleared once the run leaves "running".
    current_step = models.CharField(max_length=255, blank=True, default="")

    result_text = models.TextField(blank=True, default="")
    result_mood = models.CharField(max_length=32, blank=True, default="")
    error_message = models.TextField(blank=True, default="")
    celery_task_id = models.CharField(max_length=64, blank=True, default="")

    created_at = models.DateTimeField(auto_now_add=True)
    started_at = models.DateTimeField(null=True, blank=True)
    finished_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"AgentTask({self.id}, {self.status})"

    @property
    def thread_id(self) -> str:
        """LangGraph checkpointer thread id — derived from the pk rather than
        stored, so there's no create-then-backfill race to worry about."""
        return f"agent-task-{self.pk}"
