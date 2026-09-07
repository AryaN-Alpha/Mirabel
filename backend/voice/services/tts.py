"""
TTS streaming wrapper.

Primary:  Cartesia Sonic 3.6 (AsyncCartesia SDK, generate() → iter_bytes()).
Fallback: edge-tts (Microsoft) — used automatically when Cartesia is
          unavailable (missing key, API error, or open circuit-breaker).
          Logged at WARNING level; the user never sees an error.

Yields MP3 audio bytes as they arrive in both paths.
"""

from __future__ import annotations

import asyncio
import atexit
import logging
import re
import time
from typing import AsyncIterator

import edge_tts
from django.conf import settings

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# UUID validation pattern — guards against bad .env values reaching the API.
# ---------------------------------------------------------------------------
_UUID_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
    re.IGNORECASE,
)

# ---------------------------------------------------------------------------
# Circuit-breaker — after _CB_THRESHOLD consecutive Cartesia failures the
# circuit opens and all requests use edge-tts for _CB_COOLDOWN_SECS seconds
# before trying Cartesia again.  Resets on the first successful call.
# No lock needed: in a single-threaded asyncio loop, the read-modify-write
# on these scalars is atomic between await points.
# ---------------------------------------------------------------------------
_CB_THRESHOLD = 3
_CB_COOLDOWN_SECS = 60.0

_cb_failures: int = 0
_cb_open_until: float = 0.0        # monotonic time; 0.0 == circuit closed


def _circuit_is_open() -> bool:
    """Return True if Cartesia should be skipped (circuit tripped)."""
    global _cb_failures, _cb_open_until
    if _cb_open_until == 0.0:
        return False
    if time.monotonic() >= _cb_open_until:
        # Cool-down elapsed — reset and allow the next request to retry.
        _cb_failures = 0
        _cb_open_until = 0.0
        logger.info("cartesia: circuit-breaker reset — retrying Cartesia")
        return False
    return True


def _record_success() -> None:
    global _cb_failures, _cb_open_until
    if _cb_failures > 0:
        logger.info("cartesia: recovered after %d failure(s) — circuit closed", _cb_failures)
    _cb_failures = 0
    _cb_open_until = 0.0


def _record_failure() -> None:
    global _cb_failures, _cb_open_until
    _cb_failures += 1
    if _cb_failures >= _CB_THRESHOLD:
        _cb_open_until = time.monotonic() + _CB_COOLDOWN_SECS
        logger.warning(
            "cartesia: %d consecutive failure(s) — circuit open for %.0fs, "
            "falling back to edge-tts until then",
            _cb_failures,
            _CB_COOLDOWN_SECS,
        )


# ---------------------------------------------------------------------------
# Cartesia async client — instantiated lazily on first use so startup never
# fails when CARTESIA_API_KEY is unset.  A module-level asyncio.Lock()
# prevents concurrent coroutines from racing to create it twice.
# In Python 3.10+ Lock() needs no running event loop at creation time.
# ---------------------------------------------------------------------------
_cartesia_client = None
_cartesia_init_lock: asyncio.Lock = asyncio.Lock()


async def _get_cartesia_client():
    """Return a cached AsyncCartesia instance, or None if unavailable."""
    global _cartesia_client

    api_key = getattr(settings, "CARTESIA_API_KEY", "")
    if not api_key:
        return None

    # Fast path — already initialised.
    if _cartesia_client is not None:
        return _cartesia_client

    async with _cartesia_init_lock:
        # Re-check inside the lock: another coroutine may have beaten us.
        if _cartesia_client is not None:
            return _cartesia_client
        try:
            from cartesia import AsyncCartesia  # noqa: PLC0415

            _cartesia_client = AsyncCartesia(api_key=api_key)
            atexit.register(_close_cartesia_client)
            logger.info("cartesia: AsyncCartesia client initialised")
        except Exception as exc:
            # Do NOT use exc_info=True here: the exception message from some
            # SDK versions may include the Authorization header, leaking the
            # API key into log files.
            logger.warning(
                "cartesia: failed to initialise AsyncCartesia client (%s: %s) "
                "— will use edge-tts",
                type(exc).__name__,
                str(exc)[:120],
            )
    return _cartesia_client


