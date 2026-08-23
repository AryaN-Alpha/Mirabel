from django.db import models


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
