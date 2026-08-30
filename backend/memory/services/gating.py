"""Deterministic "does this turn need memory retrieval" gate.

Same spirit and style as voice/services/intents.py's keyword classifiers:
narrow, explainable, and intentionally conservative. This is not an intent
classifier for the message's meaning — it only screens out the subset of
turns that are confidently trivial (greetings, acks, filler) so the common
case of unconditional Chroma retrieval on every single turn (including "hi"
and "ok") stops being pure waste. Anything not confidently trivial falls
through to `True` — retrieval still runs, exactly as it does today. When
unsure, retrieve; never guess a real question doesn't need memory.
"""

from __future__ import annotations

from core.services.text_utils import normalize_utterance

_TRIVIAL_PHRASES = {
    "hi", "hello", "hey", "hiya", "yo",
    "good morning", "good afternoon", "good evening", "good night",
    "bye", "goodbye", "see you", "later",
    "thanks", "thank you", "thanks a lot", "ty", "thx",
    "ok", "okay", "k", "kk", "alright", "cool", "nice", "great", "sure",
    "yes", "yeah", "yep", "yup", "no", "nope", "nah",
    "lol", "haha", "hmm", "hmmm", "uh", "um", "umm", "ah",
    "stop", "cancel", "pause", "wait", "never mind", "nevermind",
}

def needs_memory(text: str) -> bool:
    """False only for confidently trivial input (empty, or an exact match
    against a fixed greeting/filler/ack list). True for everything else,
    including anything that doesn't match — fail open to today's behavior."""
    normalized = normalize_utterance(text)
    if not normalized:
        return False
    if normalized in _TRIVIAL_PHRASES:
        return False
    # Very short non-trivial utterances ("k thx", "lol ok") are still almost
    # certainly filler — but only collapse-them if every word individually
    # is itself a known trivial word, to avoid swallowing short real
    # questions ("why not?", "who's that").
    words = normalized.split()
    if len(words) <= 3 and words and all(w in _TRIVIAL_PHRASES for w in words):
        return False
    return True
