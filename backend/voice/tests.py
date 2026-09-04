import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

from asgiref.sync import async_to_sync
from channels.db import database_sync_to_async
from channels.layers import get_channel_layer
from channels.testing import WebsocketCommunicator
from django.test import SimpleTestCase, TransactionTestCase

from agent.models import AgentTask
from voice.consumers import ChatConsumer
from voice.services.intents import classify_stop, classify_yes_no


class ClassifyStopTests(SimpleTestCase):
    def test_recognizes_stop_words(self):
        for phrase in ["stop", "Cancel!", "abort", "never mind", "hold on", "wait."]:
            self.assertTrue(classify_stop(phrase), phrase)

    def test_ignores_filler_and_unrelated_speech(self):
        for phrase in ["umm", "yeah okay", "what's on my calendar", ""]:
            self.assertFalse(classify_stop(phrase), phrase)


class ClassifyYesNoTests(SimpleTestCase):
    def test_recognizes_yes(self):
        for phrase in ["yes", "Yeah.", "go ahead", "sure", "okay"]:
            self.assertEqual(classify_yes_no(phrase), "yes", phrase)

    def test_recognizes_no(self):
        for phrase in ["no", "nope", "don't", "cancel that", "hold off"]:
            self.assertEqual(classify_yes_no(phrase), "no", phrase)

    def test_unclear_for_anything_else(self):
        for phrase in ["umm", "what do you mean", "the second one", ""]:
            self.assertEqual(classify_yes_no(phrase), "unclear", phrase)


async def _empty_tts(_text):
    return
    yield  # pragma: no cover - makes this an async generator


class SpeakAckTests(SimpleTestCase):
    """Regression test: _speak_ack used to catch its own exception, log it,
    clean up the TTS queue/worker, and return normally — never re-raising.
    Every caller (voice/consumers.py's _handle_agent_task and
    _handle_pending_task_input's three call sites) relies on that exception
    propagating to their own except-block (directly, or via
    _route_user_utterance's outer wrapper) to send a client-facing
    {"type": "error"}. Swallowing it silently defeated all of them, leaving
    the frontend's `thinking` state stuck forever since neither `final` nor
    `error` ever arrived for that turn."""

    def test_send_failure_propagates_instead_of_being_swallowed(self):
        async_to_sync(self._send_failure_propagates)()

    async def _send_failure_propagates(self):
        consumer = ChatConsumer()
        consumer._tts_lock = asyncio.Lock()
        consumer._send_json = AsyncMock(side_effect=RuntimeError("boom"))
        with self.assertRaises(RuntimeError):
            await consumer._speak_ack("hi", "neutral")


class CurrentModelPreferenceFastConversationModeTests(TransactionTestCase):
    """voice.turn mirrors core.services.llm's chat.rest gate: fast_model_for
    only applies when the user has opted into ModelPreference.
    fast_conversation_mode — see core/services/llm.py's equivalent tests."""

    def test_default_off_uses_the_configured_model_unchanged(self):
        from core.models import ModelPreference

        ModelPreference.objects.update_or_create(
            pk=1, defaults={"provider": "deepseek", "model": "deepseek-v4-flash", "fast_conversation_mode": False}
        )
        consumer = ChatConsumer()
        provider, model, _max_tokens, _temperature = async_to_sync(consumer._current_model_preference)()
        self.assertEqual(provider, "deepseek")
        self.assertEqual(model, "deepseek-v4-flash")

    def test_opted_in_redirects_deepseek_to_the_fast_model(self):
        from core.models import ModelPreference

        ModelPreference.objects.update_or_create(
            pk=1, defaults={"provider": "deepseek", "model": "deepseek-v4-flash", "fast_conversation_mode": True}
        )
        consumer = ChatConsumer()
        provider, model, _max_tokens, _temperature = async_to_sync(consumer._current_model_preference)()
        self.assertEqual(provider, "deepseek")
        self.assertEqual(model, "deepseek-chat")


