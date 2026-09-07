"""
TTS key vault + config REST API.

Endpoints:
  GET  /api/tts/keys/          — list all vault keys (masked)
  POST /api/tts/keys/          — create a new key
  GET  /api/tts/keys/<id>/     — retrieve one key (masked)
  PUT  /api/tts/keys/<id>/     — update name and/or api_key
  DELETE /api/tts/keys/<id>/   — delete a key
  POST /api/tts/keys/<id>/activate/ — make this key the active one
  POST /api/tts/keys/<id>/test/     — ping Cartesia to validate the key
  GET  /api/tts/config/        — get active model_id + language
  PUT  /api/tts/config/        — update model_id + language
"""

from __future__ import annotations

import asyncio

from django.conf import settings
from rest_framework.decorators import api_view
from rest_framework.request import Request
from rest_framework.response import Response

from voice.models import CartesiaTTSKey

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_CARTESIA_MODELS = [
    {"id": "sonic-3.6", "label": "Sonic 3.6 — latest (recommended)"},
    {"id": "sonic-3",   "label": "Sonic 3 — stable"},
    {"id": "sonic-2",   "label": "Sonic 2 — legacy"},
    {"id": "sonic",     "label": "Sonic — legacy (alias)"},
]

_CARTESIA_LANGUAGES = [
    {"code": "en", "label": "English"},
    {"code": "es", "label": "Spanish"},
    {"code": "fr", "label": "French"},
    {"code": "de", "label": "German"},
    {"code": "ja", "label": "Japanese"},
    {"code": "pt", "label": "Portuguese"},
    {"code": "zh", "label": "Chinese"},
    {"code": "ko", "label": "Korean"},
    {"code": "hi", "label": "Hindi"},
    {"code": "it", "label": "Italian"},
    {"code": "nl", "label": "Dutch"},
    {"code": "pl", "label": "Polish"},
    {"code": "ru", "label": "Russian"},
    {"code": "tr", "label": "Turkish"},
    {"code": "sv", "label": "Swedish"},
]


def _key_data(key: CartesiaTTSKey) -> dict:
    return {
        "id": key.id,
        "name": key.name,
        "masked": key.masked(),
        "is_active": key.is_active,
        "status": key.status,
        "status_note": key.status_note,
        "created_at": key.created_at.isoformat(),
        "updated_at": key.updated_at.isoformat(),
    }


# ---------------------------------------------------------------------------
# /api/tts/keys/
# ---------------------------------------------------------------------------

@api_view(["GET", "POST"])
def tts_keys(request: Request) -> Response:
    if request.method == "GET":
        keys = CartesiaTTSKey.objects.all()
        return Response({
            "keys": [_key_data(k) for k in keys],
            "env_key_configured": bool(getattr(settings, "CARTESIA_API_KEY", "")),
        })

    # POST — create new key
    name = (request.data.get("name") or "").strip()
    raw_key = (request.data.get("api_key") or "").strip()
    if not name:
        return Response({"error": "name is required"}, status=400)
    if not raw_key:
        return Response({"error": "api_key is required"}, status=400)

    key = CartesiaTTSKey(name=name)
    key.set_api_key(raw_key)
    # If this is the first key being added, auto-activate it so the feature
    # works immediately without a second click.
    if not CartesiaTTSKey.objects.exists():
        key.is_active = True
    key.save()
    return Response(_key_data(key), status=201)


# ---------------------------------------------------------------------------
# /api/tts/keys/<id>/
# ---------------------------------------------------------------------------

@api_view(["GET", "PUT", "DELETE"])
def tts_key_detail(request: Request, key_id: int) -> Response:
    try:
        key = CartesiaTTSKey.objects.get(pk=key_id)
    except CartesiaTTSKey.DoesNotExist:
        return Response({"error": "key not found"}, status=404)

    if request.method == "GET":
        return Response(_key_data(key))

    if request.method == "DELETE":
        was_active = key.is_active
        key.delete()
        # If the deleted key was active, try to promote the oldest remaining key.
        if was_active:
            oldest = CartesiaTTSKey.objects.first()
            if oldest:
                oldest.is_active = True
                oldest.save(update_fields=["is_active"])
        return Response({"deleted": True})

    # PUT — update name and/or api_key
    if "name" in request.data:
        name = (request.data["name"] or "").strip()
        if not name:
            return Response({"error": "name cannot be empty"}, status=400)
        key.name = name
    if "api_key" in request.data:
        raw_key = (request.data["api_key"] or "").strip()
        if not raw_key:
            return Response({"error": "api_key cannot be empty"}, status=400)
        key.set_api_key(raw_key)
    key.save()
    return Response(_key_data(key))


