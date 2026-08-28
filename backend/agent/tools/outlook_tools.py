"""Outlook tools. Reading the inbox and generating draft text is safe.
Scheduling a send mirrors this app's existing time-deferred + cancellable
ScheduledEmail pattern — the user can already cancel it from the Scheduled
tab before send_at, so it doesn't need an extra confirmation gate.
send_outlook_email_now and reply_outlook_message_now are sensitive — they
pause the agent run for human approval before anything actually sends."""

from __future__ import annotations

from django.utils import timezone
from django.utils.dateparse import parse_datetime
from langchain_core.tools import tool

from agent.tools._common import rejected_message, require_confirmation
from outlook.models import OutlookCredential, ScheduledEmail
from outlook.services import graph_client, oauth, sending
from outlook.services.email_ai import generate_compose_draft as _generate_compose_draft
from outlook.services.email_ai import generate_reply_draft as _generate_reply_draft
from outlook.services.oauth import OutlookError


@tool
def check_outlook_connection() -> dict:
    """Check whether an Outlook/Microsoft account is connected. Call this first if you're
    unsure — every other Outlook tool will fail if not connected."""
    cred = OutlookCredential.current()
    return {"connected": cred.is_connected, "account_email": cred.account_email}


@tool
def list_outlook_inbox(domain: str = "", sender: str = "", top: int = 10) -> dict:
    """List recent inbox messages, optionally filtered by sender domain or exact sender address.

    Args:
        domain: Optional sender domain filter, e.g. "example.com".
        sender: Optional exact sender email filter.
        top: Max messages to return (default 10).
    """
    try:
        token = oauth.get_valid_access_token()
        messages = graph_client.list_inbox_messages(token, domain=domain or None, sender=sender or None, top=top)
    except OutlookError as exc:
        return {"error": str(exc)}
    return {"messages": messages}


@tool
def get_outlook_message(message_id: str) -> dict:
    """Get the full content of one Outlook message by id, including its thread.

    Args:
        message_id: The message's Outlook id (see list_outlook_inbox).
    """
    try:
        token = oauth.get_valid_access_token()
        message = graph_client.get_message(token, message_id, prefer_text=True)
    except OutlookError as exc:
        return {"error": str(exc)}
    return message


@tool
def generate_outlook_reply(message_id: str, instructions: str = "") -> dict:
    """Use AI to draft a reply to an existing Outlook message. Does not send anything.

    Args:
        message_id: The message's Outlook id being replied to (see list_outlook_inbox).
        instructions: Optional guidance for the reply.
    """
    try:
        token = oauth.get_valid_access_token()
        message = graph_client.get_message(token, message_id, prefer_text=True)
    except OutlookError as exc:
        return {"error": str(exc)}
    sender = message.get("from", {}).get("emailAddress", {}).get("address", "unknown sender")
    return _generate_reply_draft(
        original_subject=message.get("subject", ""),
        original_sender=sender,
        original_body_text=message.get("body", {}).get("content", ""),
        instructions=instructions,
    )


@tool
def generate_outlook_compose(prompt: str) -> dict:
    """Use AI to draft a brand-new email from a free-form prompt. Does not send anything.

    Args:
        prompt: What the email should say.
    """
    return _generate_compose_draft(prompt=prompt)


@tool
def reply_outlook_message_now(message_id: str, comment: str) -> dict:
    """Send a reply to an existing Outlook message right now, delivered to the recipient
    immediately. IRREVERSIBLE — calling this pauses the run to ask the human for approval
    first. If they reject it, nothing is sent; say so plainly, don't retry.

    Args:
        message_id: The message's Outlook id being replied to.
        comment: The reply text.
    """
    summary = f'Send this reply on Outlook: "{comment[:200]}"'
    args = {"message_id": message_id, "comment": comment}
    decision = require_confirmation(tool="reply_outlook_message_now", summary=summary, args=args)
    if not decision["approved"]:
        return {"sent": False, "message": rejected_message(summary)}
    final_args = decision.get("args") or args
    try:
        sending.reply_to_message_now(**final_args)
    except OutlookError as exc:
        return {"sent": False, "error": str(exc)}
    return {"sent": True}


@tool
def send_outlook_email_now(to: list[str], subject: str, body_html: str) -> dict:
    """Send a brand-new email right now, delivered immediately. IRREVERSIBLE — calling this
    pauses the run to ask the human for approval first. If they reject it, nothing is sent;
    say so plainly, don't retry.

    Args:
        to: Recipient email addresses.
        subject: Email subject.
        body_html: Email body (HTML).
    """
    summary = f'Send this email to {", ".join(to)}: "{subject}"'
    args = {"to": to, "subject": subject, "body_html": body_html}
    decision = require_confirmation(tool="send_outlook_email_now", summary=summary, args=args)
    if not decision["approved"]:
        return {"sent": False, "message": rejected_message(summary)}
    final_args = decision.get("args") or args
    try:
        sending.send_email_now(**final_args)
    except OutlookError as exc:
        return {"sent": False, "error": str(exc)}
    return {"sent": True}


@tool
def schedule_outlook_email(to: list[str], subject: str, body_html: str, send_at: str) -> dict:
    """Schedule a new email to send later — NOT sent immediately. The user can still cancel
    it from the Scheduled tab before it goes out, so this does not need approval.

    Args:
        to: Recipient email addresses.
        subject: Email subject.
        body_html: Email body (HTML).
        send_at: ISO datetime to send at — must be in the future.
    """
    send_dt = parse_datetime(send_at)
    if send_dt is None:
        return {"error": "send_at must be a valid ISO datetime"}
    if timezone.is_naive(send_dt):
        send_dt = timezone.make_aware(send_dt)
    if send_dt <= timezone.now():
        return {"error": "send_at must be in the future"}
    email = ScheduledEmail.objects.create(to=to, subject=subject, body_html=body_html, send_at=send_dt)
    return {"id": email.id, "send_at": email.send_at.isoformat(), "status": email.status}


TOOLS = [
    check_outlook_connection,
    list_outlook_inbox,
    get_outlook_message,
    generate_outlook_reply,
    generate_outlook_compose,
    reply_outlook_message_now,
    send_outlook_email_now,
    schedule_outlook_email,
]
