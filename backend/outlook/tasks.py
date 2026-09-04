import logging

from celery import shared_task
from django.db import transaction
from django.utils import timezone

from outlook.models import ScheduledEmail
from outlook.services import graph_client, oauth
from outlook.services.oauth import OutlookError

logger = logging.getLogger("outlook.tasks")


@shared_task(name="outlook.tasks.send_due_scheduled_emails")
def send_due_scheduled_emails() -> None:
    """Celery beat task (see mirabel/celery.py), runs every minute.

    Not wrapped in Celery's autoretry_for like memory.tasks — retrying this
    whole task on any exception would resend emails that already went out
    earlier in the same batch. Each row is sent and saved independently so
    one failure never blocks the rest.

    Due rows are claimed atomically (select_for_update + immediate status
    flip to STATUS_SENDING) before any network call — without this, two
    Celery workers, or an overlapping beat tick firing while a slow run is
    still in progress, could both see the same STATUS_PENDING rows and send
    duplicate emails.
    """
    with transaction.atomic():
        due_ids = list(
            ScheduledEmail.objects.filter(
                status=ScheduledEmail.STATUS_PENDING, send_at__lte=timezone.now()
            )
            .select_for_update(skip_locked=True)
            .values_list("id", flat=True)
        )
        ScheduledEmail.objects.filter(id__in=due_ids).update(status=ScheduledEmail.STATUS_SENDING)

    for email_id in due_ids:
        email = ScheduledEmail.objects.get(pk=email_id)
        try:
            token = oauth.get_valid_access_token()
            graph_client.send_mail(
                token, subject=email.subject, body_html=email.body_html, to_recipients=email.to
            )
            email.status = ScheduledEmail.STATUS_SENT
            email.sent_at = timezone.now()
            email.error_message = ""
        except OutlookError as exc:
            logger.error("Scheduled email %s failed to send: %s", email.id, exc)
            email.status = ScheduledEmail.STATUS_FAILED
            email.error_message = str(exc)
        except Exception:
            logger.exception("Scheduled email %s failed with an unexpected error", email.id)
            email.status = ScheduledEmail.STATUS_FAILED
            email.error_message = "An unexpected error occurred while sending."
        email.save()