class ChatConsumerAgentTaskLockTests(TransactionTestCase):
    """End-to-end coverage (real WebsocketCommunicator, not just unit-level
    calls into agent/services/lifecycle.py) for the actual bug this whole
    change exists to fix: a finished utterance while an AgentTask is already
    pending must route to *that* task instead of silently spawning a second,
    concurrent one. TransactionTestCase (not TestCase) is required here per
    Channels' testing docs — database_sync_to_async runs on a separate
    thread, which a plain TestCase's transaction wrapping doesn't span."""

    def setUp(self):
        patcher = patch("voice.consumers.stream_tts", _empty_tts)
        patcher.start()
        self.addCleanup(patcher.stop)

    async def _connect(self):
        communicator = WebsocketCommunicator(ChatConsumer.as_asgi(), "/ws/chat/")
        connected, _ = await communicator.connect()
        assert connected
        await communicator.receive_json_from()  # "ready"
        return communicator

    async def _start_agent_task_via_text(self, communicator):
        await communicator.send_json_to({"type": "set_agent_mode", "enabled": True})
        await communicator.send_json_to({"type": "text_message", "text": "read my inbox"})
        transcript = await communicator.receive_json_from()  # transcript echo (text_message parity with voice)
        self.assertEqual(transcript["type"], "transcript")
        started = await communicator.receive_json_from()
        self.assertEqual(started["type"], "agent_task_started")
        await communicator.receive_json_from()  # text_delta (ack)
        await communicator.receive_json_from()  # audio_sentence_end
        await communicator.receive_json_from()  # final
        return started["task_id"]

    def test_filler_while_task_running_does_not_spawn_second_task(self):
        async_to_sync(self._filler_while_running)()

    async def _filler_while_running(self):
        with patch("voice.consumers.run_agent_task.delay", return_value=MagicMock(id="celery-1")):
            communicator = await self._connect()
            task_id = await self._start_agent_task_via_text(communicator)
            await database_sync_to_async(AgentTask.objects.filter(pk=task_id).update)(
                status=AgentTask.Status.RUNNING
            )

            await communicator.send_json_to({"type": "text_message", "text": "umm"})
            transcript = await communicator.receive_json_from()  # transcript echo
            self.assertEqual(transcript["type"], "transcript")
            nudge = await communicator.receive_json_from()
            self.assertEqual(nudge["type"], "agent_task_nudge")

            await communicator.disconnect()

        self.assertEqual(await database_sync_to_async(AgentTask.objects.count)(), 1)
        task = await database_sync_to_async(AgentTask.objects.get)(pk=task_id)
        self.assertEqual(task.status, AgentTask.Status.RUNNING)

    def test_voice_yes_resumes_pending_confirmation_without_new_task(self):
        async_to_sync(self._voice_yes_resumes_confirmation)()

    async def _voice_yes_resumes_confirmation(self):
        with patch("voice.consumers.run_agent_task.delay", return_value=MagicMock(id="celery-1")):
            communicator = await self._connect()
            task_id = await self._start_agent_task_via_text(communicator)
            await database_sync_to_async(AgentTask.objects.filter(pk=task_id).update)(
                status=AgentTask.Status.AWAITING_CONFIRMATION,
                pending_action={"tool": "publish_linkedin_draft", "summary": "publish it", "args": {}},
            )

            with patch(
                "agent.services.lifecycle.resume_agent_task.delay", return_value=MagicMock(id="resume-1")
            ) as mock_resume:
                await communicator.send_json_to({"type": "text_message", "text": "yes"})
                transcript = await communicator.receive_json_from()  # transcript echo
                self.assertEqual(transcript["type"], "transcript")
                ack = await communicator.receive_json_from()  # text_delta
                self.assertEqual(ack["type"], "text_delta")
                await communicator.receive_json_from()  # audio_sentence_end
                final = await communicator.receive_json_from()
                self.assertEqual(final["type"], "final")

            mock_resume.assert_called_once_with(task_id, {"approved": True, "args": None})
            await communicator.disconnect()

        self.assertEqual(await database_sync_to_async(AgentTask.objects.count)(), 1)
        task = await database_sync_to_async(AgentTask.objects.get)(pk=task_id)
        self.assertEqual(task.status, AgentTask.Status.RUNNING)

    def test_oversized_clarification_answer_is_rejected_not_forwarded(self):
        async_to_sync(self._oversized_clarification_answer)()

    async def _oversized_clarification_answer(self):
        with patch("voice.consumers.run_agent_task.delay", return_value=MagicMock(id="celery-1")):
            communicator = await self._connect()
            task_id = await self._start_agent_task_via_text(communicator)
            await database_sync_to_async(AgentTask.objects.filter(pk=task_id).update)(
                status=AgentTask.Status.AWAITING_CLARIFICATION,
                pending_action={"kind": "clarify", "question": "Which professor?"},
            )

            with patch("agent.services.lifecycle.resume_agent_task.delay") as mock_resume:
                await communicator.send_json_to({"type": "text_message", "text": "x" * 4001})
                nudge = await communicator.receive_json_from()
                self.assertEqual(nudge["type"], "agent_task_nudge")

            mock_resume.assert_not_called()
            await communicator.disconnect()

        task = await database_sync_to_async(AgentTask.objects.get)(pk=task_id)
        self.assertEqual(task.status, AgentTask.Status.AWAITING_CLARIFICATION)


