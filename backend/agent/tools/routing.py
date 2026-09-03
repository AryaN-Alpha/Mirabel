"""Deterministic tool-domain routing for agent mode.

agent/tools/registry.py binds ALL_TOOLS (36 schemas) on every single
agent-mode request today, regardless of what the instruction is actually
about — pure tool-schema token overhead on every turn. This is a keyword
router, not an LLM call (same "deterministic where sufficient" convention as
voice/services/intents.py and memory/services/gating.py): it maps the
instruction text to a subset of domains and only binds those domains' tools.

Fail-open by design: if the instruction doesn't clearly belong to a small
number of domains, this returns the full tool set unchanged. Under-provisioning
a real task to save a few thousand tokens is a worse trade than this module
existing at all — never guess a task doesn't need a tool.
"""

from __future__ import annotations

import re

from agent.tools import (
    classroom_tools,
    conversation_tools,
    cv_tools,
    kanban_tools,
    linkedin_tools,
    memory_tools,
    outlook_tools,
    spotify_tools,
)
from agent.tools.registry import ALL_TOOLS
from core.services.telemetry import log_optimization_event

# Tools every task can reach regardless of domain: memory lookup and
# clarifying-question are cheap (3 schemas total) and not domain-specific.
_ALWAYS_ON = memory_tools.TOOLS + conversation_tools.TOOLS

_DOMAIN_KEYWORDS: dict[str, tuple[str, ...]] = {
    "kanban": (
        "task", "tasks", "todo", "to-do", "kanban", "board", "column",
        "project board", "card",
    ),
    "cv": (
        "cv", "resume", "résumé", "cover letter", "tailor", "job description",
        "job posting", "experience section", "skills section",
    ),
    "linkedin": (
        "linkedin", "li post", "post to linkedin", "comment on", "connections",
    ),
    "outlook": (
        "outlook", "email", "e-mail", "inbox", "mailbox", "reply to",
        "send an email", "compose",
    ),
    "classroom": (
        "classroom", "assignment", "coursework", "turn in", "google classroom",
        "homework",
    ),
    "spotify": (
        "spotify", "playlist", "song", "songs", "track", "album", "artist",
        "play music", "currently playing", "now playing", "queue", "shuffle",
        "repeat", "volume", "skip", "device", "follow", "liked songs",
    ),
}

_DOMAIN_TOOLS: dict[str, list] = {
    "kanban": kanban_tools.TOOLS,
    "cv": cv_tools.TOOLS,
    "linkedin": linkedin_tools.TOOLS,
    "outlook": outlook_tools.TOOLS,
    "classroom": classroom_tools.TOOLS,
    "spotify": spotify_tools.TOOLS,
}

_MAX_DOMAINS = 2


def _matched_domains(instruction: str) -> set[str]:
    text = instruction.lower()
    matched = set()
    for domain, keywords in _DOMAIN_KEYWORDS.items():
        if any(re.search(rf"\b{re.escape(kw)}\b", text) for kw in keywords):
            matched.add(domain)
    return matched


def select_tools(instruction: str) -> list:
    """Returns the tool list to bind for this instruction. Falls open to
    ALL_TOOLS when zero domains match (nothing recognized — don't guess) or
    more than _MAX_DOMAINS match (a genuinely cross-domain/ambiguous task)."""
    domains = _matched_domains(instruction or "")
    if not domains or len(domains) > _MAX_DOMAINS:
        log_optimization_event(category="tool_routing", outcome="full", count=len(ALL_TOOLS))
        return ALL_TOOLS

    tools = list(_ALWAYS_ON)
    for domain in domains:
        tools.extend(_DOMAIN_TOOLS[domain])
    log_optimization_event(category="tool_routing", outcome="routed", count=len(tools), extra=len(ALL_TOOLS))
    return tools
