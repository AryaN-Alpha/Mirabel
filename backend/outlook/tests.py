from unittest.mock import patch

from django.test import TestCase

from outlook.services.email_ai import _MAX_ORIGINAL_BODY_CHARS, generate_reply_draft


class GenerateReplyDraftBodyCapTests(TestCase):
    """Regression coverage: outlook/views.py::generate_reply (the REST
    endpoint) used to pass the raw Graph message body straight through with
    no size cap at all — unlike agent/tools/outlook_tools.py's tool path,
    which already truncated before calling in. A long HTML/multi-quote email
    thread had no bound on prompt cost through this endpoint. The cap now
    lives inside generate_reply_draft itself so both callers are covered."""

    @patch("outlook.services.email_ai.get_provider")
    def test_long_body_is_truncated_before_reaching_the_provider(self, mock_get_provider):
        mock_get_provider.return_value.generate_text.return_value = "Thanks, got it."

        long_body = "a" * (_MAX_ORIGINAL_BODY_CHARS * 2)
        generate_reply_draft(
            original_subject="Hi",
            original_sender="a@example.com",
            original_body_text=long_body,
        )

        sent_content = mock_get_provider.return_value.generate_text.call_args.kwargs["history"][0]["content"]
        self.assertLess(len(sent_content), len(long_body))
        self.assertIn("truncated", sent_content)

    @patch("outlook.services.email_ai.get_provider")
    def test_short_body_passes_through_unchanged(self, mock_get_provider):
        mock_get_provider.return_value.generate_text.return_value = "Thanks, got it."

        short_body = "Just checking in on this."
        generate_reply_draft(
            original_subject="Hi",
            original_sender="a@example.com",
            original_body_text=short_body,
        )

        sent_content = mock_get_provider.return_value.generate_text.call_args.kwargs["history"][0]["content"]
        self.assertIn(short_body, sent_content)
        self.assertNotIn("truncated", sent_content)
