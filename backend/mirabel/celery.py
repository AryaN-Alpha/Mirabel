import os

from celery import Celery
from celery.schedules import crontab

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "mirabel.settings")

app = Celery("mirabel")
app.config_from_object("django.conf:settings", namespace="CELERY")
app.autodiscover_tasks()

# Beat schedule — weekly emotional summary, every Sunday at 03:00 UTC.
app.conf.beat_schedule = {
    "weekly-emotional-summary": {
        "task": "memory.tasks.run_weekly_summary",
        "schedule": crontab(day_of_week=0, hour=3, minute=0),
    },
}
