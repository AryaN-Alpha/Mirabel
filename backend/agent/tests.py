import json
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from langchain_core.messages import AIMessage, ToolMessage
from rest_framework.test import APITestCase

from agent.models import AgentTask
from agent.services.lifecycle import (
    cancel_if_cancellable,
    resume_clarification,
    resume_confirmation,
)
from agent.tasks import _message_text, _record_step
from agent.tools import linkedin_tools, spotify_tools
from agent.tools.links import resolve_result_link
from core.models import Conversation
from linkedin.models import LinkedInAutomation, LinkedInDraft
from spotify.services.oauth import SpotifyError


class AgentTaskModelTests(APITestCase):
    def test_thread_id_is_derived_from_pk(self):
        task = AgentTask.objects.create(instruction="do a thing")
        self.assertEqual(task.thread_id, f"agent-task-{task.id}")


class LinkedInResearchToolsTests(APITestCase):
    """Unit coverage for the read-only LinkedIn research tools per
    docs/EXTENDING.md §2.6 — call the tool function directly, assert the
    returned dict shape, and that nothing is ever raised."""

    def test_get_linkedin_analytics_always_reports_unavailable(self):
        """Regression guard against the AI-safety rule in the task spec:
        this tool must never let the model believe engagement analytics
        exist — LinkedIn doesn't expose them at this integration's scope."""
        result = linkedin_tools.get_linkedin_analytics.func()
        self.assertFalse(result["available"])
        self.assertIn("reason", result)

    def test_get_linkedin_profile_reflects_disconnected_state(self):
        result = linkedin_tools.get_linkedin_profile.func()
        self.assertFalse(result["connected"])
        self.assertIn("health", result)

    def test_get_linkedin_content_activity_only_counts_published_drafts(self):
        LinkedInDraft.objects.create(body="a", status=LinkedInDraft.Status.PUBLISHED)
        LinkedInDraft.objects.create(body="b", status=LinkedInDraft.Status.DRAFT)

        result = linkedin_tools.get_linkedin_content_activity.func(period_days=30)

        self.assertEqual(result["posts_published"], 1)
        self.assertEqual(result["data_source"], "mirabel_publishing_record")

    def test_get_linkedin_automation_status_lists_configured_automations(self):
        LinkedInAutomation.objects.create(name="Sync", type=LinkedInAutomation.Type.PROFILE_SYNC)

        result = linkedin_tools.get_linkedin_automation_status.func()

        self.assertEqual(len(result["automations"]), 1)
        self.assertEqual(result["automations"][0]["type"], "profile_sync")

    def test_get_linkedin_activity_summary_is_grounded_in_real_data_only(self):
        result = linkedin_tools.get_linkedin_activity_summary.func()
        self.assertIn("profile_health", result)
        self.assertIn("activity", result)
        self.assertIn("automations", result)


