"""
Mirabel's WebSocket chat consumer. One instance per browser session.
Handles audio in, transcript+text+audio out, and barge-in cancellation.
"""

from __future__ import annotations

import asyncio
import base64
import json
import logging
import time
from typing import Any

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncWebsocketConsumer

from agent.models import AgentTask
from agent.services.lifecycle import (
    cancel_if_cancellable,
    resume_clarification,
    resume_confirmation,
)
from agent.tasks import run_agent_task
from core.models import Conversation, Message, ModelPreference
from core.prompts.persona import MIRABEL_STREAMING_SYSTEM_PROMPT
from core.services.providers import get_provider
from core.services.telemetry import log_llm_call, log_optimization_event
from memory.services.gating import needs_memory
from memory.services.retrieval import (
    format_memories_for_prompt,
    retrieve_relevant_memories,
)
from memory.tasks import embed_and_store, extract_and_supersede_facts
from voice.services.intents import classify_stop, classify_yes_no
from voice.services.protocol import ProtocolParser
from voice.services.sentence_buffer import StreamingSentenceBuffer
from voice.services.stt import transcribe
from voice.services.tts import stream_tts

logger = logging.getLogger(__name__)

# A finished utterance while one of these is pending routes to the pending
# task (answer/approve/reject/cancel) instead of starting new work — see
# ChatConsumer._route_user_utterance. Cleared once the task reaches a
# terminal status.
_TERMINAL_AGENT_STATUSES = {
    AgentTask.Status.DONE,
    AgentTask.Status.FAILED,
    AgentTask.Status.CANCELLED,
}

# Mirrors agent.views.MAX_INSTRUCTION_LENGTH — same cap, same field
# (AgentTask clarification answer), just reached over the WS text/voice path
# instead of REST.
_MAX_CLARIFICATION_ANSWER_LENGTH = 4000


