from datetime import datetime, timezone
from unittest.mock import patch

from django.core.cache import cache
from django.test import SimpleTestCase, TestCase, override_settings

from core.models import Conversation, Message, ModelPreference
from memory.models import MemoryFact
from memory.services.facts import extract_facts, has_extractable_signal
from memory.services.retrieval import retrieve_relevant_memories
from memory.services.salience import calculate_salience, score_for_retrieval
from memory.services.summary import build_weekly_summary
from memory.services.supersession import find_superseded_fact
from memory.tasks import extract_and_supersede_facts


class SalienceCalculationTests(SimpleTestCase):
    def test_trivial_message_scores_low(self):
        score = calculate_salience(text="ok lol", mood="neutral", role="user")
        self.assertLess(score, 0.20)

    def test_emotional_disclosure_scores_high(self):
        score = calculate_salience(
            text=(
                "I haven't slept in two days because of work "
                "and I feel like I'm drowning"
            ),
            mood="scolding",
            role="user",
        )
        # 0.30 baseline + 0.30 (scolding) + 0.08 (1 disclosure hit: "i feel") = 0.68
        self.assertGreater(score, 0.65)

    def test_high_emotion_mood_boosts_score(self):
        base = calculate_salience(text="something happened", mood="neutral", role="user")
        boosted = calculate_salience(text="something happened", mood="flustered", role="user")
        self.assertGreater(boosted, base)

    def test_assistant_gets_no_disclosure_bonus(self):
        user_score = calculate_salience(
            text="I feel really tired today", mood="neutral", role="user"
        )
        asst_score = calculate_salience(
            text="I feel really tired today", mood="neutral", role="assistant"
        )
        self.assertGreater(user_score, asst_score)

    def test_score_clamped_to_unit_interval(self):
        for mood in ("angry_concerned", "scolding", "flustered"):
            score = calculate_salience(
                text="my mom is sick and I lost my job and I'm exhausted "
                     "and I hate everything and I can't sleep",
                mood=mood,
                role="user",
            )
            self.assertLessEqual(score, 1.0)
            self.assertGreaterEqual(score, 0.0)


class RetrievalScoringOrderTests(SimpleTestCase):
    def test_high_salience_beats_low_salience_at_same_similarity(self):
        high = score_for_retrieval(similarity=0.8, salience=0.9, age_days=1)
        low = score_for_retrieval(similarity=0.8, salience=0.2, age_days=1)
        self.assertGreater(high, low)

    def test_recent_beats_old_at_same_similarity_and_salience(self):
        recent = score_for_retrieval(similarity=0.7, salience=0.5, age_days=1)
        old = score_for_retrieval(similarity=0.7, salience=0.5, age_days=180)
        self.assertGreater(recent, old)

    def test_high_similarity_old_vs_low_similarity_new(self):
        """
        High-similarity-but-old should still be competitive against
        low-similarity-but-new when salience is equal.
        """
        strong_old = score_for_retrieval(similarity=0.95, salience=0.5, age_days=60)
        weak_new = score_for_retrieval(similarity=0.30, salience=0.5, age_days=0)
        self.assertGreater(strong_old, weak_new)