# ---------------------------------------------------------------------------
# /api/tts/keys/<id>/activate/
# ---------------------------------------------------------------------------

@api_view(["POST"])
def tts_key_activate(request: Request, key_id: int) -> Response:
    try:
        CartesiaTTSKey.objects.get(pk=key_id)
    except CartesiaTTSKey.DoesNotExist:
        return Response({"error": "key not found"}, status=404)
    key = CartesiaTTSKey.activate(key_id)
    return Response(_key_data(key))


# ---------------------------------------------------------------------------
# /api/tts/keys/<id>/test/
# ---------------------------------------------------------------------------

@api_view(["POST"])
def tts_key_test(request: Request, key_id: int) -> Response:
    """
    Validate a key by making a tiny real Cartesia TTS call ("Hi").
    Updates the key's status field in the DB and returns the result.
    """
    try:
        key = CartesiaTTSKey.objects.get(pk=key_id)
    except CartesiaTTSKey.DoesNotExist:
        return Response({"error": "key not found"}, status=404)

    raw_key = key.get_api_key()
    if not raw_key:
        return Response({"error": "no api_key stored for this entry"}, status=400)

    ok, note = _test_cartesia_key_sync(raw_key)
    key.status = CartesiaTTSKey.Status.OK if ok else CartesiaTTSKey.Status.ERROR
    key.status_note = note[:200]
    key.save(update_fields=["status", "status_note", "updated_at"])
    return Response(_key_data(key))


def _test_cartesia_key_sync(raw_key: str) -> tuple[bool, str]:
    """Run a tiny Cartesia TTS call synchronously (runs in a new event loop)."""
    try:
        result = asyncio.run(_test_cartesia_key_async(raw_key))
        return result
    except Exception as exc:
        return False, str(exc)[:200]


async def _test_cartesia_key_async(raw_key: str) -> tuple[bool, str]:
    try:
        from cartesia import AsyncCartesia  # noqa: PLC0415
    except ImportError:
        return False, "cartesia package not installed"

    client = AsyncCartesia(api_key=raw_key)
    try:
        voice_id = getattr(settings, "CARTESIA_VOICE_ID", "f6ff7c0c-e396-40a9-a70b-f7607edb6937")
        model_id = getattr(settings, "CARTESIA_MODEL_ID", "sonic-3.6")
        response = await client.tts.generate(
            model_id=model_id,
            transcript="Hi",
            voice=voice_id,
            output_format={"container": "mp3", "bit_rate": 128000, "sample_rate": 44100},
            language="en",
        )
        # Consume a single chunk to confirm the key is valid.
        async for _chunk in response.iter_bytes():
            break
        return True, "Key is valid and working."
    except Exception as exc:
        msg = str(exc)
        # Detect quota / billing errors to set the right status.
        low = msg.lower()
        if any(w in low for w in ("quota", "credit", "rate limit", "402", "429")):
            return False, f"Quota / billing issue: {msg[:160]}"
        return False, msg[:200]
    finally:
        await client.close()


# ---------------------------------------------------------------------------
# /api/tts/config/
# ---------------------------------------------------------------------------

@api_view(["GET", "PUT"])
def tts_config(request: Request) -> Response:
    if request.method == "GET":
        return Response({
            "model_id": getattr(settings, "CARTESIA_MODEL_ID", "sonic-3.6"),
            "language": getattr(settings, "CARTESIA_LANGUAGE", "en"),
            "available_models": _CARTESIA_MODELS,
            "available_languages": _CARTESIA_LANGUAGES,
        })

    # PUT — runtime override stored in Django's module-level settings object.
    # This does NOT write to .env — it's an in-process override that persists
    # only until the next server restart.  A future enhancement could persist
    # this to a singleton DB row like ModelPreference.
    model_id = (request.data.get("model_id") or "").strip()
    language = (request.data.get("language") or "").strip()
    valid_model_ids = {m["id"] for m in _CARTESIA_MODELS}
    valid_langs = {l["code"] for l in _CARTESIA_LANGUAGES}

    if model_id and model_id not in valid_model_ids:
        return Response({"error": f"unknown model_id: {model_id!r}"}, status=400)
    if language and language not in valid_langs:
        return Response({"error": f"unknown language: {language!r}"}, status=400)

    if model_id:
        settings.CARTESIA_MODEL_ID = model_id
    if language:
        settings.CARTESIA_LANGUAGE = language

    return Response({
        "model_id": getattr(settings, "CARTESIA_MODEL_ID", "sonic-3.6"),
        "language": getattr(settings, "CARTESIA_LANGUAGE", "en"),
        "available_models": _CARTESIA_MODELS,
        "available_languages": _CARTESIA_LANGUAGES,
    })
