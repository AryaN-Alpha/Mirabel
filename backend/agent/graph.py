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
from langchain_core.messages import AIMessage, ToolMessage
from langgraph.checkpoint.postgres import PostgresSaver
from langgraph.prebuilt import create_react_agent
from psycopg import Connection
from psycopg.rows import dict_row

from agent.prompts import AGENT_SYSTEM_PROMPT
from agent.tools.registry import ALL_TOOLS
from core.models import ModelPreference
from core.services.providers.credentials import get_api_key
from core.services.providers.model_select import fast_model_for
from core.services.telemetry import log_optimization_event

# Caps how many of the run's accumulated messages are sent to the LLM on
# each iteration (see _trim_agent_messages) — a safety net for pathological
# long tool-call chains, not the common case now that agent/tools/routing.py
# keeps most tasks focused. AGENT_MAX_STEPS bounds the *number* of tool-call
# round trips; this bounds how much of that history gets resent each time.
_MAX_AGENT_MESSAGES = 20

# See core/services/providers/model_select.py for why: in the agent loop the
# DeepSeek reasoning-tax problem is worse than a malformed-JSON failure — a
# mid-tool-call-chain turn can get truncated into a plain AIMessage with no
# tool_calls, which create_react_agent then treats as a legitimate final
# answer: the run stops and reports success (or invents a plausible-sounding
# one) without ever having called the tool that would've actually done the
# thing. Live-observed with "play me a song from the library": the model
# called get_spotify_saved_tracks, then stopped and claimed a track was
# playing without ever calling play_spotify_item.


def _group_messages(messages: list) -> list[list]:
    """Clusters each AIMessage-with-tool_calls together with the
    ToolMessage(s) it produced, so trimming can never split a pair —
    Anthropic/OpenAI reject a request with a tool_use lacking its
    tool_result (or vice versa). Every other message is its own group."""
    groups: list[list] = []
    for msg in messages:
        if isinstance(msg, ToolMessage) and groups and isinstance(groups[-1][-1], (AIMessage, ToolMessage)):
            groups[-1].append(msg)
        else:
            groups.append([msg])
    return groups


def _trim_agent_messages(state: dict) -> dict:
    """pre_model_hook: bounds what's sent to the LLM on each agent-loop
    iteration without touching the checkpointed state — returns
    llm_input_messages only, so a resumed/replayed run still sees its full
    history. Always keeps the first message (the original instruction) plus
    as many of the most recent whole tool-call groups as fit the budget."""
    messages = state["messages"]
    if len(messages) <= _MAX_AGENT_MESSAGES:
        log_optimization_event(category="agent_trim", outcome="not_trimmed", count=len(messages), extra=len(messages))
        return {"llm_input_messages": messages}

    groups = _group_messages(messages)
    first_group, rest = groups[0], groups[1:]
    budget = _MAX_AGENT_MESSAGES - len(first_group)
    kept: list = []
    for group in reversed(rest):
        if len(group) > budget:
            # Skip this one oversized group, not the whole rest of the scan
            # — an older group further back may still be small enough to
            # fit. `continue` (not `break`) is what makes this actually
            # "as many of the most recent whole tool-call groups as fit the
            # budget" (see docstring) rather than all-or-nothing on
            # whichever single group happens to be checked first.
            continue
        kept = group + kept
        budget -= len(group)
    sent = first_group + kept
    log_optimization_event(category="agent_trim", outcome="trimmed", count=len(messages), extra=len(sent))
    return {"llm_input_messages": sent}


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


def build_agent(tools: list | None = None):
    """Returns a compiled LangGraph agent bound to the current model
    preference and the given tool list (defaults to the full registry when
    `tools` is omitted, preserving prior behavior for any caller that
    doesn't route). Cheap to call repeatedly — the checkpointer connection
    is memoized; only the model/graph wiring is rebuilt, which matters
    because ModelPreference can change between runs.

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
        tools=tools if tools is not None else ALL_TOOLS,
        prompt=AGENT_SYSTEM_PROMPT,
        checkpointer=_checkpointer(),
        pre_model_hook=_trim_agent_messages,
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
    if pref.provider == "deepseek":
        from langchain_openai import ChatOpenAI

        from core.services.providers.deepseek_provider import DEEPSEEK_BASE_URL

        # DeepSeek exposes an OpenAI-compatible API — point ChatOpenAI at their
        # base URL. langchain-openai supports this via openai_api_base / base_url.
        # model=fast_model_for(pref), not pref.model directly — see
        # core/services/providers/model_select.py.
        return ChatOpenAI(
            model=fast_model_for(pref),
            api_key=api_key,
            base_url=DEEPSEEK_BASE_URL,
            max_tokens=pref.max_tokens,
            temperature=pref.temperature,
        )
    raise RuntimeError(f"Agent doesn't support provider '{pref.provider}'.")
