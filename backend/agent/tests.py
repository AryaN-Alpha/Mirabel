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
from agent.tasks import _message_text
from core.models import Conversation


class AgentTaskModelTests(APITestCase):
    def test_thread_id_is_derived_from_pk(self):
        task = AgentTask.objects.create(instruction="do a thing")
        self.assertEqual(task.thread_id, f"agent-task-{task.id}")


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
