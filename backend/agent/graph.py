"""Builds the LangGraph agent: model selection (reuses ModelPreference, same
as every other AI call in this app), the centralized tool registry, and a
Postgres-backed checkpointer so a paused run (interrupt(), see
agent/tools/_common.py) survives across separate Celery task invocations —
the process that pauses a run is not the same process/request that later
approves it. See agent/tasks.py for how this is actually driven.
"""

from __future__ import annotations

from functools import lru_cache

from django.conf import settings
from langgraph.checkpoint.postgres import PostgresSaver
from langgraph.prebuilt import create_react_agent
from psycopg import Connection
from psycopg.rows import dict_row

from agent.prompts import AGENT_SYSTEM_PROMPT
from agent.tools.registry import ALL_TOOLS
from core.models import ModelPreference
from core.services.providers.credentials import get_api_key


def connection_string() -> str:
    db = settings.DATABASES["default"]
    return f"postgresql://{db['USER']}:{db['PASSWORD']}@{db['HOST']}:{db['PORT']}/{db['NAME']}"


@lru_cache(maxsize=1)
def _checkpointer() -> PostgresSaver:
    """One long-lived connection per worker process. Mirrors exactly what
    PostgresSaver.from_conn_string() does internally (verified against the
    installed langgraph-checkpoint-postgres source), except the connection
    is kept open for the process's lifetime instead of a single `with`
    block, since separate Celery task invocations in the same worker need
    to share one checkpointer/connection rather than reopening per call."""
    conn = Connection.connect(connection_string(), autocommit=True, prepare_threshold=0, row_factory=dict_row)
    return PostgresSaver(conn)


def build_agent():
    """Returns a compiled LangGraph agent bound to the current model
    preference and the full tool registry. Cheap to call repeatedly — the
    checkpointer connection is memoized; only the model/graph wiring is
    rebuilt, which matters because ModelPreference can change between runs.

    NOTE: langgraph.prebuilt.create_react_agent is deprecated as of
    langgraph 1.x in favor of langchain.agents.create_agent (removal
    planned for langgraph 2.0, per a live deprecation warning on this exact
    installed version) — it still works today and behavior was verified
    live (pause/resume via interrupt(), Postgres checkpointing, real
    tool-calling against Gemini). Revisit when bumping past langgraph 1.x.
    """
    model = _build_model()
    return create_react_agent(
        model,
        tools=ALL_TOOLS,
        prompt=AGENT_SYSTEM_PROMPT,
        checkpointer=_checkpointer(),
    )


def run_config(thread_id: str) -> dict:
    return {"configurable": {"thread_id": thread_id}, "recursion_limit": settings.AGENT_MAX_STEPS}


def _build_model():
    pref = ModelPreference.current()
    api_key = get_api_key(pref.provider)
    if not api_key:
        raise RuntimeError(f"No API key configured for provider '{pref.provider}'.")

    if pref.provider == "anthropic":
        from langchain_anthropic import ChatAnthropic

        return ChatAnthropic(
            model=pref.model,
            api_key=api_key,
            max_tokens=pref.max_tokens,
            # Anthropic's temperature range is 0-1, unlike OpenAI/Gemini's 0-2
            # — same clamp as core/services/providers/anthropic_provider.py.
            temperature=min(pref.temperature, 1.0),
        )
    if pref.provider == "openai":
        from langchain_openai import ChatOpenAI

        return ChatOpenAI(
            model=pref.model, api_key=api_key, max_tokens=pref.max_tokens, temperature=pref.temperature
        )
    if pref.provider == "gemini":
        from langchain_google_genai import ChatGoogleGenerativeAI

        return ChatGoogleGenerativeAI(
            model=pref.model,
            google_api_key=api_key,
            max_output_tokens=pref.max_tokens,
            temperature=pref.temperature,
        )
    raise RuntimeError(f"Agent doesn't support provider '{pref.provider}'.")
