"""Groq Whisper wrapper. Sync client called via to_thread from the consumer."""

import io
import logging
from typing import Final

from django.conf import settings
from groq import Groq
from pydub import AudioSegment

logger = logging.getLogger(__name__)

# Whisper expects mono, 16 kHz, but Groq accepts most formats and resamples.
# We still convert WebM/Opus → WAV because Groq's WebM ingestion is occasionally
# flaky on very short clips.
_TARGET_SAMPLE_RATE: Final = 16_000

# Module-level singleton — reused across calls (all via asyncio.to_thread from
# one consumer method at a time) so the underlying HTTP connection pool is
# kept warm instead of reconnecting on every utterance.
_client: Groq | None = None


def _get_client() -> Groq:
    global _client
    if _client is None:
        _client = Groq(api_key=settings.GROQ_API_KEY)
    return _client


def _to_wav_mono16k(audio_bytes: bytes, source_format: str = "webm") -> bytes:
    seg = AudioSegment.from_file(io.BytesIO(audio_bytes), format=source_format)
    seg = seg.set_channels(1).set_frame_rate(_TARGET_SAMPLE_RATE)
    out = io.BytesIO()
    seg.export(out, format="wav")
    return out.getvalue()


def transcribe(audio_bytes: bytes, source_format: str = "webm") -> str:
    """
    Returns the transcribed text. Empty string on empty/silent input.
    Caller should call this via asyncio.to_thread.
    """
    if len(audio_bytes) < 2_000:  # < ~125ms at 16kHz mono — almost certainly silence
        return ""

    wav_bytes = _to_wav_mono16k(audio_bytes, source_format=source_format)

    resp = _get_client().audio.transcriptions.create(
        file=("audio.wav", wav_bytes, "audio/wav"),
        model=settings.GROQ_STT_MODEL,
        response_format="text",
        # language hint speeds up Whisper materially; remove for multilingual
        language="en",
        temperature=0.0,
    )
    text = (resp if isinstance(resp, str) else resp.text).strip()
    logger.info("stt: %d bytes → %d chars", len(audio_bytes), len(text))
    return text
