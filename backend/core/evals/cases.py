"""Hand-labeled cases for the compression suite. Hardcoded Python literals
— same rigor level as memory/evals/cases.py and agent/evals/cases.py."""

from __future__ import annotations

# (text, query, max_chars, terms that must survive extraction)
EXTRACTION_CASES: list[tuple[str, str, int, list[str]]] = [
    (
        "We are a fast-growing startup that values collaboration and fun. "
        "You must have 5+ years of experience with Python and Django. "
        "We offer competitive benefits and a great culture. "
        "Experience with PostgreSQL and Celery is required. "
        "Equal opportunity employer, come join our amazing team!",
        "Backend engineer with Python, Django, PostgreSQL, and Celery experience.",
        140,
        ["python", "django", "postgresql", "celery"],
    ),
    (
        "Join our mission-driven team and help change the world. "
        "We need someone skilled in React and TypeScript for our frontend. "
        "Free snacks, ping pong table, and unlimited PTO. "
        "Must know GraphQL and have shipped production React apps.",
        "Frontend developer experienced with React, TypeScript, and GraphQL.",
        130,
        ["react", "typescript", "graphql"],
    ),
]

# Uniform lists of dicts to exercise encode_compact_list, including one case
# with a comma/quote/newline embedded in a field value — the correctness-
# critical edge case for the CSV-based encoder.
COMPACT_LIST_CASES: list[list[dict]] = [
    [
        {"id": i, "subject": f"Message {i}", "sender": f"user{i}@example.com", "unread": i % 2 == 0}
        for i in range(6)
    ],
    [
        {"id": 1, "subject": "Hi, quick question", "sender": "a@example.com", "unread": True},
        {"id": 2, "subject": 'Re: "Q3 plan" update, thanks', "sender": "b@example.com", "unread": False},
        {"id": 3, "subject": "Multi-line\nsubject test", "sender": "c@example.com", "unread": True},
        {"id": 4, "subject": "Normal subject", "sender": "d@example.com", "unread": False},
        {"id": 5, "subject": "Another one", "sender": "e@example.com", "unread": True},
    ],
]

# Below the size gate — encode_compact_list must return None for these.
SMALL_COMPACT_LIST_CASES: list[list[dict]] = [
    [{"id": 1, "title": "Task A"}, {"id": 2, "title": "Task B"}],
    [],
]