class ExtractFactsTests(TestCase):
    """TestCase (not SimpleTestCase) because extract_facts now routes
    through ModelPreference.current(), a DB-backed singleton — see
    memory/services/facts.py's module docstring for why it no longer
    hardcodes an Anthropic client (that silently disabled fact extraction
    for any non-Anthropic ModelPreference, found in review)."""

    @patch("memory.services.facts.get_provider")
    def test_valid_facts_with_invalid_type_falls_back_to_other(self, mock_get_provider):
        mock_get_provider.return_value.generate_text.return_value = (
            '{"facts": [{"text": "Works at Acme", "fact_type": "biographical"}, '
            '{"text": "Likes jazz", "fact_type": "not_a_real_type"}]}'
        )

        facts = extract_facts("I work at Acme and I love jazz")

        self.assertEqual(len(facts), 2)
        self.assertEqual(facts[0]["fact_type"], "biographical")
        self.assertEqual(facts[1]["fact_type"], "other")

    @patch("memory.services.facts.get_provider")
    def test_unparseable_json_returns_empty_list(self, mock_get_provider):
        mock_get_provider.return_value.generate_text.return_value = "not json at all"
        self.assertEqual(extract_facts("some message"), [])

    @patch("memory.services.facts.get_provider")
    def test_provider_error_returns_empty_list(self, mock_get_provider):
        from core.services.providers import ProviderError

        mock_get_provider.return_value.generate_text.side_effect = ProviderError("no key configured")
        self.assertEqual(extract_facts("some message"), [])

    @patch("memory.services.facts.get_provider")
    def test_unexpected_exception_returns_empty_list(self, mock_get_provider):
        mock_get_provider.return_value.generate_text.side_effect = RuntimeError("boom")
        self.assertEqual(extract_facts("some message"), [])

    @patch("memory.services.facts.get_provider")
    def test_uses_current_model_preference_not_a_hardcoded_provider(self, mock_get_provider):
        """Regression test: an earlier version hardcoded anthropic.Anthropic
        directly, so switching ModelPreference to another provider silently
        disabled fact extraction with no error. Confirms get_provider is
        called with whatever ModelPreference.current().provider actually is."""
        from core.models import ModelPreference

        ModelPreference.objects.update_or_create(
            pk=1, defaults={"provider": "deepseek", "model": "deepseek-chat"}
        )
        mock_get_provider.return_value.generate_text.return_value = '{"facts": []}'

        extract_facts("some message")

        mock_get_provider.assert_called_once_with("deepseek")

    @patch("memory.services.facts.get_provider")
    def test_deepseek_reasoning_model_is_redirected_to_fast_model(self, mock_get_provider):
        """Regression test: extract_facts used to call model=pref.model
        directly, so a reasoning-tier DeepSeek config could burn the whole
        300-token budget on hidden chain-of-thought before any JSON came
        out, failing silently via the except Exception above. Confirms it
        now goes through fast_model_for (see model_select.py)."""
        ModelPreference.objects.update_or_create(
            pk=1, defaults={"provider": "deepseek", "model": "deepseek-v4-flash"}
        )
        mock_get_provider.return_value.generate_text.return_value = '{"facts": []}'

        extract_facts("some message")

        called_model = mock_get_provider.return_value.generate_text.call_args.kwargs["model"]
        self.assertEqual(called_model, "deepseek-chat")


class BuildWeeklySummaryTests(TestCase):
    """Regression coverage for routing build_weekly_summary through
    get_provider(ModelPreference.current().provider) instead of a
    hardcoded Anthropic client — see memory/services/summary.py's docstring."""

    def _make_messages(self, conversation, n=4):
        for i in range(n):
            Message.objects.create(conversation=conversation, role="user", text=f"message {i}", mood="neutral")

    def test_fewer_than_four_messages_returns_none(self):
        conversation = Conversation.objects.create()
        self._make_messages(conversation, n=2)
        period_start = datetime.now(timezone.utc)
        self.assertIsNone(build_weekly_summary(period_start=period_start, period_end=period_start))

    @patch("memory.services.summary.get_provider")
    def test_uses_current_model_preference_not_a_hardcoded_provider(self, mock_get_provider):
        from datetime import timedelta

        ModelPreference.objects.update_or_create(
            pk=1, defaults={"provider": "deepseek", "model": "deepseek-chat"}
        )
        mock_get_provider.return_value.generate_text.return_value = '{"summary": "A quiet week."}'

        conversation = Conversation.objects.create()
        self._make_messages(conversation, n=4)
        period_end = datetime.now(timezone.utc)
        period_start = period_end - timedelta(days=7)

        result = build_weekly_summary(period_start=period_start, period_end=period_end)

        mock_get_provider.assert_called_once_with("deepseek")
        self.assertEqual(result["summary_text"], "A quiet week.")

    @patch("memory.services.summary.get_provider")
    def test_deepseek_reasoning_model_is_redirected_to_fast_model(self, mock_get_provider):
        """Regression test: same reasoning-tax gap as facts.py — a 400-token
        drafting budget shouldn't be spent on hidden chain-of-thought."""
        from datetime import timedelta

        ModelPreference.objects.update_or_create(
            pk=1, defaults={"provider": "deepseek", "model": "deepseek-v4-flash"}
        )
        mock_get_provider.return_value.generate_text.return_value = '{"summary": "A quiet week."}'

        conversation = Conversation.objects.create()
        self._make_messages(conversation, n=4)
        period_end = datetime.now(timezone.utc)
        period_start = period_end - timedelta(days=7)

        build_weekly_summary(period_start=period_start, period_end=period_end)

        called_model = mock_get_provider.return_value.generate_text.call_args.kwargs["model"]
        self.assertEqual(called_model, "deepseek-chat")

    @patch("memory.services.summary.get_provider")
    def test_unparseable_json_falls_back_to_raw_text(self, mock_get_provider):
        from datetime import timedelta

        mock_get_provider.return_value.generate_text.return_value = "not json at all"
        conversation = Conversation.objects.create()
        self._make_messages(conversation, n=4)
        period_end = datetime.now(timezone.utc)
        period_start = period_end - timedelta(days=7)

        result = build_weekly_summary(period_start=period_start, period_end=period_end)

        self.assertEqual(result["summary_text"], "not json at all")


