import csv
import io
import json
from unittest.mock import patch

from django.test import TestCase

from core.services.providers.anthropic_provider import _cacheable_system, _with_cache_breakpoint
from core.services.providers.deepseek_provider import _build_messages as _deepseek_build_messages
from core.services.providers.gemini_provider import _to_contents as _gemini_to_contents
from core.services.providers.openai_provider import _with_system_suffix as _openai_with_system_suffix
from core.services.text_utils import encode_compact_list, select_relevant_sentences, truncate_chars


class AnthropicCachingHelpersTests(TestCase):
    def test_cacheable_system_wraps_with_ephemeral_breakpoint(self):
        blocks = _cacheable_system("you are Mirabel")
        self.assertEqual(blocks, [{"type": "text", "text": "you are Mirabel", "cache_control": {"type": "ephemeral"}}])

    def test_cacheable_system_keeps_suffix_out_of_the_cached_block(self):
        # A per-request-varying suffix (e.g. a RAG memory block) must be its
        # own uncached block — folding it into the cached block would make
        # that block byte-different (and so a cache miss) on every request
        # with different retrieved memories.
        blocks = _cacheable_system("you are Mirabel", "# RELEVANT MEMORIES\n- likes pizza")
        self.assertEqual(len(blocks), 2)
        self.assertEqual(blocks[0], {"type": "text", "text": "you are Mirabel", "cache_control": {"type": "ephemeral"}})
        self.assertEqual(blocks[1], {"type": "text", "text": "# RELEVANT MEMORIES\n- likes pizza"})
        self.assertNotIn("cache_control", blocks[1])

    def test_cacheable_system_no_suffix_block_when_suffix_empty(self):
        self.assertEqual(len(_cacheable_system("static prompt", "")), 1)

    def test_with_cache_breakpoint_noop_below_two_messages(self):
        history = [{"role": "user", "content": "hi"}]
        self.assertEqual(_with_cache_breakpoint(history), history)

    def test_with_cache_breakpoint_marks_second_to_last_message(self):
        history = [
            {"role": "user", "content": "first"},
            {"role": "assistant", "content": "second"},
            {"role": "user", "content": "third"},
        ]
        marked = _with_cache_breakpoint(history)
        # Only the second-to-last message is touched; last message and
        # everything before the breakpoint stay exactly as passed in.
        self.assertEqual(marked[0], history[0])
        self.assertEqual(marked[2], history[2])
        self.assertEqual(
            marked[1],
            {"role": "assistant", "content": [{"type": "text", "text": "second", "cache_control": {"type": "ephemeral"}}]},
        )

    def test_with_cache_breakpoint_does_not_mutate_input(self):
        history = [{"role": "user", "content": "a"}, {"role": "assistant", "content": "b"}]
        original = [dict(m) for m in history]
        _with_cache_breakpoint(history)
        self.assertEqual(history, original)


class OpenAISystemSuffixTests(TestCase):
    """OpenAI's caching is fully automatic (no cache_control API) — the
    fix here is purely about keeping `instructions` byte-identical across
    calls by routing dynamic content through a separate leading input item
    instead of concatenating it into the system string."""

    def test_no_suffix_returns_history_unchanged(self):
        history = [{"role": "user", "content": "hi"}]
        self.assertEqual(_openai_with_system_suffix(history, ""), history)

    def test_suffix_becomes_leading_developer_item(self):
        history = [{"role": "user", "content": "hi"}]
        result = _openai_with_system_suffix(history, "memory context")
        self.assertEqual(result[0], {"role": "developer", "content": "memory context"})
        self.assertEqual(result[1:], history)

    def test_does_not_mutate_input(self):
        history = [{"role": "user", "content": "hi"}]
        original = [dict(m) for m in history]
        _openai_with_system_suffix(history, "memory context")
        self.assertEqual(history, original)


