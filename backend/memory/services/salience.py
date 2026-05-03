"""
Salience scoring — explainable, tunable, no ML.

Two public functions:
  calculate_salience  — called once at write time, stored in Chroma metadata.
  score_for_retrieval — called at read time to re-rank Chroma similarity hits.

Why a heuristic and not a model:
- Runs in <1ms on every write without stalling the Celery worker.
- Fully debuggable: when Mirabel forgets something, grep the score to see why.
- An ML approach would overfit to conversation patterns and become opaque.
"""

import re
from typing import Final

# --- Mood weight tiers --------------------------------------------------------
HIGH_EMOTION_MOODS: Final = frozenset(
    {"angry_concerned", "scolding", "flustered", "soft", "jealous", "sulking"}
)
MID_EMOTION_MOODS: Final = frozenset({"annoyed", "shy", "surprised", "smug"})
# neutral, playful, sleepy → no bonus

# --- Self-disclosure lexicon (user side only) ---------------------------------
DISCLOSURE_MARKERS: Final = (
    "i feel", "i'm feeling", "i am feeling", "i think", "i can't", "i cannot",
    "i don't", "i do not", "i had", "i have been", "i've been",
    "today i", "yesterday i", "last night", "this morning", "tonight",
    "i love", "i hate", "i miss", "i lost", "i won", "i failed",
    "i'm scared", "i'm anxious", "i'm tired", "i'm exhausted",
    "my mom", "my dad", "my brother", "my sister", "my friend",
    "my boss", "my teacher", "my partner", "my girlfriend", "my boyfriend",
)

# --- Cheap entity hints (no spaCy dependency) ---------------------------------
PROPER_NOUN_RX = re.compile(r"\b[A-Z][a-z]{2,}\b")
TIME_RX = re.compile(
    r"\b\d{1,2}[:.]\d{2}\b|"
    r"\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b|"
    r"\b(january|february|march|april|may|june|july|august|"
    r"september|october|november|december)\b",
    re.IGNORECASE,
)


def calculate_salience(*, text: str, mood: str, role: str) -> float:
    """
    Returns a salience score in [0.0, 1.0]. Higher = more worth remembering.

    Components:
      baseline        0.30
      mood weight     +0.00 / +0.15 / +0.30
      length signal   -0.20 (very short)  /  +0.10 (substantial)
      disclosure      up to +0.25 (user role only)
      entity hint     up to +0.10
      role=assistant  no bonus (model output trusted less than user truth)
      role=summary    pinned 0.90 — set by caller, not this function
    """
    score = 0.30

    if mood in HIGH_EMOTION_MOODS:
        score += 0.30
    elif mood in MID_EMOTION_MOODS:
        score += 0.15

    word_count = len(text.split())
    if word_count < 4:
        score -= 0.20
    elif word_count > 30:
        score += 0.10

    if role == "user":
        text_lower = text.lower()
        hits = sum(1 for marker in DISCLOSURE_MARKERS if marker in text_lower)
        score += min(0.25, hits * 0.08)

    entity_score = 0.0
    if PROPER_NOUN_RX.search(text):
        entity_score += 0.05
    if TIME_RX.search(text):
        entity_score += 0.05
    score += entity_score

    return max(0.0, min(1.0, round(score, 3)))


def score_for_retrieval(
    *,
    similarity: float,
    salience: float,
    age_days: float,
    half_life_days: float = 30.0,
) -> float:
    """
    Combined retrieval score for re-ranking Chroma similarity hits.

    similarity : Chroma cosine similarity [0, 1] (after distance → similarity flip).
    salience   : stored at write time [0, 1].
    age_days   : how old the memory is.

    Shape rationale:
    - similarity dominates (topical relevance first)
    - salience BOOSTS rather than gates (vivid weak match > dull strong match)
    - recency uses exponential half-life — last week feels recent, last year archived
    """
    recency = 0.5 ** (age_days / half_life_days)
    return similarity * (0.5 + 0.5 * salience) * (0.4 + 0.6 * recency)
