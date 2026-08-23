import os

from django.db import connection
from rest_framework.decorators import api_view, throttle_classes
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle

from core.models import Conversation, Message, ModelPreference, ProviderCredential
from core.services.llm import generate_reply
from core.services.providers import AVAILABLE_MODELS, ENV_VAR_NAMES, ProviderError, get_provider
from memory.tasks import embed_and_store

HISTORY_WINDOW = 20
MAX_MESSAGE_LENGTH = 4000


@api_view(["POST"])
@throttle_classes([AnonRateThrottle])
def chat(request: Request) -> Response:
    message_text: str = (request.data.get("message") or "").strip()
    if not message_text:
        return Response({"error": "message is required"}, status=400)
    if len(message_text) > MAX_MESSAGE_LENGTH:
        return Response({"error": f"message must be under {MAX_MESSAGE_LENGTH} characters"}, status=400)

    conversation_id = request.data.get("conversation_id")
    if conversation_id:
        try:
            conversation = Conversation.objects.get(id=conversation_id)
        except Conversation.DoesNotExist:
            conversation = Conversation.objects.create()
    else:
        conversation = Conversation.objects.create()

    user_msg = Message.objects.create(
        conversation=conversation,
        role=Message.Role.USER,
        text=message_text,
    )

    recent = list(
        conversation.messages.order_by("-created_at").values("role", "text")[:HISTORY_WINDOW]
    )
    history = [{"role": m["role"], "content": m["text"]} for m in reversed(recent)]

    result = generate_reply(history=history)

    assistant_msg = Message.objects.create(
        conversation=conversation,
        role=Message.Role.ASSISTANT,
        text=result["text"],
        mood=result["mood"],
    )

    # Fire-and-forget: embed both turns asynchronously via Celery.
    embed_and_store.delay(user_msg.id)
    embed_and_store.delay(assistant_msg.id)

    response_data = {
        "conversation_id": conversation.id,
        "text": result["text"],
        "mood": result["mood"],
    }
    if result.get("error"):
        response_data["error"] = True
        response_data["reason"] = result.get("reason", "unknown")
    return Response(response_data)


def _credential_status() -> dict[str, dict]:
    creds = {c.provider: c for c in ProviderCredential.objects.all()}
    status = {}
    for provider in AVAILABLE_MODELS:
        cred = creds.get(provider)
        if cred and cred.api_key:
            status[provider] = {"configured": True, "source": "database", "masked": cred.masked()}
        elif os.environ.get(ENV_VAR_NAMES.get(provider, ""), ""):
            status[provider] = {"configured": True, "source": "env", "masked": ""}
        else:
            status[provider] = {"configured": False, "source": None, "masked": ""}
    return status


@api_view(["GET", "PUT"])
def model_preference(request: Request) -> Response:
    pref = ModelPreference.current()

    if request.method == "GET":
        return Response(
            {
                "provider": pref.provider,
                "model": pref.model,
                "max_tokens": pref.max_tokens,
                "temperature": pref.temperature,
                "available": AVAILABLE_MODELS,
                "credentials": _credential_status(),
            }
        )

    provider = request.data.get("provider", pref.provider)
    model = (request.data.get("model", pref.model) or "").strip()

    # Any non-empty model id is accepted here — the curated AVAILABLE_MODELS
    # list is just a starting point, not the full set (see /settings/models/).
    if provider not in AVAILABLE_MODELS:
        return Response({"error": f"unknown provider: {provider!r}"}, status=400)
    if not AVAILABLE_MODELS[provider]:
        return Response({"error": f"{provider} isn't available yet"}, status=400)
    if not model:
        return Response({"error": "model is required"}, status=400)

    try:
        max_tokens = int(request.data.get("max_tokens", pref.max_tokens))
        temperature = float(request.data.get("temperature", pref.temperature))
    except (TypeError, ValueError):
        return Response({"error": "max_tokens must be an integer and temperature a number"}, status=400)
    if not (1 <= max_tokens <= 8192):
        return Response({"error": "max_tokens must be between 1 and 8192"}, status=400)
    if not (0 <= temperature <= 2):
        return Response({"error": "temperature must be between 0 and 2"}, status=400)

    pref.provider = provider
    pref.model = model
    pref.max_tokens = max_tokens
    pref.temperature = temperature
    pref.save()
    return Response(
        {
            "provider": pref.provider,
            "model": pref.model,
            "max_tokens": pref.max_tokens,
            "temperature": pref.temperature,
        }
    )


@api_view(["GET"])
def provider_models(_request: Request, provider: str) -> Response:
    if provider not in AVAILABLE_MODELS:
        return Response({"error": f"unknown provider: {provider!r}"}, status=400)
    try:
        models = get_provider(provider).list_models()
    except ProviderError as exc:
        return Response({"error": str(exc)}, status=400)
    return Response({"provider": provider, "models": sorted(models, key=lambda m: m["id"])})


@api_view(["PUT", "DELETE"])
def provider_credential(request: Request, provider: str) -> Response:
    if provider not in AVAILABLE_MODELS:
        return Response({"error": f"unknown provider: {provider!r}"}, status=400)

    if request.method == "DELETE":
        ProviderCredential.objects.filter(provider=provider).delete()
        return Response(_credential_status()[provider])

    api_key = (request.data.get("api_key") or "").strip()
    if not api_key:
        return Response({"error": "api_key is required"}, status=400)
    cred, _created = ProviderCredential.objects.get_or_create(provider=provider)
    cred.set_api_key(api_key)
    cred.save()
    return Response(_credential_status()[provider])


@api_view(["GET"])
def health(_request: Request) -> Response:
    db_ok = False
    try:
        connection.ensure_connection()
        db_ok = True
    except Exception:
        pass
    return Response({"status": "ok", "db": "ok" if db_ok else "error"})