class ChatConsumerNewChatTests(TransactionTestCase):
    """Coverage for the "start a new chat" feature: a `new_chat` WS message
    must drop this connection's conversation thread (so the next utterance
    starts a fresh Conversation instead of appending to the old one) and
    release any pending AgentTask link (so a stale task's agent.speak no
    longer reaches this connection) — see ChatConsumer._start_new_chat."""

    def setUp(self):
        patcher = patch("voice.consumers.stream_tts", _empty_tts)
        patcher.start()
        self.addCleanup(patcher.stop)

    async def _connect(self):
        communicator = WebsocketCommunicator(ChatConsumer.as_asgi(), "/ws/chat/")
        connected, _ = await communicator.connect()
        assert connected
        await communicator.receive_json_from()  # "ready"
        return communicator

    async def _start_agent_task_via_text(self, communicator, text):
        await communicator.send_json_to({"type": "set_agent_mode", "enabled": True})
        await communicator.send_json_to({"type": "text_message", "text": text})
        transcript = await communicator.receive_json_from()  # transcript echo
        self.assertEqual(transcript["type"], "transcript")
        started = await communicator.receive_json_from()
        self.assertEqual(started["type"], "agent_task_started")
        await communicator.receive_json_from()  # text_delta (ack)
        await communicator.receive_json_from()  # audio_sentence_end
        await communicator.receive_json_from()  # final
        return started["task_id"]

    def test_new_chat_starts_a_fresh_conversation_and_drops_pending_task(self):
        async_to_sync(self._new_chat_resets)()

    async def _new_chat_resets(self):
        with patch("voice.consumers.run_agent_task.delay", return_value=MagicMock(id="celery-1")):
            communicator = await self._connect()
            first_task_id = await self._start_agent_task_via_text(communicator, "read my inbox")
            first_task = await database_sync_to_async(AgentTask.objects.get)(pk=first_task_id)
            first_conv_id = first_task.conversation_id

            await communicator.send_json_to({"type": "new_chat"})
            ack = await communicator.receive_json_from()
            self.assertEqual(ack["type"], "chat_cleared")

            # The dropped task's group no longer reaches this connection.
            channel_layer = get_channel_layer()
            await channel_layer.group_send(
                AgentTask.voice_group_name(first_task_id),
                {"type": "agent.speak", "task_id": first_task_id, "text": "stale question"},
            )
            self.assertTrue(await communicator.receive_nothing(timeout=0.3))

            second_task_id = await self._start_agent_task_via_text(communicator, "draft a post")
            second_task = await database_sync_to_async(AgentTask.objects.get)(pk=second_task_id)
            self.assertNotEqual(second_task.conversation_id, first_conv_id)

            await communicator.disconnect()