class SpotifyToolsTests(APITestCase):
    """Unit coverage for agent/tools/spotify_tools.py per docs/EXTENDING.md
    §2.6: call the tool function directly, assert the returned dict shape,
    and that a SpotifyError is always caught and turned into {"error": ...}
    rather than raised (an uncaught exception here would kill the whole
    agent turn instead of giving the model something to react to)."""

    def test_check_connection_reflects_disconnected_state(self):
        result = spotify_tools.check_spotify_connection.func()
        self.assertFalse(result["connected"])

    @patch("agent.tools.spotify_tools.client.search")
    @patch("agent.tools.spotify_tools.get_active_access_token", return_value="token")
    def test_search_spotify_never_raises_on_provider_error(self, mock_token, mock_search):
        mock_search.side_effect = SpotifyError("rate limited", reason="rate_limited")

        result = spotify_tools.search_spotify.func(query="lofi", types="track", limit=10)

        self.assertIn("error", result)

    @patch("agent.tools.spotify_tools.client.search")
    @patch("agent.tools.spotify_tools.get_active_access_token", return_value="token")
    def test_search_spotify_compacts_five_or_more_uniform_tracks(self, mock_token, mock_search):
        tracks = [
            {"id": str(i), "uri": f"spotify:track:{i}", "name": f"Track {i}", "artists": [{"name": "Artist"}]}
            for i in range(6)
        ]
        mock_search.return_value = {"tracks": {"items": tracks}}

        result = spotify_tools.search_spotify.func(query="lofi", types="track", limit=10)

        self.assertIsInstance(result["tracks"], str)
        self.assertIn("6 items", result["tracks"])

    @patch("agent.tools.spotify_tools.client.search")
    @patch("agent.tools.spotify_tools.get_active_access_token", return_value="token")
    def test_search_spotify_leaves_small_result_sets_as_a_plain_list(self, mock_token, mock_search):
        mock_search.return_value = {
            "tracks": {"items": [{"id": "1", "uri": "spotify:track:1", "name": "Track 1", "artists": []}]}
        }

        result = spotify_tools.search_spotify.func(query="lofi", types="track", limit=10)

        self.assertIsInstance(result["tracks"], list)

    def test_control_playback_rejects_invalid_action_without_calling_spotify(self):
        result = spotify_tools.control_spotify_playback.func(action="rewind")
        self.assertIn("error", result)

    @patch("agent.tools.spotify_tools.require_confirmation")
    def test_create_playlist_rejected_never_touches_spotify(self, mock_confirm):
        mock_confirm.return_value = {"approved": False, "args": None}

        result = spotify_tools.create_spotify_playlist.func(name="Road Trip", description="", track_uris=[])

        self.assertFalse(result["created"])
        self.assertIn("did not approve", result["message"])

    @patch("agent.tools.spotify_tools.client.add_playlist_tracks")
    @patch("agent.tools.spotify_tools.client.create_playlist")
    @patch("agent.tools.spotify_tools.get_active_access_token", return_value="token")
    @patch("agent.tools.spotify_tools.require_confirmation")
    def test_create_playlist_approved_creates_and_adds_tracks(
        self, mock_confirm, mock_token, mock_create, mock_add
    ):
        mock_confirm.return_value = {"approved": True, "args": None}
        mock_create.return_value = {"id": "pl123", "external_urls": {"spotify": "https://open.spotify.com/playlist/pl123"}}

        result = spotify_tools.create_spotify_playlist.func(
            name="Road Trip", description="", track_uris=["spotify:track:1"]
        )

        self.assertTrue(result["created"])
        self.assertEqual(result["playlist_id"], "pl123")
        mock_add.assert_called_once_with("token", "pl123", ["spotify:track:1"])


class MessageTextExtractionTests(APITestCase):
    """Regression coverage for a real bug caught during live testing: Gemini
    (langchain_google_genai) returns AIMessage.content as a list of
    content-block dicts, not a plain string. A naive str(content) fallback
    dumped raw Python repr — including internal fields like a signed
    'extras' blob — straight into what gets shown to the user."""

    def test_plain_string_content(self):
        msg = AIMessage(content="hello there")
        self.assertEqual(_message_text(msg), "hello there")

    def test_list_of_text_blocks_content(self):
        msg = AIMessage(content=[{"type": "text", "text": "hello "}, {"type": "text", "text": "there"}])
        self.assertEqual(_message_text(msg), "hello there")

    def test_list_content_ignores_non_text_blocks(self):
        msg = AIMessage(
            content=[
                {"type": "text", "text": "hello there"},
                {"type": "thinking", "thinking": "internal reasoning that shouldn't leak"},
            ]
        )
        self.assertEqual(_message_text(msg), "hello there")