def _close_cartesia_client() -> None:
    """atexit hook — best-effort close of the underlying HTTP connection pool."""
    client = _cartesia_client
    if client is None:
        return
    try:
        # close() is synchronous in the httpx-based Cartesia SDK.
        if not client.is_closed:
            asyncio.get_event_loop().run_until_complete(client.close())
    except Exception:
        pass  # We're in atexit; errors here are not actionable.


# ---------------------------------------------------------------------------
# Public interface — used by voice/consumers.py::_tts_worker
# ---------------------------------------------------------------------------

async def stream_tts(text: str) -> AsyncIterator[bytes]:
    """
    Async generator that yields MP3 bytes for *text*.

    1. If the circuit-breaker is open, goes straight to edge-tts.
    2. Otherwise tries Cartesia; on failure increments the circuit-breaker
       counter and falls back to edge-tts.
    3. On success resets the circuit-breaker.
    """
    if not text.strip():
        return

    if _circuit_is_open():
        async for chunk in _edge_tts_stream(text):
            yield chunk
        return

    client = await _get_cartesia_client()
    if client is not None:
        try:
            async for chunk in _cartesia_stream(client, text):
                yield chunk
            _record_success()
            return
        except Exception:
            logger.warning(
                "cartesia: TTS failed — falling back to edge-tts for %r",
                text[:80],
                # No exc_info: avoids leaking internals; WARNING + text is enough
                # to correlate in logs.
            )
            _record_failure()
        # Fall through to edge-tts.

    async for chunk in _edge_tts_stream(text):
        yield chunk


# ---------------------------------------------------------------------------
# Cartesia path — uses the current generate() API (bytes() was deprecated).
# Chunks are yielded as they stream in from the HTTP response, giving the
# lowest possible time-to-first-byte over the WebSocket.
# ---------------------------------------------------------------------------

async def _cartesia_stream(client, text: str) -> AsyncIterator[bytes]:
    """Stream MP3 audio from Cartesia Sonic, yielding chunks as they arrive."""
    raw_voice_id = getattr(settings, "CARTESIA_VOICE_ID", "f6ff7c0c-e396-40a9-a70b-f7607edb6937")
    model_id = getattr(settings, "CARTESIA_MODEL_ID", "sonic-3.6")
    language = getattr(settings, "CARTESIA_LANGUAGE", "en")

    # Validate voice ID is a UUID before sending to the API.
    if not _UUID_RE.match(raw_voice_id):
        raise ValueError(
            f"CARTESIA_VOICE_ID is not a valid UUID: {raw_voice_id!r} — "
            "check your .env file."
        )

    # The SDK accepts voice as Union[str, TTSRequestVoiceObject]; a plain
    # UUID string is the documented short-form.
    response = await client.tts.generate(
        model_id=model_id,
        transcript=text,
        voice=raw_voice_id,
        output_format={
            "container": "mp3",
            "bit_rate": 128000,
            "sample_rate": 44100,
        },
        language=language,
    )
    async for chunk in response.iter_bytes():
        if chunk:
            yield chunk


# ---------------------------------------------------------------------------
# edge-tts fallback path (unchanged from original)
# ---------------------------------------------------------------------------

async def _edge_tts_stream(text: str) -> AsyncIterator[bytes]:
    """Stream MP3 audio from edge-tts (Microsoft)."""
    communicate = edge_tts.Communicate(
        text=text,
        voice=settings.EDGE_TTS_VOICE,
        rate=settings.EDGE_TTS_RATE,
        pitch=settings.EDGE_TTS_PITCH,
    )
    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            yield chunk["data"]
