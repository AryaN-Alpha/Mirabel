import os

from celery import Celery
from celery.schedules import crontab

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "mirabel.settings")

app = Celery("mirabel")
app.config_from_object("django.conf:settings", namespace="CELERY")
app.autodiscover_tasks()

# Beat schedule — weekly emotional summary, every Sunday at 03:00 UTC;
# scheduled Outlook sends, checked every minute for anything now due.
app.conf.beat_schedule = {
    "weekly-emotional-summary": {
        "task": "memory.tasks.run_weekly_summary",
        "schedule": crontab(day_of_week=0, hour=3, minute=0),
    },
    # Staggered an hour after the weekly summary so a just-created summary
    # memory is never in the same run as the prune scan.
    "memory-lifecycle-prune": {
        "task": "memory.tasks.run_memory_lifecycle",
        "schedule": crontab(day_of_week=0, hour=4, minute=0),
    },
    "outlook-scheduled-emails": {
        "task": "outlook.tasks.send_due_scheduled_emails",
        "schedule": 60.0,
    },
}
