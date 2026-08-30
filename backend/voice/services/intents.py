"""Deterministic keyword classifiers for routing a finalized voice/text
utterance to a pending AgentTask decision (stop / yes / no) instead of
letting it spawn a new task. Intentionally not an LLM call — see
CLAUDE.md's "do not overuse the LLM" convention and the reliability spec's
Rule 5 (runtime enforcement) / Rule 31 (deterministic code where sufficient).

This is a narrow keyword matcher, not NLU: a paraphrase that isn't in these
lists falls through to "unclear" and the caller should ask again rather than
guess (never guess when it materially changes execution).
"""

from __future__ import annotations

from typing import Literal

from core.services.text_utils import normalize_utterance

_STOP_PHRASES = {
    "stop", "cancel", "abort", "pause", "wait",
    "never mind", "nevermind", "hold on", "stop that", "cancel that",
    "cancel it", "stop it", "abort that", "forget it",
}

_YES_PHRASES = {
    "yes", "yeah", "yep", "yup", "sure", "approve", "approved",
    "confirm", "confirmed", "go ahead", "do it", "ok", "okay",
    "sounds good", "please do",
}

_NO_PHRASES = {
    # Note: normalized text never contains apostrophes (see _normalize), so
    # these are written in their stripped form ("dont", not "don't").
    "no", "nope", "nah", "dont", "do not", "reject", "rejected",
    "cancel that", "stop that", "hold off", "dont do it",
    "never mind", "nevermind",
}

def classify_stop(text: str) -> bool:
    """True if the utterance is an explicit interrupt ("stop", "cancel", ...)."""
    normalized = normalize_utterance(text)
    if not normalized:
        return False
    return normalized in _STOP_PHRASES


def classify_yes_no(text: str) -> Literal["yes", "no", "unclear"]:
    """Classifies a short utterance as answering a yes/no confirmation prompt."""
    normalized = normalize_utterance(text)
    if not normalized:
        return "unclear"
    # "no" phrases checked first: several stop/no phrases overlap
    # ("never mind", "cancel that") and should read as a rejection here,
    # not an "unclear".
    if normalized in _NO_PHRASES:
        return "no"
    if normalized in _YES_PHRASES:
        return "yes"
    return "unclear"
