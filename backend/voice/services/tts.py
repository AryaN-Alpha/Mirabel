"""edge-tts streaming wrapper. Yields MP3 audio chunks as they arrive."""

import logging
from typing import AsyncIterator

import edge_tts
from django.conf import settings

logger = logging.getLogger(__name__)


async def stream_tts(text: str) -> AsyncIterator[bytes]:
    """
    Async generator yielding MP3 bytes for the given text.
    edge-tts streams natively over its WebSocket to Microsoft.
    """
    if not text.strip():
        return

    communicate = edge_tts.Communicate(
        text=text,
        voice=settings.EDGE_TTS_VOICE,
        rate=settings.EDGE_TTS_RATE,
        pitch=settings.EDGE_TTS_PITCH,
    )
    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            yield chunk["data"]
