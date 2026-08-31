import logging

from celery import shared_task

from linkedin.services.automation import claim_and_run, due_automations

logger = logging.getLogger("linkedin.tasks")


@shared_task(name="linkedin.tasks.run_due_automations")
def run_due_automations() -> None:
    """Celery beat task (see mirabel/celery.py), runs every 5 minutes.

    Not wrapped in autoretry_for like memory.tasks — retrying the whole task
    on any exception would re-attempt automations that already ran earlier
    in the same batch. Each automation is claimed independently (see
    services/automation.py::claim_and_run's atomic UPDATE...WHERE guard) and
    run independently so one failure never blocks the rest, matching
    outlook.tasks.send_due_scheduled_emails's precedent.
    """
    for automation_id in due_automations().values_list("id", flat=True):
        claim_and_run(automation_id)