class HasExtractableSignalTests(SimpleTestCase):
    def test_disclosure_marker_is_signal(self):
        self.assertTrue(has_extractable_signal("I love hiking on weekends"))

    def test_proper_noun_is_signal(self):
        self.assertTrue(has_extractable_signal("Talked to Sarah about the project"))

    def test_no_signal_returns_false(self):
        self.assertFalse(has_extractable_signal("ok cool nice"))


class FindSupersededFactTests(TestCase):
    """TestCase (not SimpleTestCase) because find_superseded_fact now
    routes through ModelPreference.current(), a DB-backed singleton."""

    def _hit(self, similarity: float, mid: str = "fact_old1"):
        return {
            "id": mid,
            "text": "Works at Acme",
            "metadata": {"kind": "fact", "status": "active", "fact_type": "biographical"},
            "similarity": similarity,
        }

    @patch("memory.services.supersession.get_provider")
    @patch("memory.services.supersession.query_memories")
    def test_below_threshold_never_calls_llm(self, mock_query, mock_get_provider):
        mock_query.return_value = [self._hit(similarity=0.1)]
        result = find_superseded_fact("Works at Globex", "biographical")
        self.assertIsNone(result)
        mock_get_provider.assert_not_called()

    @patch("memory.services.supersession.query_memories")
    def test_where_clause_is_valid_chroma_syntax(self, mock_query):
        """Regression test: a real bug shipped here where the `where` filter
        was a flat multi-key dict — Chroma requires exactly one top-level
        key (multi-condition filters must be wrapped in "$and"), so every
        real call raised ValueError, silently swallowed by the fail-open
        except clause. Mocking query_memories (as every other test in this
        class does) can't catch that class of bug since the mock never
        exercises Chroma's actual validation — so this test does, directly,
        against the real installed chromadb library."""
        from chromadb.api.types import validate_where

        mock_query.return_value = []
        find_superseded_fact("Works at Globex", "biographical")
        actual_where = mock_query.call_args.kwargs["where"]
        validate_where(actual_where)  # raises ValueError if malformed

    @patch("memory.services.supersession.query_memories")
    def test_no_hits_returns_none(self, mock_query):
        mock_query.return_value = []
        self.assertIsNone(find_superseded_fact("Works at Globex", "biographical"))

    @patch("memory.services.supersession.get_provider")
    @patch("memory.services.supersession.query_memories")
    def test_above_threshold_llm_confirms_supersession(self, mock_query, mock_get_provider):
        mock_query.return_value = [self._hit(similarity=0.9)]
        mock_get_provider.return_value.generate_text.return_value = '{"supersedes": true}'

        result = find_superseded_fact("Works at Globex", "biographical")
        self.assertIsNotNone(result)
        self.assertEqual(result["id"], "fact_old1")

    @patch("memory.services.supersession.get_provider")
    @patch("memory.services.supersession.query_memories")
    def test_deepseek_reasoning_model_is_redirected_to_fast_model(self, mock_query, mock_get_provider):
        """Regression test: this is the tightest budget in the app (50
        tokens) for a single JSON boolean — under a reasoning-tier DeepSeek
        config, hidden chain-of-thought alone could exceed it, truncating
        `raw` before json.loads ever succeeds. That failure is invisible
        (the except Exception below returns None, "assuming no
        supersession") which is exactly why this needs its own regression
        test rather than relying on the silent fallback to look correct."""
        from core.models import ModelPreference

        ModelPreference.objects.update_or_create(
            pk=1, defaults={"provider": "deepseek", "model": "deepseek-v4-flash"}
        )
        mock_query.return_value = [self._hit(similarity=0.9)]
        mock_get_provider.return_value.generate_text.return_value = '{"supersedes": true}'

        find_superseded_fact("Works at Globex", "biographical")

        called_model = mock_get_provider.return_value.generate_text.call_args.kwargs["model"]
        self.assertEqual(called_model, "deepseek-chat")

    @patch("memory.services.supersession.get_provider")
    @patch("memory.services.supersession.query_memories")
    def test_provider_error_fails_open_to_none(self, mock_query, mock_get_provider):
        from core.services.providers import ProviderError

        mock_query.return_value = [self._hit(similarity=0.9)]
        mock_get_provider.return_value.generate_text.side_effect = ProviderError("boom")
        self.assertIsNone(find_superseded_fact("Works at Globex", "biographical"))

    @patch("memory.services.supersession.get_provider")
    @patch("memory.services.supersession.query_memories")
    def test_unexpected_exception_fails_open_to_none(self, mock_query, mock_get_provider):
        mock_query.return_value = [self._hit(similarity=0.9)]
        mock_get_provider.side_effect = RuntimeError("boom")
        self.assertIsNone(find_superseded_fact("Works at Globex", "biographical"))


