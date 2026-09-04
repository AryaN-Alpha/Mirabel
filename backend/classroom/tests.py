from unittest.mock import patch

from django.test import TestCase

from core.models import ModelPreference
from classroom.services.solver import solve_coursework


class SolveCourseworkModelSelectionTests(TestCase):
    """Unlike cv/services/tailoring.py and the other short-form generation
    call sites, solving coursework deliberately keeps the user's chosen
    (possibly reasoning-tier) model — see solver.py's _generate docstring —
    but must raise the max_tokens floor so a reasoning model's hidden
    chain-of-thought has room to finish before the visible answer, instead
    of silently exhausting a small default budget."""

    @patch("classroom.services.solver.ModelPreference")
    @patch("classroom.services.solver.get_provider")
    def test_deepseek_model_choice_is_preserved_not_overridden(self, mock_get_provider, mock_pref):
        mock_pref.current.return_value = ModelPreference(provider="deepseek", model="deepseek-v4-pro")
        mock_get_provider.return_value.generate_text.return_value = "The answer is 42."

        solve_coursework(
            coursework={"title": "Problem set 3", "description": "Solve for x.", "workType": "ASSIGNMENT"},
            course_name="Algebra II",
            attachment_text="",
        )

        self.assertEqual(mock_get_provider.return_value.generate_text.call_args.kwargs["model"], "deepseek-v4-pro")

    @patch("classroom.services.solver.ModelPreference")
    @patch("classroom.services.solver.get_provider")
    def test_max_tokens_floor_gives_hidden_reasoning_room_to_finish(self, mock_get_provider, mock_pref):
        pref = ModelPreference(provider="deepseek", model="deepseek-v4-pro")
        pref.max_tokens = 400
        mock_pref.current.return_value = pref
        mock_get_provider.return_value.generate_text.return_value = "The answer is 42."

        solve_coursework(
            coursework={"title": "Problem set 3", "description": "Solve for x.", "workType": "ASSIGNMENT"},
            course_name="Algebra II",
            attachment_text="",
        )

        self.assertGreaterEqual(mock_get_provider.return_value.generate_text.call_args.kwargs["max_tokens"], 6000)