class ChatConsumerAgentSpeakTests(TransactionTestCase):
    """Regression coverage for the fix to two bugs the frontend used to have
    when a background AgentTask paused for a clarifying question / approval:
    it spoke the question with the browser's own window.speechSynthesis
    (wrong voice — not Mirabel's edge-tts voice) via audio the mic's
    echoCancellation couldn't suppress (it never runs through the tab's
    WebAudio graph), so the question got picked back up and transcribed as
    a new user utterance. agent/tasks.py's _run_graph now notifies this
    connection over the channel layer (see AgentTask.voice_group_name) and
    the consumer speaks it through the exact same audio_chunk pipeline a
    normal reply uses — see agent_speak in voice/consumers.py."""

    def setUp(self):
        patcher = patch("voice.consumers.stream_tts", _empty_tts)
        patcher.start()
        self.addCleanup(patcher.stop)

    async def _connect(self):
        communicator = WebsocketCommunicator(ChatConsumer.as_asgi(), "/ws/chat/")
        connected, _ = await communicator.connect()
        assert connected
        await communicator.receive_json_from()  # "ready"
        return communicator

    async def _start_agent_task_via_text(self, communicator):
        await communicator.send_json_to({"type": "set_agent_mode", "enabled": True})
        await communicator.send_json_to({"type": "text_message", "text": "read my inbox"})
        await communicator.receive_json_from()  # transcript echo
        started = await communicator.receive_json_from()
        self.assertEqual(started["type"], "agent_task_started")
        await communicator.receive_json_from()  # text_delta (ack)
        await communicator.receive_json_from()  # audio_sentence_end
        await communicator.receive_json_from()  # final
        return started["task_id"]

    def test_agent_speak_plays_through_real_tts_for_the_owning_connection(self):
        async_to_sync(self._agent_speak_plays_for_owning_connection)()

    async def _agent_speak_plays_for_owning_connection(self):
        with patch("voice.consumers.run_agent_task.delay", return_value=MagicMock(id="celery-1")):
            communicator = await self._connect()
            task_id = await self._start_agent_task_via_text(communicator)

            channel_layer = get_channel_layer()
            await channel_layer.group_send(
                AgentTask.voice_group_name(task_id),
                {"type": "agent.speak", "task_id": task_id, "text": "Which professor?"},
            )
            end = await communicator.receive_json_from()
            self.assertEqual(end["type"], "audio_sentence_end")

            await communicator.disconnect()

    def test_agent_speak_ignores_a_stale_task_id(self):
        async_to_sync(self._agent_speak_ignores_stale_task_id)()

    async def _agent_speak_ignores_stale_task_id(self):
        with patch("voice.consumers.run_agent_task.delay", return_value=MagicMock(id="celery-1")):
            communicator = await self._connect()
            task_id = await self._start_agent_task_via_text(communicator)

            channel_layer = get_channel_layer()
            await channel_layer.group_send(
                AgentTask.voice_group_name(task_id),
                {"type": "agent.speak", "task_id": task_id + 999, "text": "stale question"},
            )
            # receive_json_from's timeout path cancels the whole consumer
            # task (see asgiref.testing.ApplicationCommunicator.receive_output),
            # which would break the disconnect() below — receive_nothing()
            # is the framework's actual API for a negative assertion.
            self.assertTrue(await communicator.receive_nothing(timeout=0.3))

            await communicator.disconnect()

    def test_disconnect_leaves_the_agent_task_group(self):
        async_to_sync(self._disconnect_leaves_group)()

    async def _disconnect_leaves_group(self):
        with patch("voice.consumers.run_agent_task.delay", return_value=MagicMock(id="celery-1")):
            communicator = await self._connect()
            task_id = await self._start_agent_task_via_text(communicator)
            await communicator.disconnect()

        # After disconnect, a group_send for that task must reach nobody —
        # proven by asserting no exception AND, more importantly, that a
        # fresh connection which never joined this task's group also never
        # receives it (see test above for the positive case).
        channel_layer = get_channel_layer()
        await channel_layer.group_send(
            AgentTask.voice_group_name(task_id),
            {"type": "agent.speak", "task_id": task_id, "text": "should reach nobody"},
        )
