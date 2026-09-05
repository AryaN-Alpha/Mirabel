"""Shared text helpers: budget/capping helpers for unbounded content (raw API
responses, user-pasted text) before it reaches an LLM prompt — never truncate
silently, a model that doesn't know content was cut can confidently answer
from a partial view — plus normalize_utterance(), the exact-match text
normalizer shared by every deterministic short-utterance classifier
(voice/services/intents.py, memory/services/gating.py) so a future
normalization change (smart quotes, emoji, Unicode) only needs to land once."""

from __future__ import annotations

import csv
import io
import re

from core.services.telemetry import log_truncation

# Below this many items, encode_compact_list returns None (caller keeps the
# plain data) — the fixed cost of teaching the model a compact row format in
# the prompt/tool description only pays for itself on a large-enough array,
# per the token-optimization research this constant came out of. Same
# plain-module-constant style as agent/tools/routing.py's _MAX_DOMAINS.
_MIN_ITEMS_FOR_COMPACT_FORMAT = 5

_SENTENCE_SPLIT_RX = re.compile(r"(?<=[.!?])\s+")
_WORD_RX = re.compile(r"[a-z0-9]+")
_PUNCT_RX = re.compile(r"[^\w\s]")


def normalize_utterance(text: str) -> str:
    """Strips punctuation and lowercases — the exact-match normalization
    every deterministic short-utterance classifier in this app needs
    (voice/services/intents.py's stop/yes/no classifiers,
    memory/services/gating.py's trivial-message gate). Never produces
    apostrophes, hyphens, etc. — callers' phrase lists are written in their
    already-stripped form ("dont", not "don't")."""
    return _PUNCT_RX.sub("", text).strip().lower()


def truncate_chars(text: str, max_chars: int, *, label: str = "", call_site: str = "") -> str:
    """Returns text unchanged if it already fits. Otherwise cuts to
    max_chars and appends a visible marker naming how much was dropped, so
    the model (and anyone reading logs) knows the content is partial."""
    if not text or len(text) <= max_chars:
        return text
    omitted = len(text) - max_chars
    tag = f" from {label}" if label else ""
    log_truncation(label=label, call_site=call_site, original_chars=len(text), kept_chars=max_chars)
    return f"{text[:max_chars]}\n...[truncated{tag}, {omitted} chars omitted]"


def select_relevant_sentences(text: str, query: str, max_chars: int, *, label: str = "", call_site: str = "") -> str:
    """Extractive compression: keeps the sentences most relevant to `query`
    (by lowercase term-overlap count, no ML/embedding dependency — same
    "explainable heuristic, no ML" convention as memory/services/salience.py)
    instead of blindly cutting at a character offset. Selected sentences are
    kept in their ORIGINAL order so the result still reads coherently, not
    sorted by score.

    Only appropriate for content where losing some of it is an acceptable
    trade for staying on-topic (e.g. a job posting mixed with boilerplate) —
    NOT for content where every part is load-bearing (an assignment rubric,
    a full CV). See core/services/text_utils.py callers' docstrings for
    which case applies.

    Falls back to truncate_chars (same guarantee: never silent, never worse
    than plain truncation) when there's nothing sensible to score against
    (empty query) or no sentence breaks were found."""
    if not text or len(text) <= max_chars:
        return text
    if not query or not query.strip():
        return truncate_chars(text, max_chars, label=label, call_site=call_site)

    sentences = [s for s in _SENTENCE_SPLIT_RX.split(text.strip()) if s.strip()]
    if len(sentences) < 2:
        return truncate_chars(text, max_chars, label=label, call_site=call_site)

    query_terms = set(_WORD_RX.findall(query.lower()))
    if not query_terms:
        return truncate_chars(text, max_chars, label=label, call_site=call_site)

    scored = []
    for index, sentence in enumerate(sentences):
        sentence_terms = _WORD_RX.findall(sentence.lower())
        overlap = sum(1 for term in sentence_terms if term in query_terms)
        scored.append((overlap, index, sentence))

    # Highest-overlap first for selection, but keep original position so the
    # kept sentences can be re-sorted back into reading order afterward.
    scored.sort(key=lambda item: item[0], reverse=True)

    kept_indices: set[int] = set()
    used_chars = 0
    for _, index, sentence in scored:
        if used_chars + len(sentence) + 1 > max_chars:
            continue
        kept_indices.add(index)
        used_chars += len(sentence) + 1

    if not kept_indices:
        return truncate_chars(text, max_chars, label=label, call_site=call_site)

    ordered = [sentences[i] for i in sorted(kept_indices)]
    result = " ".join(ordered)
    omitted = len(text) - len(result)
    log_truncation(label=label, call_site=call_site, original_chars=len(text), kept_chars=len(result))
    tag = f" from {label}" if label else ""
    return f"{result}\n...[condensed via relevance extraction{tag}, {omitted} chars removed]"


def encode_compact_list(items: list[dict]) -> str | None:
    """Denser row-per-item encoding for a uniform list of dicts, cutting the
    repeated-key overhead plain JSON pays for every element (see the
    TOON-style-format research this came out of). Returns None — "not worth
    it, caller should use the plain data" — below
    _MIN_ITEMS_FOR_COMPACT_FORMAT, since the model needs a few tokens of
    row-format explanation and that only pays for itself on a big enough
    array.

    Uses the stdlib csv module rather than hand-joining with commas:
    a field value that itself contains a comma/quote/newline (an email
    subject, say) needs real CSV quoting or the model would silently
    misread which value belongs to which column — a worse outcome than not
    compacting at all."""
    if len(items) < _MIN_ITEMS_FOR_COMPACT_FORMAT:
        return None

    keys = list(items[0].keys())
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(keys)
    for item in items:
        writer.writerow(["" if item.get(k) is None else str(item.get(k)) for k in keys])

    return f"[{len(items)} items, one per line, first line is the column header]\n{buffer.getvalue().strip()}"