class GeminiToContentsTests(TestCase):
    def test_no_suffix_maps_roles_only(self):
        history = [{"role": "user", "content": "hi"}, {"role": "assistant", "content": "hello"}]
        contents = _gemini_to_contents(history)
        self.assertEqual(len(contents), 2)
        self.assertEqual(contents[0].role, "user")
        self.assertEqual(contents[1].role, "model")  # assistant -> model

    def test_suffix_becomes_leading_content(self):
        history = [{"role": "user", "content": "hi"}]
        contents = _gemini_to_contents(history, "memory context")
        self.assertEqual(len(contents), 2)
        self.assertEqual(contents[0].role, "user")
        self.assertEqual(contents[0].parts[0].text, "memory context")
        self.assertEqual(contents[1].parts[0].text, "hi")


class DeepSeekBuildMessagesTests(TestCase):
    def test_no_suffix_just_system_plus_history(self):
        history = [{"role": "user", "content": "hi"}]
        messages = _deepseek_build_messages("persona", "", history)
        self.assertEqual(messages, [{"role": "system", "content": "persona"}, {"role": "user", "content": "hi"}])

    def test_suffix_is_a_separate_message_after_system(self):
        history = [{"role": "user", "content": "hi"}]
        messages = _deepseek_build_messages("persona", "memory context", history)
        self.assertEqual(
            messages,
            [
                {"role": "system", "content": "persona"},
                {"role": "system", "content": "memory context"},
                {"role": "user", "content": "hi"},
            ],
        )


class TruncateCharsTelemetryTests(TestCase):
    def test_text_under_budget_returns_unchanged_and_does_not_log(self):
        with patch("core.services.text_utils.log_truncation") as mock_log:
            result = truncate_chars("short", 100, label="x", call_site="y")
        self.assertEqual(result, "short")
        mock_log.assert_not_called()

    def test_text_over_budget_logs_exactly_once(self):
        with patch("core.services.text_utils.log_truncation") as mock_log:
            truncate_chars("a" * 200, 50, label="x", call_site="y")
        mock_log.assert_called_once_with(label="x", call_site="y", original_chars=200, kept_chars=50)


class SelectRelevantSentencesTests(TestCase):
    def test_text_under_budget_returns_unchanged(self):
        text = "Short text."
        self.assertEqual(select_relevant_sentences(text, query="anything", max_chars=1000), text)

    def test_empty_query_falls_back_to_truncate_chars(self):
        text = "a" * 200
        result = select_relevant_sentences(text, query="", max_chars=50)
        self.assertTrue(result.startswith("a" * 50))
        self.assertIn("truncated", result)

    def test_extraction_preserves_original_order_and_keeps_relevant_sentences(self):
        text = (
            "The company was founded in 2001. "
            "We require 5 years of Python experience. "
            "Free snacks are available every Friday. "
            "Django and PostgreSQL experience is required."
        )
        result = select_relevant_sentences(text, query="Python Django PostgreSQL backend role", max_chars=120)
        lower = result.lower()
        self.assertIn("python", lower)
        self.assertIn("django", lower)
        # Order preserved: the Python sentence must appear before the Django one.
        self.assertLess(lower.index("python"), lower.index("django"))
        self.assertNotIn("snacks", lower)


class EncodeCompactListTests(TestCase):
    def test_below_gate_returns_none(self):
        self.assertIsNone(encode_compact_list([{"id": 1}, {"id": 2}]))
        self.assertIsNone(encode_compact_list([]))

    def test_above_gate_is_shorter_than_json(self):
        items = [{"id": i, "title": f"Task {i}", "status": "todo"} for i in range(10)]
        encoded = encode_compact_list(items)
        self.assertIsNotNone(encoded)
        self.assertLess(len(encoded), len(json.dumps(items)))

    def test_field_with_comma_quote_and_newline_round_trips_correctly(self):
        items = [
            {"id": 1, "subject": "Normal"},
            {"id": 2, "subject": 'Has, a comma and "quotes"'},
            {"id": 3, "subject": "Has\na newline"},
            {"id": 4, "subject": "Another normal one"},
            {"id": 5, "subject": "Yet another"},
        ]
        encoded = encode_compact_list(items)
        self.assertIsNotNone(encoded)
        rows = list(csv.reader(io.StringIO(encoded.split("\n", 1)[1])))
        header, data_rows = rows[0], rows[1:]
        subject_index = header.index("subject")
        recovered_subjects = [row[subject_index] for row in data_rows]
        self.assertEqual(recovered_subjects, [item["subject"] for item in items])