class ChatConsumer(AsyncWebsocketConsumer):
    async def connect(self) -> None:
        self._audio_buffer = bytearray()
        self._inflight_task: asyncio.Task | None = None
        self._conversation_id: int | None = None
        self._agent_mode = False
        # Tracks a background AgentTask this session started (see
        # _start_agent_task) so the next utterance can be routed to it
        # (answer/approve/reject/cancel) instead of spawning a second,
        # concurrent task — see _route_user_utterance.
        self._pending_agent_task_id: int | None = None
        await self.accept()
        await self._send_json({"type": "ready"})

    async def disconnect(self, code: int) -> None:
        await self._cancel_inflight()

    # ------------------------------------------------------------------
    # Inbound
    # ------------------------------------------------------------------
    async def receive(self, text_data: str | None = None, bytes_data: bytes | None = None) -> None:
        # Binary frames = audio. We accumulate until the client signals end-of-utterance.
        if bytes_data is not None:
            self._audio_buffer.extend(bytes_data)
            return

        if text_data is None:
            return

        try:
            msg = json.loads(text_data)
        except json.JSONDecodeError:
            logger.warning("bad client JSON: %r", text_data[:200])
            return

        kind = msg.get("type")
        if kind == "utterance_end":
            audio = bytes(self._audio_buffer)
            self._audio_buffer.clear()
            self._inflight_task = asyncio.create_task(self._handle_utterance(audio))
        elif kind == "cancel":
            self._audio_buffer.clear()
            await self._cancel_inflight()
        elif kind == "text_message":
            # Optional: text input over the same socket (skip STT).
            await self._cancel_inflight()
            text = str(msg.get("text", "")).strip()
            self._inflight_task = asyncio.create_task(self._route_user_utterance(text))
        elif kind == "set_agent_mode":
            # Toggled from the UI. While on, a finished utterance is queued
            # as a background AgentTask (agent/tasks.py) instead of driving
            # a normal streaming chat turn — see _handle_agent_task.
            self._agent_mode = bool(msg.get("enabled"))

    # ------------------------------------------------------------------
    # The full turn pipeline
    # ------------------------------------------------------------------
    async def _handle_utterance(self, audio: bytes) -> None:
        try:
            transcript = await asyncio.to_thread(transcribe, audio, "webm")
            if not transcript:
                await self._send_json({"type": "transcript", "text": "", "empty": True})
                return
            await self._send_json({"type": "transcript", "text": transcript})
            await self._route_user_utterance(transcript)
        except asyncio.CancelledError:
            logger.info("utterance cancelled (barge-in)")
            raise
        except Exception:
            logger.exception("utterance pipeline failed")
            await self._send_json({"type": "error", "message": "voice pipeline error"})

    # ------------------------------------------------------------------
    # Routing — a finished utterance either starts new work (a normal turn
    # or a new agent task) or, if this session already has an agent task
    # pending, answers/interrupts *that* task instead. This is the turn
    # lock: without it, any sound while an AgentTask runs in the background
    # (filler words, background noise) would silently spawn a second,
    # concurrent AgentTask — see agent/models.py::AgentTask.Status.
    # ------------------------------------------------------------------
    async def _route_user_utterance(self, user_text: str) -> None:
        if not user_text:
            return

        # _handle_utterance already wraps the voice path in a try/except, but
        # text_message (receive()) does not — _handle_pending_task_input below
        # has no internal error handling of its own (unlike _handle_turn/
        # _handle_agent_task, which each catch their own exceptions), so a DB
        # or Celery-broker hiccup there would otherwise fail silently for
        # typed input instead of surfacing to the client.
        try:
            pending = await self._refresh_pending_task()
            if pending is not None:
                await self._handle_pending_task_input(pending, user_text)
                return

            if self._agent_mode:
                await self._handle_agent_task(user_text=user_text)
            else:
                await self._handle_turn(user_text=user_text)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("utterance routing failed")
            await self._send_json({"type": "error", "message": "voice pipeline error"})

    async def _refresh_pending_task(self) -> AgentTask | None:
        task_id = self._pending_agent_task_id
        if task_id is None:
            return None
        task = await self._fetch_agent_task(task_id)
        if task is None or task.status in _TERMINAL_AGENT_STATUSES:
            self._pending_agent_task_id = None
            return None
        return task

    @database_sync_to_async
    def _fetch_agent_task(self, task_id: int) -> AgentTask | None:
        return AgentTask.objects.filter(pk=task_id).first()

    async def _handle_pending_task_input(self, task: AgentTask, user_text: str) -> None:
        if task.status == AgentTask.Status.AWAITING_CLARIFICATION:
            # Same cap agent/views.py::answer_task enforces on this exact
            # field via REST — a cheap guard against forwarding unbounded
            # text into the graph/LLM context (see core/views.py's
            # MAX_MESSAGE_LENGTH for the same convention on /api/chat/).
            if len(user_text) > _MAX_CLARIFICATION_ANSWER_LENGTH:
                await self._send_json({
                    "type": "agent_task_nudge",
                    "message": "That answer's too long to use as-is — try a shorter version, or use the card.",
                })
                return
            resumed = await database_sync_to_async(resume_clarification)(task.id, answer=user_text)
            if resumed is not None:
                logger.info("voice: resumed clarification for agent task %s", task.id)
                await self._speak_ack("Got it, thanks.", "determined")
            else:
                # Status moved on between the check above and this call (e.g.
                # answered via the on-screen card at the same moment) — stale,
                # not an error. Drop the lock rather than fail silently.
                self._pending_agent_task_id = None
                await self._send_json({
                    "type": "agent_task_nudge",
                    "message": "That one already moved on — go ahead and say it again if needed.",
                })
            return

        if task.status == AgentTask.Status.AWAITING_CONFIRMATION:
            verdict = classify_yes_no(user_text)
            if verdict == "unclear":
                await self._send_json({
                    "type": "agent_task_nudge",
                    "message": "Say yes or no, or use the card, to continue that.",
                })
                return

            approved = verdict == "yes"
            resumed = await database_sync_to_async(resume_confirmation)(task.id, approved=approved, args=None)
            if resumed is not None:
                logger.info("voice: %s agent task %s by voice", "approved" if approved else "rejected", task.id)
                await self._speak_ack(
                    "Okay, doing it." if approved else "Okay, I'll hold off.",
                    "determined" if approved else "neutral",
                )
            else:
                # Status moved on between the check above and this call (e.g.
                # decided via the on-screen card at the same moment) — stale,
                # not an error. Drop the lock rather than fail silently.
                self._pending_agent_task_id = None
                await self._send_json({
                    "type": "agent_task_nudge",
                    "message": "That one already moved on — go ahead and say it again if needed.",
                })
            return

        # QUEUED or RUNNING — no pending question, just background work.
        if classify_stop(user_text):
            cancelled = await database_sync_to_async(cancel_if_cancellable)(task.id)
            if cancelled is not None:
                logger.info("voice: cancelled agent task %s by voice", task.id)
                await self._speak_ack("Okay, I stopped that.", "neutral")
            else:
                logger.info("voice: stop requested for running agent task %s — can't safely cancel mid-run", task.id)
                await self._speak_ack(
                    "That one's already running — I can't safely stop it mid-action, "
                    "but I'll let you know when it's done.",
                    "neutral",
                )
        else:
            logger.info(
                "voice: suppressing utterance %r — agent task %s still %s",
                user_text[:80], task.id, task.status,
            )
            await self._send_json({
                "type": "agent_task_nudge",
                "message": "Still working on your last request — say stop to cancel it.",
            })

    async def _handle_turn(self, *, user_text: str) -> None:
        if not user_text:
            return

        conv_id, user_msg_id = await self._persist_user_message(user_text)
        self._conversation_id = conv_id

        # Neither depends on the other's result — the DB history fetch and
        # the Chroma memory query used to run back-to-back, adding their
        # latencies together on this turn's time-to-first-token even though
        # they could overlap. Kick the history fetch off first so it's
        # already in flight while the (usually slower) Chroma round-trip runs.
        history_task = asyncio.create_task(self._build_history(conv_id))
        if needs_memory(user_text):
            await asyncio.to_thread(log_optimization_event, category="memory_gate", outcome="retrieved")
            memories = await asyncio.to_thread(
                retrieve_relevant_memories,
                query_text=user_text,
            )
        else:
            logger.debug("memory gate: skipping retrieval for trivial utterance %r", user_text[:40])
            await asyncio.to_thread(log_optimization_event, category="memory_gate", outcome="skipped")
            memories = []
        history = await history_task
        memory_block = format_memories_for_prompt(memories)

        parser = ProtocolParser()
        sentence_buffer = StreamingSentenceBuffer()
        tts_queue: asyncio.Queue[str | None] = asyncio.Queue()
        tts_worker = asyncio.create_task(self._tts_worker(tts_queue))

        started = time.perf_counter()
        provider_name = model = None
        try:
            provider_name, model, max_tokens, temperature = await self._current_model_preference()
            provider = get_provider(provider_name)
            async for delta in provider.stream_text(
                model=model,
                system=MIRABEL_STREAMING_SYSTEM_PROMPT,
                system_suffix=memory_block,
                history=history,
                max_tokens=max_tokens,
                temperature=temperature,
            ):
                speakable = parser.feed(delta)
                if speakable:
                    await self._send_json({"type": "text_delta", "text": speakable})
                    for sentence in sentence_buffer.feed(speakable):
                        await tts_queue.put(sentence)

            # Stream finished — flush any remaining sentence and the parser tail.
            leftover_text = sentence_buffer.flush()
            if leftover_text:
                await tts_queue.put(leftover_text)
            await tts_queue.put(None)  # sentinel: no more work
            await tts_worker

            full_text, mood = parser.finalize()
            await self._send_json({"type": "final", "text": full_text, "mood": mood})

            # Exact usage isn't cheaply available mid-stream without
            # restructuring each provider's streaming contract (see
            # core/services/telemetry.py's module docstring for why this is
            # deferred) — a character-based estimate still gives directional
            # cost visibility on the highest-frequency call site.
            input_chars = (
                len(MIRABEL_STREAMING_SYSTEM_PROMPT) + len(memory_block)
                + sum(len(m.get("content", "")) for m in history)
            )
            # log_llm_call now does a DB write (see core/services/telemetry.py)
            # — must not block this consumer's event loop (CLAUDE.md Phase 3:
            # "NEVER block the WebSocket consumer's event loop with sync I/O").
            await asyncio.to_thread(
                log_llm_call,
                provider=provider_name,
                model=model,
                call_site="voice.turn",
                input_tokens=input_chars // 4,
                output_tokens=len(full_text) // 4,
                latency_ms=(time.perf_counter() - started) * 1000,
                estimated=True,
            )

            assistant_msg_id = await self._persist_assistant_message(conv_id, full_text, mood)
            embed_and_store.delay(user_msg_id)
            embed_and_store.delay(assistant_msg_id)
            extract_and_supersede_facts.delay(user_msg_id)

        except asyncio.CancelledError:
            logger.info("turn cancelled (barge-in)")
            await tts_queue.put(None)
            tts_worker.cancel()
            raise
        except Exception:
            logger.exception("turn pipeline failed")
            if provider_name:
                await asyncio.to_thread(
                    log_llm_call,
                    provider=provider_name,
                    model=model or "",
                    call_site="voice.turn",
                    latency_ms=(time.perf_counter() - started) * 1000,
                    estimated=True,
                    error=True,
                )
            await tts_queue.put(None)
            tts_worker.cancel()
            await self._send_json({"type": "error", "message": "generation error"})

    # ------------------------------------------------------------------
    # Agent Mode — queues a background AgentTask instead of a normal turn.
    # No live result push over this socket (results show up in the chat
    # history / Agent tab once the Celery task finishes) — this just
    # acknowledges the request was heard and got queued.
    # ------------------------------------------------------------------
    async def _handle_agent_task(self, *, user_text: str) -> None:
        if not user_text:
            return

        conv_id, _user_msg_id = await self._persist_user_message(user_text)
        self._conversation_id = conv_id

        try:
            task_id = await self._start_agent_task(conv_id, user_text)
            # Session-level turn lock: the next utterance routes to this
            # task (answer/approve/reject/cancel) instead of spawning
            # another one — see _route_user_utterance.
            self._pending_agent_task_id = task_id
            # Lets the client poll GET /api/agent/tasks/<id>/ for live
            # progress/approval instead of the task vanishing into the
            # Agent tab with no way back to this conversation.
            await self._send_json({"type": "agent_task_started", "task_id": task_id})
            await self._speak_ack("On it — give me a bit to actually go do that.", "determined")
        except asyncio.CancelledError:
            logger.info("agent task queueing cancelled (barge-in)")
            raise
        except Exception:
            logger.exception("agent task queueing failed")
            await self._send_json({"type": "error", "message": "couldn't start that task"})

    # ------------------------------------------------------------------
    # Speaks a short one-off line (task ack/nudge/cancel confirmation) using
    # the same text_delta+TTS+final sequence a real streamed reply uses, so
    # the client's existing streamingText/mood handling needs no special
    # casing for these short control messages.
    # ------------------------------------------------------------------
    async def _speak_ack(self, text: str, mood: str) -> None:
        tts_queue: asyncio.Queue[str | None] = asyncio.Queue()
        tts_worker = asyncio.create_task(self._tts_worker(tts_queue))
        try:
            await self._send_json({"type": "text_delta", "text": text})
            await tts_queue.put(text)
            await tts_queue.put(None)
            await tts_worker
            await self._send_json({"type": "final", "text": text, "mood": mood})
        except asyncio.CancelledError:
            await tts_queue.put(None)
            tts_worker.cancel()
            raise
        except Exception:
            logger.exception("ack speech failed")
            await tts_queue.put(None)
            tts_worker.cancel()
            # Re-raise (matching the CancelledError branch above) rather
            # than swallowing: every caller of _speak_ack already has its
            # own except-block that sends a client-facing {"type": "error"}
            # (either directly, or via _route_user_utterance's outer
            # wrapper) — swallowing here defeated all of them silently,
            # leaving the frontend's `thinking` state stuck forever since
            # neither `final` nor `error` ever arrived for that turn.
            raise

    # ------------------------------------------------------------------
    # TTS worker — single consumer of the sentence queue, ordered output
    # ------------------------------------------------------------------
    async def _tts_worker(self, queue: asyncio.Queue[str | None]) -> None:
        while True:
            sentence = await queue.get()
            if sentence is None:
                return
            try:
                async for audio_chunk in stream_tts(sentence):
                    if not audio_chunk:
                        continue
                    await self._send_json({
                        "type": "audio_chunk",
                        "data": base64.b64encode(audio_chunk).decode("ascii"),
                    })
                # Per-sentence boundary marker — lets the client play gaplessly
                # but know where utterances split if it ever needs to.
                await self._send_json({"type": "audio_sentence_end"})
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("tts failed for sentence: %r", sentence[:80])

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------
    async def _cancel_inflight(self) -> None:
        task = self._inflight_task
        if task and not task.done():
            task.cancel()
            try:
                await task
            except (asyncio.CancelledError, Exception):
                pass
        self._inflight_task = None

    async def _send_json(self, payload: dict[str, Any]) -> None:
        await self.send(text_data=json.dumps(payload))

    @database_sync_to_async
    def _current_model_preference(self) -> tuple[str, str, int, float]:
        pref = ModelPreference.current()
        return pref.provider, pref.model, pref.max_tokens, pref.temperature

    @database_sync_to_async
    def _persist_user_message(self, text: str) -> tuple[int, int]:
        if self._conversation_id is None:
            self._conversation_id = Conversation.objects.create().id
        msg = Message.objects.create(
            conversation_id=self._conversation_id, role="user", text=text, mood=""
        )
        return self._conversation_id, msg.id

    @database_sync_to_async
    def _start_agent_task(self, conv_id: int, instruction: str) -> int:
        task = AgentTask.objects.create(instruction=instruction, conversation_id=conv_id)
        async_result = run_agent_task.delay(task.id)
        task.celery_task_id = async_result.id
        task.save(update_fields=["celery_task_id"])
        return task.id

    @database_sync_to_async
    def _persist_assistant_message(self, conv_id: int, text: str, mood: str) -> int:
        msg = Message.objects.create(
            conversation_id=conv_id, role="assistant", text=text, mood=mood
        )
        return msg.id

    @database_sync_to_async
    def _build_history(self, conv_id: int) -> list[dict[str, str]]:
        msgs = (
            Message.objects.filter(conversation_id=conv_id)
            .order_by("-id")[:20]
        )
        # Reverse to chronological, format for Anthropic SDK
        return [{"role": m.role, "content": m.text} for m in reversed(list(msgs))]
