"""Hand-labeled cases for agent/tools/routing.py::select_tools. Same rigor
level as memory/evals/cases.py — hardcoded literals, no fixture file."""

from __future__ import annotations

# (instruction, expected matched domains — None means "expect fail-open to ALL_TOOLS")
ROUTING_CASES: list[tuple[str, set[str] | None]] = [
    ("show me my kanban board", {"kanban"}),
    ("add a task to my todo list", {"kanban"}),
    ("tailor my resume to this job description", {"cv"}),
    ("write me a cover letter", {"cv"}),
    ("post this to linkedin", {"linkedin"}),
    ("reply to the email from my professor", {"outlook"}),
    ("check my inbox", {"outlook"}),
    ("what's due for my classroom assignment", {"classroom"}),
    ("turn in my homework", {"classroom"}),
    ("check my inbox and add a follow-up task to my board", {"outlook", "kanban"}),
    ("what's the weather like today", None),
    ("tell me a joke", None),
    ("do everything for me across all my apps", None),
]
