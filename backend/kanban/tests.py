from unittest.mock import patch

from django.db import IntegrityError, transaction
from rest_framework.test import APITestCase

from kanban.models import KanbanTask, Project


class ProjectApiTests(APITestCase):
    def test_create_list_retrieve_update_delete_project(self):
        create = self.client.post("/api/projects/", {"name": "Website Redesign", "description": "Q3 launch"})
        self.assertEqual(create.status_code, 201)
        project_id = create.data["id"]

        listing = self.client.get("/api/projects/")
        self.assertEqual(listing.status_code, 200)
        self.assertIn(project_id, [p["id"] for p in listing.data["projects"]])

        retrieve = self.client.get(f"/api/projects/{project_id}/")
        self.assertEqual(retrieve.status_code, 200)
        self.assertEqual(retrieve.data["name"], "Website Redesign")

        rename = self.client.put(f"/api/projects/{project_id}/", {"name": "Website Relaunch"}, format="json")
        self.assertEqual(rename.status_code, 200)
        self.assertEqual(rename.data["name"], "Website Relaunch")

        delete = self.client.delete(f"/api/projects/{project_id}/")
        self.assertEqual(delete.status_code, 204)
        self.assertEqual(self.client.get(f"/api/projects/{project_id}/").status_code, 404)

    def test_create_project_requires_name(self):
        response = self.client.post("/api/projects/", {"name": "   "})
        self.assertEqual(response.status_code, 400)

    def test_deleting_project_cascades_its_tasks(self):
        project = Project.objects.create(name="Temp Project")
        task = KanbanTask.objects.create(project=project, title="Some task")

        self.client.delete(f"/api/projects/{project.id}/")

        self.assertFalse(KanbanTask.objects.filter(pk=task.id).exists())


class TaskProjectIsolationTests(APITestCase):
    """Covers the acceptance-critical guarantee: operations scoped to one
    project must never read or mutate another project's tasks."""

    def setUp(self):
        self.project_a = Project.objects.create(name="Project A")
        self.project_b = Project.objects.create(name="Project B")

    def _create_task(self, project_id, **overrides):
        payload = {"title": "Untitled task", "status": "todo"}
        payload.update(overrides)
        response = self.client.post(f"/api/projects/{project_id}/tasks/", payload, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        return response.data

    def test_task_creation_and_listing_is_scoped_to_its_project(self):
        self._create_task(self.project_a.id, title="A1")
        self._create_task(self.project_a.id, title="A2")
        self._create_task(self.project_b.id, title="B1")

        a_tasks = self.client.get(f"/api/projects/{self.project_a.id}/tasks/").data["tasks"]
        b_tasks = self.client.get(f"/api/projects/{self.project_b.id}/tasks/").data["tasks"]

        self.assertEqual({t["title"] for t in a_tasks}, {"A1", "A2"})
        self.assertEqual({t["title"] for t in b_tasks}, {"B1"})

    def test_task_detail_404s_when_accessed_through_the_wrong_project(self):
        b_task = self._create_task(self.project_b.id, title="B1")

        response = self.client.put(
            f"/api/projects/{self.project_a.id}/tasks/{b_task['id']}/",
            {"title": "hijacked"},
            format="json",
        )

        self.assertEqual(response.status_code, 404)
        b_task_reloaded = KanbanTask.objects.get(pk=b_task["id"])
        self.assertEqual(b_task_reloaded.title, "B1")

    def test_task_delete_is_scoped_to_its_project(self):
        b_task = self._create_task(self.project_b.id, title="B1")

        response = self.client.delete(f"/api/projects/{self.project_a.id}/tasks/{b_task['id']}/")

        self.assertEqual(response.status_code, 404)
        self.assertTrue(KanbanTask.objects.filter(pk=b_task["id"]).exists())

    def test_reordering_project_a_does_not_touch_project_b(self):
        a1 = self._create_task(self.project_a.id, title="A1")
        a2 = self._create_task(self.project_a.id, title="A2")
        b1 = self._create_task(self.project_b.id, title="B1")
        b1_updated_at_before = KanbanTask.objects.get(pk=b1["id"]).updated_at

        response = self.client.patch(
            f"/api/projects/{self.project_a.id}/tasks/reorder/",
            {"status": "todo", "ordered_ids": [a2["id"], a1["id"]]},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        reordered = KanbanTask.objects.get(pk=a2["id"])
        self.assertEqual(reordered.position, 0)
        b1_reloaded = KanbanTask.objects.get(pk=b1["id"])
        self.assertEqual(b1_reloaded.updated_at, b1_updated_at_before)

    def test_reorder_rejects_a_task_id_belonging_to_another_project(self):
        a1 = self._create_task(self.project_a.id, title="A1")
        b1 = self._create_task(self.project_b.id, title="B1")

        response = self.client.patch(
            f"/api/projects/{self.project_a.id}/tasks/reorder/",
            {"status": "todo", "ordered_ids": [a1["id"], b1["id"]]},
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        # Neither task should have moved.
        self.assertEqual(KanbanTask.objects.get(pk=a1["id"]).position, 0)
        self.assertEqual(KanbanTask.objects.get(pk=b1["id"]).position, 0)

    def test_status_moves_through_todo_in_progress_done(self):
        task = self._create_task(self.project_a.id, title="A1")
        task_id = task["id"]

        to_in_progress = self.client.put(
            f"/api/projects/{self.project_a.id}/tasks/{task_id}/", {"status": "in_progress"}, format="json"
        )
        self.assertEqual(to_in_progress.data["status"], "in_progress")

        to_done = self.client.put(
            f"/api/projects/{self.project_a.id}/tasks/{task_id}/", {"status": "done"}, format="json"
        )
        self.assertEqual(to_done.data["status"], "done")

    def test_task_requires_a_project_at_the_model_level(self):
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                KanbanTask.objects.create(title="Orphan task")


class BraindumpScopingTests(APITestCase):
    def setUp(self):
        self.project = Project.objects.create(name="Project A")

    def test_braindump_404s_for_a_nonexistent_project(self):
        response = self.client.post(
            "/api/projects/999999/tasks/braindump/", {"transcript": "email the client"}, format="json"
        )
        self.assertEqual(response.status_code, 404)

    @patch("kanban.views.process_braindump")
    def test_braindump_forwards_result_without_persisting_anything(self, mock_process):
        mock_process.return_value = {
            "tasks": [{"title": "Email client", "priority": "High", "effort": "Low", "due_date": None}],
            "error": False,
            "reason": None,
        }

        response = self.client.post(
            f"/api/projects/{self.project.id}/tasks/braindump/",
            {"transcript": "urgently email the client"},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["tasks"][0]["title"], "Email client")
        mock_process.assert_called_once_with("urgently email the client")
        # Brain dump only proposes tasks — accepting one is a separate,
        # explicit POST through the same endpoint manual cards use.
        self.assertEqual(KanbanTask.objects.filter(project=self.project).count(), 0)

    def test_accepting_a_suggestion_uses_the_same_creation_path_as_a_manual_task(self):
        suggestion = {
            "title": "Email client",
            "description_markdown": "Follow up on the contract.",
            "priority": "High",
            "effort": "Low",
            "due_date": None,
            "status": "todo",
            "source": "ai",
        }

        response = self.client.post(f"/api/projects/{self.project.id}/tasks/", suggestion, format="json")

        self.assertEqual(response.status_code, 201)
        task = KanbanTask.objects.get(pk=response.data["id"])
        self.assertEqual(task.source, KanbanTask.SOURCE_AI)
        self.assertEqual(task.project_id, self.project.id)
