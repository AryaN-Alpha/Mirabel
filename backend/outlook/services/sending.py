"""Immediate (non-scheduled) sending — extracted from outlook/views.py so the
same "send now" / "reply now" orchestration is reusable by both the REST
views and the agent tools (agent/tools/outlook_tools.py).
"""

from __future__ import annotations

from outlook.services import graph_client, oauth


def send_email_now(*, to: list[str], subject: str, body_html: str) -> None:
    """Send a new email immediately. Raises OutlookError on failure."""
    token = oauth.get_valid_access_token()
    graph_client.send_mail(token, subject=subject, body_html=body_html, to_recipients=to)


def reply_to_message_now(*, message_id: str, comment: str) -> None:
    """Reply to an existing message immediately. Raises OutlookError on failure."""
    token = oauth.get_valid_access_token()
    graph_client.reply_to_message(token, message_id, comment)
