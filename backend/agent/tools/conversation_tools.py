"""A domain-agnostic tool for pausing a run to ask the human a question,
rather than guessing at an underspecified instruction. Lives in its own
module (not agent/tools/_common.py, which is shared helpers other tool
modules import, not itself a tool module) per the convention in
agent/tools/registry.py."""

from __future__ import annotations

from langchain_core.tools import tool
from langgraph.types import interrupt


@tool
def ask_clarifying_question(question: str) -> str:
    """Pause and ask the user a clarifying question when the instruction is
    ambiguous or missing information you need to act correctly. Ask one
    focused question at a time — you may call this again if the answer
    raises a further question, but don't ask about anything you can
    reasonably infer or default.

    Args:
        question: The specific question to ask, in character, as it should
            be shown/spoken to the user.

    Returns:
        The user's answer, as plain text.
    """
    decision = interrupt({"kind": "clarify", "question": question})
    if isinstance(decision, dict):
        return str(decision.get("answer") or "").strip() or "The user gave no answer."
    return "The user gave no answer."


TOOLS = [ask_clarifying_question]
