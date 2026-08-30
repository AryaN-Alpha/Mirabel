from django.db import models


class MemoryFact(models.Model):
    """
    Durable, typed, LLM-extracted claim about the user — a tier above raw
    "turn" memories and below the periodic "summary" rollup. Lives in
    Postgres for human inspection/querying; mirrored into Chroma as
    kind="fact" (same pattern as MemorySummary for kind="summary").

    A later contradicting fact SUPERSEDES this one rather than deleting it
    (see memory/services/supersession.py) — history is preserved, retrieval
    just stops surfacing the stale row. `supersedes` points backward (this
    row -> the older row it replaced); the mirrored Chroma metadata's
    `superseded_by` field on the OLD row points forward to this row's
    chroma_id. The two directions are intentionally inverse.
    """

    class FactType(models.TextChoices):
        PREFERENCE = "preference", "Preference"
        BIOGRAPHICAL = "biographical", "Biographical"
        RELATIONSHIP = "relationship", "Relationship"
        GOAL = "goal", "Goal"
        CONSTRAINT = "constraint", "Constraint"
        OTHER = "other", "Other"

    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        SUPERSEDED = "superseded", "Superseded"

    fact_text = models.TextField()
    fact_type = models.CharField(max_length=20, choices=FactType.choices, default=FactType.OTHER)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.ACTIVE)
    chroma_id = models.CharField(max_length=128)
    supersedes = models.ForeignKey(
        "self", null=True, blank=True, on_delete=models.SET_NULL, related_name="superseded_by_set"
    )
    source_message = models.ForeignKey(
        "core.Message", null=True, blank=True, on_delete=models.SET_NULL, related_name="extracted_facts"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    superseded_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["status", "fact_type"])]

    def __str__(self) -> str:
        return f"MemoryFact({self.fact_type}, {self.status}): {self.fact_text[:50]}"


class MemorySummary(models.Model):
    """
    Periodic emotional rollup written by the weekly Celery beat task.
    Lives in Postgres for human inspection; also mirrored into Chroma as a
    high-salience pseudo-memory.
    """

    period_start = models.DateTimeField()
    period_end = models.DateTimeField()
    summary_text = models.TextField()
    dominant_moods = models.JSONField(default=list)
    message_count = models.PositiveIntegerField(default=0)
    chroma_id = models.CharField(max_length=128, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-period_end"]
        indexes = [models.Index(fields=["-period_end"])]

    def __str__(self) -> str:
        return f"MemorySummary({self.period_end:%Y-%m-%d})"
