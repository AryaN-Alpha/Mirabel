"""Celery entry points for running/resuming an autonomous agent task on the
dedicated 'agent' queue (single worker for now — see mirabel/celery.py, and
`celery -A mirabel worker -Q agent --concurrency=1`). Both tasks share the
same three-outcome handling: the compiled graph either pauses on
interrupt() (agent/tools/_common.py — an irreversible action awaiting human
approval), completes, or raises.

Per-task time_limit/soft_time_limit/queue are set on the decorator rather
than in the global CELERY_TASK_TIME_LIMIT/SOFT_TIME_LIMIT settings, which
stay correct (60s/45s) for the existing short-lived memory/outlook tasks —
a multi-tool-call agent run needs minutes, not seconds.
"""

from __future__ import annotations

import logging
import time

from celery import shared_task
from django.conf import settings
from django.utils import timezone
from langgraph.types import Command

from agent.graph import build_agent, run_config
from agent.models import AgentTask
from agent.tools.links import resolve_result_link
from agent.tools.routing import select_tools
from core.models import Message, ModelPreference
from core.services.telemetry import log_llm_call
from voice.services.protocol import ProtocolParser

logger = logging.getLogger("agent.tasks")

_TIME_LIMIT = settings.AGENT_TASK_TIME_LIMIT
_SOFT_TIME_LIMIT = settings.AGENT_TASK_SOFT_TIME_LIMIT


@shared_task(
    name="agent.tasks.run_agent_task",
    queue="agent",
    time_limit=_TIME_LIMIT,
    soft_time_limit=_SOFT_TIME_LIMIT,
)
def run_agent_task(agent_task_id: int) -> None:
    task = AgentTask.objects.get(pk=agent_task_id)
    task.status = AgentTask.Status.RUNNING
    task.started_at = timezone.now()
    task.current_step = ""
    task.save(update_fields=["status", "started_at", "current_step"])

    try:
        _run_graph(task, {"messages": [("user", task.instruction)]})
    except Exception:
        _fail(task, "Something went wrong running that.")


@shared_task(
    name="agent.tasks.resume_agent_task",
    queue="agent",
    time_limit=_TIME_LIMIT,
    soft_time_limit=_SOFT_TIME_LIMIT,
)
def resume_agent_task(agent_task_id: int, resume_value: dict) -> None:
    """`resume_value` is handed straight to Command(resume=...) — its shape
    depends on what kind of pause is being resumed (see agent/views.py):
    {"approved": bool, "args": dict | None} for a confirmation, or
    {"answer": str} for a clarifying question."""
    task = AgentTask.objects.get(pk=agent_task_id)
    task.status = AgentTask.Status.RUNNING
    task.pending_action = None
    task.current_step = ""
    task.save(update_fields=["status", "pending_action", "current_step"])

    try:
        _run_graph(task, Command(resume=resume_value))
    except Exception:
        _fail(task, "Something went wrong resuming that.")


def _run_graph(task: AgentTask, graph_input) -> None:
    """Drives the graph with .stream() instead of .invoke() so each tool
    call updates AgentTask.current_step/steps as it happens, rather than
    the whole run being an opaque black box until it finishes or pauses —
    see _record_step. stream_mode="updates" yields one {node_name: update}
    dict per super-step, or a final {"__interrupt__": (Interrupt,...)} dict
    if the run pauses for approval (verified against the installed
    langgraph 1.2.11 source: langgraph/types.py's interrupt() docstring
    example shows this exact shape)."""
    # Routed from task.instruction (persisted on the row) rather than any
    # live/ephemeral state, so a resumed run recomputes the exact same tool
    # subset the original run used — the checkpointed thread's tool-call
    # history must line up with whatever tools are bound on replay.
    pref = ModelPreference.current()
    agent = build_agent(tools=select_tools(task.instruction))
    config = run_config(task.thread_id)
    all_messages: list = []
    interrupt_value = None
    step_started = time.perf_counter()

    for chunk in agent.stream(graph_input, config, stream_mode="updates"):
        if "__interrupt__" in chunk:
            interrupt_value = chunk["__interrupt__"][0].value
            break
        for node_name, update in chunk.items():
            for message in update.get("messages", []):
                all_messages.append(message)
                _record_step(task, node_name, message)
                if node_name == "agent":
                    _log_agent_llm_call(pref, message, step_started)
                    step_started = time.perf_counter()

    if interrupt_value is not None:
        task.status = (
            AgentTask.Status.AWAITING_CLARIFICATION
            if interrupt_value.get("kind") == "clarify"
            else AgentTask.Status.AWAITING_CONFIRMATION
        )
        task.pending_action = interrupt_value
        task.current_step = ""
        task.save(update_fields=["status", "pending_action", "current_step"])
        return

    final_text = _message_text(all_messages[-1]) if all_messages else ""
    parser = ProtocolParser()
    parser.feed(final_text)
    text, mood = parser.finalize()

    task.status = AgentTask.Status.DONE
    task.result_text = text
    task.result_mood = mood
    task.current_step = ""
    task.finished_at = timezone.now()
    task.save(update_fields=["status", "result_text", "result_mood", "current_step", "finished_at"])

    if task.conversation_id:
        Message.objects.create(conversation_id=task.conversation_id, role="assistant", text=text, mood=mood)