class AgentTaskApiTests(APITestCase):
    def test_create_task_enqueues_celery_job(self):
        fake_result = MagicMock(id="fake-celery-id-1")
        with patch("agent.views.run_agent_task.delay", return_value=fake_result) as mock_delay:
            response = self.client.post("/api/agent/tasks/", {"instruction": "list my kanban projects"})

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["status"], AgentTask.Status.QUEUED)
        mock_delay.assert_called_once()
        task = AgentTask.objects.get(pk=response.data["id"])
        self.assertEqual(task.celery_task_id, "fake-celery-id-1")

    def test_create_task_requires_instruction(self):
        response = self.client.post("/api/agent/tasks/", {"instruction": "   "})
        self.assertEqual(response.status_code, 400)

    def test_create_task_links_conversation_when_given(self):
        conversation = Conversation.objects.create()
        with patch("agent.views.run_agent_task.delay", return_value=MagicMock(id="x")):
            response = self.client.post(
                "/api/agent/tasks/", {"instruction": "do something", "conversation_id": conversation.id}
            )
        self.assertEqual(response.data["conversation_id"], conversation.id)

    def test_list_and_detail(self):
        task = AgentTask.objects.create(instruction="do a thing")
        listing = self.client.get("/api/agent/tasks/")
        self.assertEqual(listing.status_code, 200)
        self.assertIn(task.id, [t["id"] for t in listing.data["tasks"]])

        detail = self.client.get(f"/api/agent/tasks/{task.id}/")
        self.assertEqual(detail.status_code, 200)
        self.assertEqual(detail.data["instruction"], "do a thing")

    def test_list_is_paginated(self):
        for i in range(25):
            AgentTask.objects.create(instruction=f"task {i}")

        page1 = self.client.get("/api/agent/tasks/", {"page_size": 10})
        self.assertEqual(page1.status_code, 200)
        self.assertEqual(page1.data["total"], 25)
        self.assertEqual(page1.data["page"], 1)
        self.assertEqual(page1.data["page_size"], 10)
        self.assertEqual(len(page1.data["tasks"]), 10)

        page2 = self.client.get("/api/agent/tasks/", {"page": 2, "page_size": 10})
        self.assertEqual(len(page2.data["tasks"]), 10)
        self.assertEqual(
            set(t["id"] for t in page1.data["tasks"]).intersection(t["id"] for t in page2.data["tasks"]),
            set(),
        )

        page3 = self.client.get("/api/agent/tasks/", {"page": 3, "page_size": 10})
        self.assertEqual(len(page3.data["tasks"]), 5)

        oversized = self.client.get("/api/agent/tasks/", {"page_size": 9999})
        self.assertEqual(oversized.data["page_size"], 100)

    def test_approve_requires_awaiting_confirmation_status(self):
        task = AgentTask.objects.create(instruction="do a thing", status=AgentTask.Status.RUNNING)
        response = self.client.post(f"/api/agent/tasks/{task.id}/approve/")
        self.assertEqual(response.status_code, 404)

    def test_approve_resumes_awaiting_confirmation_task(self):
        task = AgentTask.objects.create(
            instruction="publish something",
            status=AgentTask.Status.AWAITING_CONFIRMATION,
            pending_action={"tool": "publish_linkedin_draft", "summary": "publish it", "args": {"draft_id": 1}},
        )
        with patch("agent.services.lifecycle.resume_agent_task.delay", return_value=MagicMock(id="resume-1")) as mock_delay:
            response = self.client.post(f"/api/agent/tasks/{task.id}/approve/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["status"], AgentTask.Status.RUNNING)
        mock_delay.assert_called_once_with(task.id, {"approved": True, "args": None})

    def test_reject_resumes_with_approved_false(self):
        task = AgentTask.objects.create(
            instruction="publish something",
            status=AgentTask.Status.AWAITING_CONFIRMATION,
            pending_action={"tool": "publish_linkedin_draft", "summary": "publish it", "args": {}},
        )
        with patch("agent.services.lifecycle.resume_agent_task.delay", return_value=MagicMock(id="resume-2")) as mock_delay:
            response = self.client.post(f"/api/agent/tasks/{task.id}/reject/")

        self.assertEqual(response.status_code, 200)
        mock_delay.assert_called_once_with(task.id, {"approved": False, "args": None})

    def test_answer_requires_awaiting_clarification_status(self):
        task = AgentTask.objects.create(instruction="do a thing", status=AgentTask.Status.RUNNING)
        response = self.client.post(f"/api/agent/tasks/{task.id}/answer/", {"answer": "the CS101 professor"})
        self.assertEqual(response.status_code, 404)

    def test_answer_requires_nonempty_answer(self):
        task = AgentTask.objects.create(
            instruction="email my professor",
            status=AgentTask.Status.AWAITING_CLARIFICATION,
            pending_action={"kind": "clarify", "question": "Which professor?"},
        )
        response = self.client.post(f"/api/agent/tasks/{task.id}/answer/", {"answer": "   "})
        self.assertEqual(response.status_code, 400)

    def test_answer_resumes_awaiting_clarification_task(self):
        task = AgentTask.objects.create(
            instruction="email my professor",
            status=AgentTask.Status.AWAITING_CLARIFICATION,
            pending_action={"kind": "clarify", "question": "Which professor?"},
        )
        with patch("agent.services.lifecycle.resume_agent_task.delay", return_value=MagicMock(id="resume-3")) as mock_delay:
            response = self.client.post(f"/api/agent/tasks/{task.id}/answer/", {"answer": "the CS101 professor"})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["status"], AgentTask.Status.RUNNING)
        self.assertIsNone(response.data["pending_action"])
        mock_delay.assert_called_once_with(task.id, {"answer": "the CS101 professor"})

    def test_cancel_only_works_from_cancellable_states(self):
        done_task = AgentTask.objects.create(instruction="x", status=AgentTask.Status.DONE)
        response = self.client.post(f"/api/agent/tasks/{done_task.id}/cancel/")
        self.assertEqual(response.status_code, 404)

        queued_task = AgentTask.objects.create(instruction="x", status=AgentTask.Status.QUEUED)
        response = self.client.post(f"/api/agent/tasks/{queued_task.id}/cancel/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["status"], AgentTask.Status.CANCELLED)


class RunGraphInterruptKindTests(APITestCase):
    """agent/tasks.py::_run_graph must route an interrupt to the right
    AgentTask status based on its "kind" tag — "clarify" (a clarifying
    question, agent/tools/conversation_tools.py) vs "confirm" (an
    irreversible action awaiting approval, agent/tools/_common.py)."""

    def _stream_with_interrupt(self, value: dict):
        return iter([{"__interrupt__": (SimpleNamespace(value=value),)}])

    def test_clarify_interrupt_sets_awaiting_clarification(self):
        from agent.tasks import _run_graph

        task = AgentTask.objects.create(instruction="email my professor")
        fake_agent = MagicMock()
        fake_agent.stream.return_value = self._stream_with_interrupt(
            {"kind": "clarify", "question": "Which professor?"}
        )
        with patch("agent.tasks.build_agent", return_value=fake_agent):
            _run_graph(task, {"messages": [("user", task.instruction)]})

        task.refresh_from_db()
        self.assertEqual(task.status, AgentTask.Status.AWAITING_CLARIFICATION)
        self.assertEqual(task.pending_action["question"], "Which professor?")

    def test_confirm_interrupt_sets_awaiting_confirmation(self):
        from agent.tasks import _run_graph

        task = AgentTask.objects.create(instruction="publish something")
        fake_agent = MagicMock()
        fake_agent.stream.return_value = self._stream_with_interrupt(
            {"kind": "confirm", "tool": "publish_linkedin_draft", "summary": "publish it", "args": {}}
        )
        with patch("agent.tasks.build_agent", return_value=fake_agent):
            _run_graph(task, {"messages": [("user", task.instruction)]})

        task.refresh_from_db()
        self.assertEqual(task.status, AgentTask.Status.AWAITING_CONFIRMATION)


class NotifyVoiceSessionTests(APITestCase):
    """_run_graph calls _notify_voice_session on every interrupt so a voice/
    chat session that started the task hears the clarifying question /
    confirmation summary through Mirabel's real edge-tts voice instead of
    the frontend's old window.speechSynthesis fallback — see
    voice/consumers.py's agent_speak. Covers the group_send payload shape
    directly rather than through a full _run_graph run (already covered
    above) so a text-shaping regression here fails independently of the
    graph-routing tests."""

    def test_clarify_interrupt_sends_the_question(self):
        from agent.tasks import _notify_voice_session

        with patch("agent.tasks.get_channel_layer") as mock_get_layer:
            mock_layer = MagicMock()
            mock_get_layer.return_value = mock_layer
            with patch("agent.tasks.async_to_sync") as mock_async_to_sync:
                _notify_voice_session(42, {"kind": "clarify", "question": "Which professor?"})

        mock_async_to_sync.assert_called_once_with(mock_layer.group_send)
        mock_async_to_sync.return_value.assert_called_once_with(
            AgentTask.voice_group_name(42),
            {"type": "agent.speak", "task_id": 42, "text": "Which professor?"},
        )

    def test_confirm_interrupt_sends_summary_plus_prompt(self):
        from agent.tasks import _notify_voice_session

        with patch("agent.tasks.get_channel_layer") as mock_get_layer:
            mock_layer = MagicMock()
            mock_get_layer.return_value = mock_layer
            with patch("agent.tasks.async_to_sync") as mock_async_to_sync:
                _notify_voice_session(
                    7, {"kind": "confirm", "tool": "publish_linkedin_draft", "summary": "publish it", "args": {}}
                )

        mock_async_to_sync.return_value.assert_called_once_with(
            AgentTask.voice_group_name(7),
            {"type": "agent.speak", "task_id": 7, "text": "publish it. Approve or reject?"},
        )

    def test_no_channel_layer_configured_is_a_silent_noop(self):
        from agent.tasks import _notify_voice_session

        with patch("agent.tasks.get_channel_layer", return_value=None):
            _notify_voice_session(1, {"kind": "clarify", "question": "x?"})  # must not raise


class ExtractStepsTests(APITestCase):
    def test_extract_steps_pulls_tool_name_and_result(self):
        from agent.tasks import _extract_steps

        messages = [
            AIMessage(content="", tool_calls=[{"name": "list_kanban_projects", "args": {}, "id": "call_1"}]),
            ToolMessage(content='[{"id": 1, "name": "General"}]', name="list_kanban_projects", tool_call_id="call_1"),
        ]
        steps = _extract_steps(messages)
        self.assertEqual(len(steps), 1)
        self.assertEqual(steps[0]["tool"], "list_kanban_projects")
        self.assertIn("General", steps[0]["result_summary"])


class LifecycleServiceTests(APITestCase):
    """agent/services/lifecycle.py is called both by the REST views (see
    AgentTaskApiTests above, through the HTTP layer) and directly by
    voice/consumers.py — these tests exercise the functions themselves so
    the voice path's usage is covered without going through a websocket."""

    def test_resume_confirmation_wrong_status_returns_none(self):
        task = AgentTask.objects.create(instruction="x", status=AgentTask.Status.RUNNING)
        self.assertIsNone(resume_confirmation(task.id, approved=True, args=None))

    def test_resume_confirmation_approves_and_filters_unknown_arg_keys(self):
        task = AgentTask.objects.create(
            instruction="email someone",
            status=AgentTask.Status.AWAITING_CONFIRMATION,
            pending_action={"tool": "send_outlook_email_now", "summary": "send it", "args": {"to": "a@b.com"}},
        )
        with patch("agent.services.lifecycle.resume_agent_task.delay", return_value=MagicMock(id="r1")) as mock_delay:
            result = resume_confirmation(task.id, approved=True, args={"to": "c@d.com", "sneaky": "x"})

        self.assertIsNotNone(result)
        self.assertEqual(result.status, AgentTask.Status.RUNNING)
        mock_delay.assert_called_once_with(task.id, {"approved": True, "args": {"to": "c@d.com"}})

    def test_resume_clarification_wrong_status_returns_none(self):
        task = AgentTask.objects.create(instruction="x", status=AgentTask.Status.DONE)
        self.assertIsNone(resume_clarification(task.id, answer="the CS101 professor"))

    def test_resume_clarification_resumes_with_answer(self):
        task = AgentTask.objects.create(
            instruction="email my professor",
            status=AgentTask.Status.AWAITING_CLARIFICATION,
            pending_action={"kind": "clarify", "question": "Which professor?"},
        )
        with patch("agent.services.lifecycle.resume_agent_task.delay", return_value=MagicMock(id="r2")) as mock_delay:
            result = resume_clarification(task.id, answer="the CS101 professor")

        self.assertEqual(result.status, AgentTask.Status.RUNNING)
        mock_delay.assert_called_once_with(task.id, {"answer": "the CS101 professor"})

    def test_cancel_if_cancellable_running_returns_none(self):
        task = AgentTask.objects.create(instruction="x", status=AgentTask.Status.RUNNING)
        self.assertIsNone(cancel_if_cancellable(task.id))

    def test_cancel_if_cancellable_queued_cancels(self):
        task = AgentTask.objects.create(instruction="x", status=AgentTask.Status.QUEUED)
        result = cancel_if_cancellable(task.id)
        self.assertEqual(result.status, AgentTask.Status.CANCELLED)


class ListOutlookInboxCompactionTests(APITestCase):
    """Pass 6: list_outlook_inbox compacts its `messages` array via
    core.services.text_utils.encode_compact_list once there are enough of
    them to be worth it — below the gate the shape must stay exactly as
    before (a list of dicts), so existing callers/tests aren't surprised."""

    def _messages(self, n: int) -> list[dict]:
        return [
            {"id": str(i), "subject": f"Subject {i}", "bodyPreview": f"Preview {i}"} for i in range(n)
        ]

    @patch("agent.tools.outlook_tools.graph_client.list_inbox_messages")
    @patch("agent.tools.outlook_tools.oauth.get_valid_access_token", return_value="token")
    def test_small_inbox_returns_plain_list_unchanged(self, mock_token, mock_list):
        from agent.tools.outlook_tools import list_outlook_inbox

        mock_list.return_value = self._messages(2)
        result = list_outlook_inbox.invoke({"domain": "", "sender": "", "top": 10})

        self.assertIsInstance(result["messages"], list)
        self.assertEqual(len(result["messages"]), 2)

    @patch("agent.tools.outlook_tools.graph_client.list_inbox_messages")
    @patch("agent.tools.outlook_tools.oauth.get_valid_access_token", return_value="token")
    def test_large_inbox_returns_compact_string(self, mock_token, mock_list):
        from agent.tools.outlook_tools import list_outlook_inbox

        mock_list.return_value = self._messages(8)
        result = list_outlook_inbox.invoke({"domain": "", "sender": "", "top": 10})

        self.assertIsInstance(result["messages"], str)
        self.assertIn("8 items", result["messages"])
        self.assertIn("Subject 0", result["messages"])


class TrimAgentMessagesTests(APITestCase):
    """agent/graph.py's pre_model_hook bounds a long-running agent task's
    message history without ever splitting an AIMessage-with-tool_calls
    from its ToolMessage(s) — a split pair is rejected outright by
    Anthropic/OpenAI ("tool_use without tool_result")."""

    def _tool_round(self, i: int, n_tool_msgs: int = 1) -> list:
        ai = AIMessage(content="", tool_calls=[{"name": "t", "args": {}, "id": f"call_{i}"}])
        tools = [ToolMessage(content=f"result {i}", tool_call_id=f"call_{i}") for _ in range(n_tool_msgs)]
        return [ai, *tools]

    def test_short_history_passes_through_unchanged(self):
        from langchain_core.messages import HumanMessage

        from agent.graph import _trim_agent_messages

        messages = [HumanMessage(content="do the thing"), *self._tool_round(1)]
        result = _trim_agent_messages({"messages": messages})
        self.assertEqual(result["llm_input_messages"], messages)

    def test_long_history_keeps_first_message_and_never_splits_a_tool_pair(self):
        from langchain_core.messages import HumanMessage

        from agent.graph import _trim_agent_messages

        first = HumanMessage(content="original instruction")
        messages = [first]
        for i in range(15):
            messages.extend(self._tool_round(i))

        result = _trim_agent_messages({"messages": messages})["llm_input_messages"]

        self.assertLessEqual(len(result), 20)
        self.assertEqual(result[0], first)
        # No ToolMessage may appear without its AIMessage immediately before
        # it (or before it in the same kept run) — reconstruct groups from
        # the trimmed output and assert every group starts with a non-Tool
        # message.
        for i, msg in enumerate(result):
            if isinstance(msg, ToolMessage):
                self.assertTrue(
                    i > 0 and isinstance(result[i - 1], (AIMessage, ToolMessage)),
                    "a ToolMessage was orphaned by trimming",
                )

    def test_one_oversized_recent_group_does_not_collapse_older_groups_that_fit(self):
        """Regression test: the reverse-walk used to `break` on the first
        group that didn't fit the remaining budget, discarding every older
        group even ones that would easily fit — collapsing to just the
        first message whenever the single most recent group happened to be
        large. It should skip only that one oversized group and keep
        scanning older/smaller ones, per the docstring's own claim of
        keeping "as many of the most recent whole tool-call groups as fit"."""
        from langchain_core.messages import HumanMessage

        from agent.graph import _trim_agent_messages

        first = HumanMessage(content="original instruction")
        # 5 older, small groups (2 messages each = 10 total) that comfortably
        # fit the ~19-message remaining budget...
        small_groups = []
        for i in range(5):
            small_groups.extend(self._tool_round(i))
        # ...followed by one oversized most-recent group (21 messages: 1
        # AIMessage + 20 ToolMessages) that alone exceeds the budget.
        oversized_group = self._tool_round(99, n_tool_msgs=20)

        messages = [first, *small_groups, *oversized_group]
        result = _trim_agent_messages({"messages": messages})["llm_input_messages"]

        self.assertEqual(result[0], first)
        # The old `break` behavior would leave result == [first] here.
        self.assertGreater(len(result), 1)
        # All 5 older small groups should have fit and been kept.
        self.assertEqual(len(result), 1 + len(small_groups))


class ResolveResultLinkTests(APITestCase):
    """Unit coverage for agent/tools/links.py per docs/EXTENDING.md §2.6:
    call the function directly, assert the returned dict shape, and that a
    malformed/unexpected result never raises (this runs on the hot path of
    every tool-call step in agent/tasks.py::_record_step)."""

    def test_unknown_tool_returns_none(self):
        self.assertIsNone(resolve_result_link("some_read_only_tool", "{}"))

    def test_malformed_json_returns_none_not_raise(self):
        self.assertIsNone(resolve_result_link("create_spotify_playlist", "not json"))

    def test_non_dict_json_returns_none(self):
        self.assertIsNone(resolve_result_link("create_spotify_playlist", "[1, 2, 3]"))

    def test_rejected_confirmation_result_yields_no_link(self):
        result = json.dumps({"created": False, "message": "The user did not approve this action."})
        self.assertIsNone(resolve_result_link("create_spotify_playlist", result))

    def test_spotify_playlist_created_links_to_external_url(self):
        result = json.dumps({"created": True, "playlist_id": "pl1", "url": "https://open.spotify.com/playlist/pl1"})
        link = resolve_result_link("create_spotify_playlist", result)
        self.assertEqual(link, {"label": "Open playlist on Spotify", "url": "https://open.spotify.com/playlist/pl1"})

    def test_spotify_playlist_created_without_url_yields_no_link(self):
        result = json.dumps({"created": True, "playlist_id": "pl1"})
        self.assertIsNone(resolve_result_link("create_spotify_playlist", result))

    def test_linkedin_publish_builds_feed_url_from_post_urn(self):
        result = json.dumps({"published": True, "post_urn": "urn:li:share:12345"})
        link = resolve_result_link("publish_linkedin_draft", result)
        self.assertEqual(link, {"label": "View post on LinkedIn", "url": "https://www.linkedin.com/feed/update/urn:li:share:12345/"})

    def test_kanban_task_created_links_to_board(self):
        result = json.dumps({"id": 7, "title": "Do the thing", "status": "todo"})
        link = resolve_result_link("create_kanban_task", result)
        self.assertEqual(link, {"label": "View Kanban board", "path": "/home/tasks"})

    def test_schedule_outlook_email_links_to_scheduled_tab(self):
        result = json.dumps({"id": 3, "send_at": "2026-09-10T10:00:00Z", "status": "pending"})
        link = resolve_result_link("schedule_outlook_email", result)
        self.assertEqual(link, {"label": "View scheduled emails", "path": "/home/outlook/scheduled"})


class RecordStepResultLinksTests(APITestCase):
    """agent/tasks.py::_record_step must accumulate result_links the same
    way it already accumulates `steps` — incrementally, deduped, and safe
    to call again with an identical tool result (e.g. across a
    run_agent_task -> resume_agent_task cycle)."""

    def test_linkable_tool_result_appends_a_link(self):
        task = AgentTask.objects.create(instruction="make me a playlist")
        message = ToolMessage(
            content='{"created": true, "playlist_id": "pl1", "url": "https://open.spotify.com/playlist/pl1"}',
            name="create_spotify_playlist",
            tool_call_id="call_1",
        )

        _record_step(task, "tools", message)

        task.refresh_from_db()
        self.assertEqual(
            task.result_links, [{"label": "Open playlist on Spotify", "url": "https://open.spotify.com/playlist/pl1"}]
        )

    def test_duplicate_link_is_not_appended_twice(self):
        task = AgentTask.objects.create(instruction="update two playlists")
        message = ToolMessage(content='{"updated": true}', name="update_spotify_playlist_details", tool_call_id="c1")

        _record_step(task, "tools", message)
        _record_step(task, "tools", message)

        task.refresh_from_db()
        self.assertEqual(len(task.result_links), 1)

    def test_non_linkable_tool_result_leaves_result_links_empty(self):
        task = AgentTask.objects.create(instruction="list my kanban projects")
        message = ToolMessage(content="[]", name="list_kanban_projects", tool_call_id="call_1")

        _record_step(task, "tools", message)

        task.refresh_from_db()
        self.assertEqual(task.result_links, [])
