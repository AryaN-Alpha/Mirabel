from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from langchain_core.messages import AIMessage, ToolMessage
from rest_framework.test import APITestCase

from agent.models import AgentTask
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
        with patch("agent.views.resume_agent_task.delay", return_value=MagicMock(id="resume-1")) as mock_delay:
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
        with patch("agent.views.resume_agent_task.delay", return_value=MagicMock(id="resume-2")) as mock_delay:
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
        with patch("agent.views.resume_agent_task.delay", return_value=MagicMock(id="resume-3")) as mock_delay:
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
