"""
Streaming sentence segmenter. Feed it text deltas, it yields complete
sentences as soon as they're terminated. Designed to be cheap to call on
every token.
"""

from __future__ import annotations
import re
from typing import Iterator
import pysbd

# Min chars before we'll release a "sentence" — guards against tiny fragments
# like "Tch." being sent to TTS as their own clip.
_MIN_RELEASE_CHARS = 18

# pysbd's regex-heavy segmenter is not cheap enough to re-run on every token
# delta (it was — this used to be O(sentence-length) calls per sentence,
# stalling the event loop mid-stream). A sentence boundary can only appear
# where there's terminal punctuation, so skip the expensive pass entirely
# until the buffer actually contains a candidate — safe because pysbd would
# always return a single (incomplete) sentence for punctuation-free text anyway.
_SENTENCE_END_HINT = re.compile(r"[.!?\n]")


class StreamingSentenceBuffer:
    def __init__(self) -> None:
        self._segmenter = pysbd.Segmenter(language="en", clean=False)
        self._buffer = ""

    def feed(self, delta: str) -> Iterator[str]:
        """Yields complete sentences ready to speak. Holds incomplete tail."""
        if not delta:
            return
        self._buffer += delta

        if not _SENTENCE_END_HINT.search(self._buffer):
            return

        sentences = self._segmenter.segment(self._buffer)
        if len(sentences) < 2:
            # Only one (possibly incomplete) sentence so far — keep buffering.
            return

        # All but the last are complete. The last might still be growing.
        complete, tail = sentences[:-1], sentences[-1]
        merged: list[str] = []
        pending = ""
        for s in complete:
            pending = (pending + " " + s).strip() if pending else s
            if len(pending) >= _MIN_RELEASE_CHARS:
                merged.append(pending)
                pending = ""
        if pending:
            # Carry forward to merge with the next sentence.
            tail = (pending + " " + tail).strip()

        self._buffer = tail
        for s in merged:
            yield s

    def flush(self) -> str:
        """Call at stream end. Returns whatever's left in the buffer."""
        leftover = self._buffer.strip()
        self._buffer = ""
        return leftover
