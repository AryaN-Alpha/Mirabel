"""Hand-labeled eval cases for the memory suites. Hardcoded Python literals
— same rigor level as salience.py's DISCLOSURE_MARKERS or
agent/tools/routing.py's _DOMAIN_KEYWORDS, both already hardcoded with no
external config file. A separate fixture file would be over-engineering for
a single-user, manually-run tool with no other consumer."""

from __future__ import annotations

# (text, expected memory.services.gating.needs_memory result)
GATING_CASES: list[tuple[str, bool]] = [
    ("hi", False),
    ("hello", False),
    ("hey", False),
    ("thanks", False),
    ("thank you", False),
    ("ok", False),
    ("okay", False),
    ("k", False),
    ("bye", False),
    ("yes", False),
    ("no", False),
    ("lol", False),
    ("k thx", False),
    ("nevermind", False),
    ("", False),
    ("what did I tell you about my sister yesterday?", True),
    ("do you remember what I said about my job interview?", True),
    ("I just got back from the doctor and I'm scared", True),
    ("why not?", True),
    ("who's that?", True),
    ("what time is it in Tokyo", True),
    ("can you help me plan my week", True),
    ("I think I'm going to quit my job", True),
    ("remind me what my dog's name is", True),
    ("no, that's not what I meant, I need help with my resume", True),
]

# Each case seeds `seed` docs into Chroma under a distinct "eval_" prefix
# (memory/evals/rag_eval.py cleans them up after the run regardless of
# outcome), queries, and checks `expect_id` lands in the retrieved top-K.
# Requires a live Chroma — skipped cleanly when unavailable.
RAG_CASES: list[dict] = [
    {
        "seed": [
            {
                "id": "dog",
                "text": "I just adopted a golden retriever puppy named Biscuit.",
                "salience": 0.7,
            },
            {
                "id": "pizza",
                "text": "My favorite pizza topping is pineapple.",
                "salience": 0.4,
            },
        ],
        "query": "what's my new dog's name?",
        "expect_id": "dog",
    },
    {
        "seed": [
            {
                "id": "thesis",
                "text": "I've been really stressed about my thesis defense next month.",
                "mood": "scolding",
                "salience": 0.8,
            },
            {
                "id": "running",
                "text": "I like going for runs in the morning.",
                "salience": 0.4,
            },
        ],
        "query": "how do I feel about my thesis defense?",
        "expect_id": "thesis",
    },
]

# (old fact text, new fact text, fact_type, expected "does new supersede old")
# Requires a live Anthropic API key — skipped cleanly when unavailable, and
# spends real tokens when it does run.
SUPERSESSION_CASES: list[tuple[str, str, str, bool]] = [
    (
        "Works at Acme as a backend engineer",
        "Left Acme and joined Globex as a backend engineer",
        "biographical",
        True,
    ),
    ("Lives in Seattle", "Moved from Seattle to Austin", "biographical", True),
    (
        "Likes coffee in the morning",
        "Likes tea in the afternoon",
        "preference",
        False,
    ),
    (
        "Has a dog named Biscuit",
        "Also has a cat named Whiskers",
        "biographical",
        False,
    ),
    (
        "Is training for a marathon in the spring",
        "Injured their knee and had to drop out of the marathon",
        "goal",
        True,
    ),
]
