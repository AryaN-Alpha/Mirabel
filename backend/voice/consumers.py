"""
Mirabel's WebSocket chat consumer. One instance per browser session.
Handles audio in, transcript+text+audio out, and barge-in cancellation.
"""

from __future__ import annotations

import asyncio
import base64
import json
import logging
from typing import Any

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncWebsocketConsumer

from agent.models import AgentTask
from agent.tasks import run_agent_task
from core.models import Conversation, Message, ModelPreference
from core.prompts.persona import MIRABEL_STREAMING_SYSTEM_PROMPT
from core.services.providers import get_provider
from memory.services.retrieval import (
    format_memories_for_prompt,
    retrieve_relevant_memories,
)
from memory.tasks import embed_and_store
from voice.services.protocol import ProtocolParser
from voice.services.sentence_buffer import StreamingSentenceBuffer
from voice.services.stt import transcribe
from voice.services.tts import stream_tts

logger = logging.getLogger(__name__)


class ChatConsumer(AsyncWebsocketConsumer):
    async def connect(self) -> None:
        self._audio_buffer = bytearray()
        self._inflight_task: asyncio.Task | None = None
        self._conversation_id: int | None = None
        self._agent_mode = False
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
            handler = self._handle_agent_task if self._agent_mode else self._handle_turn
            self._inflight_task = asyncio.create_task(handler(user_text=text))
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
            if self._agent_mode:
                await self._handle_agent_task(user_text=transcript)
            else:
                await self._handle_turn(user_text=transcript)
        except asyncio.CancelledError:
            logger.info("utterance cancelled (barge-in)")
            raise
        except Exception:
            logger.exception("utterance pipeline failed")
            await self._send_json({"type": "error", "message": "voice pipeline error"})

    async def _handle_turn(self, *, user_text: str) -> None:
        if not user_text:
            return

        conv_id, user_msg_id = await self._persist_user_message(user_text)
        self._conversation_id = conv_id

        history = await self._build_history(conv_id)
        memories = await asyncio.to_thread(
            retrieve_relevant_memories,
            query_text=user_text,
        )
        memory_block = format_memories_for_prompt(memories)
        system_prompt = (
            MIRABEL_STREAMING_SYSTEM_PROMPT + ("\n\n" + memory_block if memory_block else "")
        )

        parser = ProtocolParser()
        sentence_buffer = StreamingSentenceBuffer()
        tts_queue: asyncio.Queue[str | None] = asyncio.Queue()
        tts_worker = asyncio.create_task(self._tts_worker(tts_queue))

        try:
            provider_name, model, max_tokens, temperature = await self._current_model_preference()
            provider = get_provider(provider_name)
            async for delta in provider.stream_text(
                model=model,
                system=system_prompt,
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

            assistant_msg_id = await self._persist_assistant_message(conv_id, full_text, mood)
            embed_and_store.delay(user_msg_id)
            embed_and_store.delay(assistant_msg_id)

        except asyncio.CancelledError:
            logger.info("turn cancelled (barge-in)")
            await tts_queue.put(None)
            tts_worker.cancel()
            raise
        except Exception:
            logger.exception("turn pipeline failed")
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

        ack_text = "On it — give me a bit to actually go do that."
        ack_mood = "determined"

        tts_queue: asyncio.Queue[str | None] = asyncio.Queue()
        tts_worker = asyncio.create_task(self._tts_worker(tts_queue))
        try:
            task_id = await self._start_agent_task(conv_id, user_text)
            # Lets the client poll GET /api/agent/tasks/<id>/ for live
            # progress/approval instead of the task vanishing into the
            # Agent tab with no way back to this conversation.
            await self._send_json({"type": "agent_task_started", "task_id": task_id})
            # text_delta (not just final) so the client's existing streamingText
            # accumulation shows the ack bubble the same way a real streamed
            # reply would, with no extra frontend-side casing needed.
            await self._send_json({"type": "text_delta", "text": ack_text})
            await tts_queue.put(ack_text)
            await tts_queue.put(None)
            await tts_worker
            await self._send_json({"type": "final", "text": ack_text, "mood": ack_mood})
        except asyncio.CancelledError:
            logger.info("agent task queueing cancelled (barge-in)")
            await tts_queue.put(None)
            tts_worker.cancel()
            raise
        except Exception:
            logger.exception("agent task queueing failed")
            await tts_queue.put(None)
            tts_worker.cancel()
            await self._send_json({"type": "error", "message": "couldn't start that task"})

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
