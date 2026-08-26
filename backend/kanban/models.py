from django.db import models


class Project(models.Model):
    """A named workspace with its own independent Kanban board.

    No FK to a user — same no-auth convention as the rest of this project
    (see ModelPreference in core/models.py). There can be many projects; they
    just aren't scoped to different people yet.
    """

    name = models.CharField(max_length=200)
    description = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["created_at"]

    def __str__(self) -> str:
        return f"Project({self.name!r})"


class KanbanTask(models.Model):
    """A single card on the Kanban board, scoped to exactly one Project.

    No FK to a user — same no-auth singleton convention as the rest of this
    project (see ModelPreference in core/models.py). Created either manually
    through the board UI or accepted from an AI brain-dump suggestion
    (kanban.services.braindump.process_braindump) — both paths write through
    this same model via the same POST /api/projects/<id>/tasks/ endpoint, so
    "source" is provenance metadata only, not a separate persistence path.

    project became a required FK after projects were introduced; see
    migrations 0002-0004 for how pre-existing tasks were safely backfilled
    onto a "General" project rather than being dropped.
    """

    STATUS_TODO = "todo"
    STATUS_IN_PROGRESS = "in_progress"
    STATUS_DONE = "done"
    STATUS_CHOICES = [
        (STATUS_TODO, "To Do"),
        (STATUS_IN_PROGRESS, "In Progress"),
        (STATUS_DONE, "Done"),
    ]

    PRIORITY_HIGH = "High"
    PRIORITY_MEDIUM = "Medium"
    PRIORITY_LOW = "Low"
    PRIORITY_CHOICES = [
        (PRIORITY_HIGH, "High"),
        (PRIORITY_MEDIUM, "Medium"),
        (PRIORITY_LOW, "Low"),
    ]

    # Effort uses the same High/Medium/Low scale as priority.
    EFFORT_CHOICES = PRIORITY_CHOICES

    SOURCE_MANUAL = "manual"
    SOURCE_AI = "ai"
    SOURCE_CHOICES = [
        (SOURCE_MANUAL, "Manual"),
        (SOURCE_AI, "AI brain dump"),
    ]

    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="tasks")
    title = models.CharField(max_length=200)
    description_markdown = models.TextField(blank=True, default="")
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default=STATUS_TODO)
    priority = models.CharField(max_length=8, choices=PRIORITY_CHOICES, default=PRIORITY_MEDIUM)
    effort = models.CharField(max_length=8, choices=EFFORT_CHOICES, default=PRIORITY_MEDIUM)
    due_date = models.DateField(null=True, blank=True)
    source = models.CharField(max_length=8, choices=SOURCE_CHOICES, default=SOURCE_MANUAL)
    original_transcript_snippet = models.TextField(blank=True, default="")
    position = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["status", "position", "created_at"]

    def __str__(self) -> str:
        return f"KanbanTask({self.title!r}, {self.status})"
