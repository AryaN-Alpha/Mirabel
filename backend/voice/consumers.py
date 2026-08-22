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

import anthropic
from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncWebsocketConsumer
from django.conf import settings

from core.models import Conversation, Message
from core.prompts.persona import MIRABEL_STREAMING_SYSTEM_PROMPT
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
    # Single hardcoded user for now — Phase 4 wires real auth.
    USER_LABEL = "default"

    async def connect(self) -> None:
        self._audio_buffer = bytearray()
        self._inflight_task: asyncio.Task | None = None
        self._conversation_id: int | None = None
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
            await self._cancel_inflight()  # barge-in
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
            await self._cancel_inflight()
        elif kind == "text_message":
            # Optional: text input over the same socket (skip STT).
            await self._cancel_inflight()
            self._inflight_task = asyncio.create_task(
                self._handle_turn(user_text=str(msg.get("text", "")).strip())
            )

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
            user_label=self.USER_LABEL,
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
            client = anthropic.AsyncAnthropic()
            async with client.messages.stream(
                model=settings.ANTHROPIC_MODEL,
                max_tokens=500,
                system=system_prompt,
                messages=history,
            ) as stream:
                async for delta in stream.text_stream:
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
    def _persist_user_message(self, text: str) -> tuple[int, int]:
        conv, _ = Conversation.objects.get_or_create(
            user_label=self.USER_LABEL,
            defaults={"user_label": self.USER_LABEL},
        )
        msg = Message.objects.create(conversation=conv, role="user", text=text, mood="")
        return conv.id, msg.id

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