class RetrievalStatusFilterTests(SimpleTestCase):
    """Regression coverage for the fix that keeps retrieve_relevant_memories
    from filtering status via a Chroma `where` clause — that would exclude
    every pre-existing row (no `status` key at all), silently emptying RAG
    context. The filter must happen in Python, defaulting a missing key to
    "active"."""

    def setUp(self):
        cache.clear()

    def _hit(self, mid: str, status_meta: dict):
        meta = {
            "kind": "turn",
            "role": "user",
            "mood": "neutral",
            "salience": 0.8,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        meta.update(status_meta)
        return {"id": mid, "text": f"memory {mid}", "metadata": meta, "similarity": 0.9}

    @override_settings(MEMORY_RELEVANCE_THRESHOLD=0.0, MEMORY_RETRIEVAL_TOP_K=10)
    @patch("memory.services.retrieval.query_memories")
    def test_superseded_hit_excluded_legacy_hit_included(self, mock_query):
        mock_query.return_value = [
            self._hit("m1", {"status": "superseded"}),
            self._hit("m2", {}),  # no status key at all — every pre-existing row
        ]
        results = retrieve_relevant_memories(query_text="unique query for status filter test")
        ids = [m["id"] for m in results]
        self.assertNotIn("m1", ids)
        self.assertIn("m2", ids)


class MemoryFactModelTests(TestCase):
    def test_supersede_transition_sets_status_and_timestamp(self):
        old = MemoryFact.objects.create(
            fact_text="Works at Acme", fact_type="biographical", chroma_id="fact_old"
        )
        new = MemoryFact.objects.create(
            fact_text="Works at Globex", fact_type="biographical", chroma_id="fact_new", supersedes=old
        )
        old.status = MemoryFact.Status.SUPERSEDED
        old.superseded_at = datetime.now(timezone.utc)
        old.save()

        old.refresh_from_db()
        new.refresh_from_db()
        self.assertEqual(old.status, MemoryFact.Status.SUPERSEDED)
        self.assertIsNotNone(old.superseded_at)
        self.assertEqual(new.status, MemoryFact.Status.ACTIVE)
        self.assertEqual(new.supersedes_id, old.id)


class ExtractAndSupersedeFactsTaskTests(TestCase):
    def test_second_call_for_same_message_is_a_no_op(self):
        conversation = Conversation.objects.create()
        msg = Message.objects.create(
            conversation=conversation, role=Message.Role.USER, text="I work at Acme now"
        )
        MemoryFact.objects.create(
            fact_text="Works at Acme", fact_type="biographical", chroma_id="fact_x", source_message=msg
        )

        with patch("memory.tasks.extract_facts") as mock_extract:
            extract_and_supersede_facts(msg.id)

        mock_extract.assert_not_called()
        self.assertEqual(MemoryFact.objects.filter(source_message=msg).count(), 1)

    def test_assistant_message_is_skipped(self):
        conversation = Conversation.objects.create()
        msg = Message.objects.create(
            conversation=conversation,
            role=Message.Role.ASSISTANT,
            text="Nice, Acme is a great company!",
            mood="playful",
        )

        with patch("memory.tasks.extract_facts") as mock_extract:
            extract_and_supersede_facts(msg.id)

        mock_extract.assert_not_called()
        self.assertEqual(MemoryFact.objects.filter(source_message=msg).count(), 0)
