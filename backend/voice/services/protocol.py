"""Sentinel parsing for the streaming persona output."""

from __future__ import annotations
import json
import logging

logger = logging.getLogger(__name__)

SENTINEL = "<<<META>>>"
ALLOWED_MOODS = {
    "neutral", "playful", "smug", "jealous", "sulking", "annoyed",
    "angry_concerned", "scolding", "flustered", "soft", "shy", "surprised", "sleepy",
}


class ProtocolParser:
    """
    Stateful parser for the streamed `text<<<META>>>{json}` format.

    Use:
        p = ProtocolParser()
        for delta in stream:
            speakable = p.feed(delta)   # text safe to send to TTS, never includes sentinel/JSON
            if speakable:
                ...
        text, mood = p.finalize()
    """

    def __init__(self) -> None:
        self._buffer = ""
        self._sentinel_seen = False
        self._spoken_so_far = ""

    def feed(self, delta: str) -> str:
        """Return text safe to forward to TTS/UI. Never returns sentinel content."""
        if self._sentinel_seen:
            self._buffer += delta
            return ""

        self._buffer += delta
        idx = self._buffer.find(SENTINEL)
        if idx == -1:
            # Hold back the last len(SENTINEL)-1 chars in case the sentinel is
            # being typed across a delta boundary.
            safe_cut = max(0, len(self._buffer) - (len(SENTINEL) - 1))
            speakable = self._buffer[:safe_cut]
            self._buffer = self._buffer[safe_cut:]
            self._spoken_so_far += speakable
            return speakable

        # Sentinel found — flush everything before it, freeze further output.
        speakable = self._buffer[:idx]
        self._buffer = self._buffer[idx + len(SENTINEL):]
        self._sentinel_seen = True
        self._spoken_so_far += speakable
        return speakable

    def flush_pre_sentinel(self) -> str:
        """Call after the streaming loop ends, before finalize().

        Returns any text still held back by the sentinel-boundary guard.
        If the sentinel was already seen (normal case), returns "".

        Without this call, the last len(SENTINEL)-1 characters of a response
        that never emits the sentinel (e.g. the model hit max_tokens, or a
        provider doesn't follow the sentinel protocol) are silently lost from
        TTS and text_delta — they stay in _buffer and only surface in
        finalize()'s full_text, which by then is too late for audio.
        """
        if self._sentinel_seen:
            return ""
        # Everything remaining in the buffer is speakable — no sentinel
        # appeared, so these chars were only held back as a precaution.
        speakable = self._buffer
        self._spoken_so_far += speakable
        self._buffer = ""
        return speakable

    def finalize(self) -> tuple[str, str]:
        """Returns (full_spoken_text, mood). Tolerates malformed JSON."""
        if not self._sentinel_seen:
            # Model never emitted sentinel — treat whole output as text.
            text = (self._spoken_so_far + self._buffer).strip()
            return text, "neutral"

        meta_raw = self._buffer.strip()
        mood = "neutral"
        try:
            obj = json.loads(meta_raw)
            candidate = str(obj.get("mood", "")).lower().strip()
            if candidate in ALLOWED_MOODS:
                mood = candidate
            else:
                logger.warning("invalid streamed mood %r — defaulting to neutral", candidate)
        except json.JSONDecodeError:
            logger.warning("streamed meta JSON parse failed: %r", meta_raw[:200])

        return self._spoken_so_far.strip(), mood
