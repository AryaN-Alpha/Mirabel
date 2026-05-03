import logging

from django.db import connection
from rest_framework.decorators import api_view, throttle_classes
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle

from core.models import Conversation, Message
from core.services.llm import generate_reply

logger = logging.getLogger("core.views")

HISTORY_WINDOW = 20


@api_view(["POST"])
@throttle_classes([AnonRateThrottle])
def chat(request: Request) -> Response:
    message_text: str = (request.data.get("message") or "").strip()
    if not message_text:
        return Response({"error": "message is required"}, status=400)

    conversation_id = request.data.get("conversation_id")
    if conversation_id:
        try:
            conversation = Conversation.objects.get(id=conversation_id)
        except Conversation.DoesNotExist:
            conversation = Conversation.objects.create()
    else:
        conversation = Conversation.objects.create()

    Message.objects.create(
        conversation=conversation,
        role=Message.Role.USER,
        text=message_text,
    )

    recent = list(
        conversation.messages.order_by("-created_at").values("role", "text")[:HISTORY_WINDOW]
    )
    history = [{"role": m["role"], "content": m["text"]} for m in reversed(recent)]

    result = generate_reply(history)

    Message.objects.create(
        conversation=conversation,
        role=Message.Role.ASSISTANT,
        text=result["text"],
        mood=result["mood"],
    )

    return Response(
        {
            "conversation_id": conversation.id,
            "text": result["text"],
            "mood": result["mood"],
        }
    )


@api_view(["GET"])
def health(_request: Request) -> Response:
    db_ok = False
    try:
        connection.ensure_connection()
        db_ok = True
    except Exception:
        pass
    return Response({"status": "ok", "db": "ok" if db_ok else "error"})