def _log_agent_llm_call(pref: ModelPreference, message, started: float) -> None:
    """The agent graph's model calls go through langchain_anthropic/
    ChatOpenAI/ChatGoogleGenerativeAI directly (agent/graph.py::_build_model)
    rather than core/services/providers, so unlike every other call site in
    this app they previously had zero telemetry. AIMessage.usage_metadata is
    LangChain's standardized usage shape (verified against the installed
    langchain-core's messages/ai.py: UsageMetadata TypedDict with
    input_tokens/output_tokens and an optional input_token_details.cache_read
    /.cache_creation) — only present on AIMessage, so this only fires on the
    "agent" node's model-response messages, never on "tools" node messages.
    Silently skips (no fabricated telemetry) when a provider integration
    doesn't populate it."""
    from langchain_core.messages import AIMessage

    if not isinstance(message, AIMessage):
        return
    usage = getattr(message, "usage_metadata", None)
    if not usage:
        return
    details = usage.get("input_token_details") or {}
    log_llm_call(
        provider=pref.provider,
        model=pref.model,
        call_site="agent.run",
        input_tokens=usage.get("input_tokens"),
        output_tokens=usage.get("output_tokens"),
        latency_ms=(time.perf_counter() - started) * 1000,
        cache_read_tokens=details.get("cache_read"),
        cache_write_tokens=details.get("cache_creation"),
    )


_MAX_RESULT_LINKS = 5


def _record_step(task: AgentTask, node_name: str, message) -> None:
    """Persists progress immediately (not batched) so a client polling
    AgentTask mid-run sees it — this is the whole point of streaming
    instead of invoke()."""
    from langchain_core.messages import AIMessage, ToolMessage

    if node_name == "tools" and isinstance(message, ToolMessage):
        text = _message_text(message)
        task.steps.append({"tool": message.name, "result_summary": text[:300]})
        update_fields = ["steps", "current_step"]
        # Deterministic, tool-result-derived "go check it" link — never
        # LLM-generated, see agent/tools/links.py's docstring. Accumulates
        # across run_agent_task/resume_agent_task the same way `steps`
        # already does, since both are appended to the same persisted row.
        link = resolve_result_link(message.name, text)
        if link and link not in task.result_links and len(task.result_links) < _MAX_RESULT_LINKS:
            task.result_links.append(link)
            update_fields.append("result_links")
        task.current_step = ""
        task.save(update_fields=update_fields)
    elif node_name == "agent" and isinstance(message, AIMessage) and message.tool_calls:
        # Only the first parallel tool call gets a status line — showing
        # all of them at once is noisier than useful for one status line.
        task.current_step = _describe_tool_call(message.tool_calls[0]["name"])
        task.save(update_fields=["current_step"])


_STEP_DESCRIPTIONS = {
    "list_outlook_inbox": "Reading your Outlook inbox…",
    "get_outlook_message": "Opening that email…",
    "generate_outlook_reply": "Drafting a reply…",
    "generate_outlook_compose": "Drafting an email…",
    "send_outlook_email_now": "Getting that email ready to send…",
    "reply_outlook_message_now": "Getting that reply ready to send…",
    "schedule_outlook_email": "Scheduling that email…",
    "publish_linkedin_draft": "Getting that LinkedIn post ready to publish…",
    "post_linkedin_comment": "Getting that comment ready to post…",
    "generate_linkedin_comment": "Drafting a comment…",
    "turn_in_classroom_assignment": "Getting that assignment ready to turn in…",
    "solve_classroom_coursework": "Working through the assignment…",
    "ask_clarifying_question": "Thinking of what to ask…",
    "create_spotify_playlist": "Getting that playlist ready to create…",
    "update_spotify_playlist_details": "Getting that playlist update ready…",
    "add_tracks_to_spotify_playlist": "Getting those tracks ready to add…",
    "remove_tracks_from_spotify_playlist": "Getting those tracks ready to remove…",
    "save_spotify_tracks": "Getting those tracks ready to save…",
    "remove_spotify_saved_tracks": "Getting those tracks ready to unsave…",
    "follow_spotify_artists": "Getting ready to follow that artist…",
    "unfollow_spotify_artists": "Getting ready to unfollow that artist…",
}


def _describe_tool_call(name: str) -> str:
    return _STEP_DESCRIPTIONS.get(name, f"{name.replace('_', ' ').capitalize()}…")


def _message_text(message) -> str:
    """LangChain message .content is a plain str for Anthropic/OpenAI's simple
    replies, but Gemini (langchain_google_genai) — and any provider's replies
    that carry citations/thinking blocks — return a list of content-block
    dicts instead (verified live against the installed langchain-google-genai:
    a plain str(content) on that shape would dump raw Python repr, including
    internal fields like signed 'extras', straight into what's shown to the
    user). Extract just the text blocks in both cases."""
    content = message.content
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for block in content:
            if isinstance(block, str):
                parts.append(block)
            elif isinstance(block, dict) and block.get("type") == "text":
                parts.append(block.get("text", ""))
        return "".join(parts)
    return str(content)


def _fail(task: AgentTask, coarse_message: str) -> None:
    # Full traceback goes to the log (backend/logs/mirabel.log); only the
    # coarse message is ever persisted/exposed to the client — same
    # never-leak-the-raw-exception convention as core/services/llm.py.
    logger.exception("agent task %s failed", task.id)
    task.status = AgentTask.Status.FAILED
    task.error_message = coarse_message
    task.finished_at = timezone.now()
    task.save(update_fields=["status", "error_message", "finished_at"])
