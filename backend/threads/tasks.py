import logging

from celery import shared_task

from threads.services.automation import claim_and_run, due_automations

logger = logging.getLogger("threads")


@shared_task(name="threads.tasks.run_due_automations")
def run_due_automations() -> None:
    """Celery beat task, runs periodically to execute due Threads automations independently."""
    for automation_id in due_automations().values_list("id", flat=True):
        claim_and_run(automation_id)
