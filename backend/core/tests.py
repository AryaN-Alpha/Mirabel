import csv
import io
import json
from datetime import datetime, timedelta, timezone as dt_timezone
from unittest.mock import patch

from django.core.cache import cache
from django.test import TestCase
from django.utils import timezone as dj_timezone

from core.models import BudgetSettings, LLMCallLog, OptimizationEvent, PricingConfig
from core.services import analytics
from core.services.period import InvalidPeriod, iter_buckets, resolve_period
from core.services.pricing import compute_cost, uncached_input_tokens
from core.services.providers.anthropic_provider import _cacheable_system, _with_cache_breakpoint
from core.services.providers.deepseek_provider import _build_messages as _deepseek_build_messages
from core.services.providers.gemini_provider import _to_contents as _gemini_to_contents
from core.services.providers.openai_provider import _with_system_suffix as _openai_with_system_suffix
from core.services.telemetry import log_llm_call, log_optimization_event
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


# ---------------------------------------------------------------------------
# Stats dashboard (Pass 4): period resolution, telemetry persistence, cost
# accounting, and the analytics aggregation layer.
# ---------------------------------------------------------------------------


def _make_call(created_at: datetime, **kwargs) -> LLMCallLog:
    """LLMCallLog.created_at is auto_now_add, so it ignores any value passed
    to .create() — this helper creates the row then back-dates it with a
    direct .update(), the standard Django pattern for testing auto_now_add
    fields against specific timestamps."""
    defaults = {"provider": "anthropic", "model": "claude-sonnet-5", "call_site": "chat.rest"}
    defaults.update(kwargs)
    obj = LLMCallLog.objects.create(**defaults)
    LLMCallLog.objects.filter(pk=obj.pk).update(created_at=created_at)
    obj.refresh_from_db()
    return obj


class PeriodResolutionTests(TestCase):
    def test_today_is_midnight_to_midnight_utc_hourly(self):
        result = resolve_period("today")
        self.assertEqual(result["granularity"], "hour")
        self.assertEqual(result["start"].time().hour, 0)
        self.assertEqual((result["end"] - result["start"]), timedelta(days=1))

    def test_yesterday_precedes_today_by_one_day(self):
        today = resolve_period("today")
        yesterday = resolve_period("yesterday")
        self.assertEqual(yesterday["end"], today["start"])
        self.assertEqual(yesterday["end"] - yesterday["start"], timedelta(days=1))

    def test_last_7_days_spans_exactly_seven_days_inclusive_of_today(self):
        result = resolve_period("last_7_days")
        self.assertEqual((result["end"] - result["start"]).days, 7)
        self.assertEqual(result["granularity"], "day")

    def test_this_year_uses_monthly_granularity(self):
        result = resolve_period("this_year")
        self.assertEqual(result["granularity"], "month")
        self.assertEqual(result["start"].month, 1)
        self.assertEqual(result["start"].day, 1)

    def test_prev_period_is_immediately_preceding_and_equal_length(self):
        result = resolve_period("last_30_days")
        span = result["end"] - result["start"]
        self.assertEqual(result["prev_end"], result["start"])
        self.assertEqual(result["prev_start"], result["start"] - span)

    def test_custom_range_is_inclusive_of_both_endpoints(self):
        result = resolve_period("custom", "2026-01-01", "2026-01-03")
        self.assertEqual(result["start"], datetime(2026, 1, 1, tzinfo=dt_timezone.utc))
        self.assertEqual(result["end"], datetime(2026, 1, 4, tzinfo=dt_timezone.utc))

    def test_custom_missing_dates_raises(self):
        with self.assertRaises(InvalidPeriod):
            resolve_period("custom", None, None)

    def test_custom_end_before_start_raises(self):
        with self.assertRaises(InvalidPeriod):
            resolve_period("custom", "2026-02-01", "2026-01-01")

    def test_unknown_period_raises(self):
        with self.assertRaises(InvalidPeriod):
            resolve_period("last_fortnight")

    def test_custom_range_starting_on_day_31_does_not_crash_month_bucketing(self):
        # Regression: iter_buckets/_add_months stepping from Jan 31 into
        # February used to raise ValueError (day 31 doesn't exist in Feb) —
        # only reachable via a `custom` range (day=1 is guaranteed for every
        # other period), so this must resolve AND bucket without crashing.
        result = resolve_period("custom", "2026-01-31", "2026-06-30")
        self.assertEqual(result["granularity"], "month")
        buckets = list(iter_buckets(result["start"], result["end"], "month"))
        self.assertGreaterEqual(len(buckets), 5)
        # Clamped, not skipped: still lands in February, on its last day.
        self.assertEqual(buckets[1][0].month, 2)
        self.assertEqual(buckets[1][0].day, 28)


class TelemetryDBWriteTests(TestCase):
    def test_log_llm_call_persists_a_row(self):
        log_llm_call(
            provider="anthropic", model="claude-sonnet-5", call_site="chat.rest",
            input_tokens=100, output_tokens=50, latency_ms=250.0,
            cache_read_tokens=10, cache_write_tokens=5,
        )
        row = LLMCallLog.objects.get()
        self.assertEqual(row.provider, "anthropic")
        self.assertEqual(row.input_tokens, 100)
        self.assertEqual(row.output_tokens, 50)
        self.assertFalse(row.error)
        self.assertFalse(row.estimated)

    def test_log_llm_call_error_flag_persists(self):
        log_llm_call(provider="openai", model="gpt-5.6-terra", call_site="chat.rest", error=True)
        row = LLMCallLog.objects.get()
        self.assertTrue(row.error)
        self.assertIsNone(row.input_tokens)

    def test_log_llm_call_db_failure_never_raises(self):
        with patch("core.models.LLMCallLog.objects.create", side_effect=Exception("db down")):
            log_llm_call(provider="anthropic", model="claude-sonnet-5", call_site="chat.rest")  # must not raise
        self.assertEqual(LLMCallLog.objects.count(), 0)

    def test_log_optimization_event_persists(self):
        log_optimization_event(category="memory_gate", outcome="skipped")
        row = OptimizationEvent.objects.get()
        self.assertEqual(row.category, "memory_gate")
        self.assertEqual(row.outcome, "skipped")

    def test_log_optimization_event_db_failure_never_raises(self):
        with patch("core.models.OptimizationEvent.objects.create", side_effect=Exception("db down")):
            log_optimization_event(category="dedup", outcome="duplicate")  # must not raise
        self.assertEqual(OptimizationEvent.objects.count(), 0)


class PricingCostTests(TestCase):
    def test_no_pricing_row_returns_none(self):
        cost = compute_cost(
            provider="anthropic", model="claude-opus-5",
            input_tokens=1000, output_tokens=500, cache_read_tokens=None, cache_write_tokens=None,
        )
        self.assertIsNone(cost)

    def test_anthropic_cache_tokens_are_additive_not_double_counted(self):
        # Anthropic's cache_read/cache_creation are ADDITIONAL to input_tokens
        # (see anthropic_provider.py) — input_tokens should be billed in full
        # at the input rate, with cache tokens billed separately.
        PricingConfig.objects.create(
            provider="anthropic", model="claude-sonnet-5",
            input_price_per_1m=3.0, output_price_per_1m=15.0,
            cache_read_price_per_1m=0.3, cache_write_price_per_1m=3.75,
        )
        cost = compute_cost(
            provider="anthropic", model="claude-sonnet-5",
            input_tokens=1_000_000, output_tokens=0, cache_read_tokens=1_000_000, cache_write_tokens=0,
        )
        self.assertAlmostEqual(cost["input"], 3.0)
        self.assertAlmostEqual(cost["cache_read"], 0.3)
        self.assertAlmostEqual(cost["total"], 3.3)

    def test_openai_cache_tokens_are_a_subset_and_not_double_billed(self):
        # OpenAI/Gemini/DeepSeek report cache-read tokens as a SUBSET of
        # input_tokens (see openai_provider.py) — billing input_tokens in
        # full AND cache_read_tokens again would double-count the cached
        # portion. This is the regression the Stats spec explicitly warns
        # against ("do not double-count cached tokens").
        PricingConfig.objects.create(
            provider="openai", model="gpt-5.6-terra",
            input_price_per_1m=2.0, output_price_per_1m=8.0, cache_read_price_per_1m=0.5,
        )
        cost = compute_cost(
            provider="openai", model="gpt-5.6-terra",
            input_tokens=1_000_000, output_tokens=0, cache_read_tokens=400_000, cache_write_tokens=None,
        )
        # 600k uncached at $2/1M + 400k cached at $0.5/1M
        self.assertAlmostEqual(cost["input"], 1.2)
        self.assertAlmostEqual(cost["cache_read"], 0.2)
        self.assertAlmostEqual(cost["total"], 1.4)

    def test_missing_price_field_treated_as_zero_not_free_total(self):
        PricingConfig.objects.create(provider="deepseek", model="deepseek-v4-flash", input_price_per_1m=1.0)
        cost = compute_cost(
            provider="deepseek", model="deepseek-v4-flash",
            input_tokens=1_000_000, output_tokens=1_000_000, cache_read_tokens=None, cache_write_tokens=None,
        )
        self.assertAlmostEqual(cost["input"], 1.0)
        self.assertEqual(cost["output"], 0.0)  # no output price configured — 0, not fabricated

    def test_uncached_input_tokens_anthropic_vs_openai(self):
        self.assertEqual(
            uncached_input_tokens(provider="anthropic", input_tokens=1000, cache_read_tokens=400), 1000
        )
        self.assertEqual(
            uncached_input_tokens(provider="openai", input_tokens=1000, cache_read_tokens=400), 600
        )


class AnalyticsOverviewTests(TestCase):
    def setUp(self):
        # get_overview/get_timeseries are short-TTL cached (see
        # core/services/analytics.py) via Django's cache framework, which
        # (unlike the DB) is NOT reset by TestCase's transaction rollback —
        # same precedent as memory/tests.py and cv/tests.py's cache.clear().
        cache.clear()
        self.now = dj_timezone.now().astimezone(dt_timezone.utc)
        self.filters = resolve_period("today")
        self.filters.update(provider=None, model=None, call_site=None, estimated=None)

    def test_empty_telemetry_returns_zeros_not_errors(self):
        result = analytics.get_overview(self.filters)
        self.assertEqual(result["tokens"]["total_tokens"], 0)
        self.assertEqual(result["calls"]["total"], 0)
        self.assertIsNone(result["averages"]["tokens_per_request"])
        self.assertFalse(result["cost"]["available"])

    def test_token_and_call_aggregation(self):
        mid_today = self.filters["start"] + timedelta(hours=2)
        _make_call(mid_today, input_tokens=100, output_tokens=50)
        _make_call(mid_today, input_tokens=200, output_tokens=100)
        result = analytics.get_overview(self.filters)
        self.assertEqual(result["tokens"]["input_tokens"], 300)
        self.assertEqual(result["tokens"]["output_tokens"], 150)
        self.assertEqual(result["tokens"]["total_tokens"], 450)
        self.assertEqual(result["calls"]["total"], 2)
        self.assertEqual(result["averages"]["tokens_per_request"], 225)

    def test_error_calls_excluded_from_averages_but_counted_in_calls(self):
        mid_today = self.filters["start"] + timedelta(hours=2)
        _make_call(mid_today, input_tokens=100, output_tokens=50)
        _make_call(mid_today, error=True, input_tokens=None, output_tokens=None)
        result = analytics.get_overview(self.filters)
        self.assertEqual(result["calls"]["total"], 2)
        self.assertEqual(result["calls"]["successful"], 1)
        self.assertEqual(result["calls"]["errors"], 1)
        self.assertEqual(result["averages"]["tokens_per_request"], 150)  # 150 total / 1 successful

    def test_estimated_share_computed_correctly(self):
        mid_today = self.filters["start"] + timedelta(hours=2)
        _make_call(mid_today, input_tokens=100, output_tokens=0, estimated=False)
        _make_call(mid_today, input_tokens=100, output_tokens=0, estimated=True, call_site="voice.turn")
        result = analytics.get_overview(self.filters)
        self.assertEqual(result["tokens"]["estimated_total"], 100)
        self.assertAlmostEqual(result["tokens"]["estimated_share"], 0.5)

    def test_rows_outside_the_period_are_excluded(self):
        outside = self.filters["start"] - timedelta(days=5)
        _make_call(outside, input_tokens=999, output_tokens=999)
        result = analytics.get_overview(self.filters)
        self.assertEqual(result["tokens"]["total_tokens"], 0)

    def test_prompt_efficiency_percentiles_and_largest(self):
        mid_today = self.filters["start"] + timedelta(hours=2)
        for tokens in (100, 200, 300, 400, 1000):
            _make_call(mid_today, input_tokens=tokens, output_tokens=tokens // 2)
        result = analytics.get_overview(self.filters)
        eff = result["prompt_efficiency"]
        self.assertEqual(eff["largest_prompt_tokens"], 1000)
        self.assertEqual(eff["largest_response_tokens"], 500)
        self.assertIsNotNone(eff["p95_input_tokens"])
        self.assertAlmostEqual(eff["avg_input_tokens"], 2000 / 5)

    def test_cost_available_only_when_pricing_configured(self):
        PricingConfig.objects.create(provider="anthropic", model="claude-sonnet-5", input_price_per_1m=3.0, output_price_per_1m=15.0)
        mid_today = self.filters["start"] + timedelta(hours=2)
        _make_call(mid_today, provider="anthropic", model="claude-sonnet-5", input_tokens=1_000_000, output_tokens=0)
        _make_call(mid_today, provider="openai", model="gpt-5.6-terra", input_tokens=1_000_000, output_tokens=0)
        result = analytics.get_overview(self.filters)
        self.assertTrue(result["cost"]["available"])
        self.assertEqual(result["cost"]["priced_calls"], 1)
        self.assertEqual(result["cost"]["unpriced_calls"], 1)
        self.assertAlmostEqual(result["cost"]["total"], 3.0)


class AnalyticsFilterTests(TestCase):
    def setUp(self):
        cache.clear()
        self.filters = resolve_period("today")
        self.filters.update(provider=None, model=None, call_site=None, estimated=None)
        mid_today = self.filters["start"] + timedelta(hours=1)
        _make_call(mid_today, provider="anthropic", model="claude-sonnet-5", call_site="chat.rest", input_tokens=10, output_tokens=5)
        _make_call(mid_today, provider="openai", model="gpt-5.6-terra", call_site="agent.run", input_tokens=20, output_tokens=10)
        _make_call(mid_today, provider="anthropic", model="claude-opus-5", call_site="cv.tailor", input_tokens=30, output_tokens=15)

    def test_provider_filter(self):
        self.filters["provider"] = "anthropic"
        result = analytics.get_overview(self.filters)
        self.assertEqual(result["calls"]["total"], 2)

    def test_model_filter(self):
        self.filters["model"] = "claude-opus-5"
        result = analytics.get_overview(self.filters)
        self.assertEqual(result["calls"]["total"], 1)

    def test_call_site_filter(self):
        self.filters["call_site"] = "agent.run"
        result = analytics.get_overview(self.filters)
        self.assertEqual(result["calls"]["total"], 1)
        self.assertEqual(result["tokens"]["input_tokens"], 20)

    def test_get_providers_groups_correctly(self):
        rows = {r["provider"]: r for r in analytics.get_providers(self.filters)}
        self.assertEqual(rows["anthropic"]["calls"], 2)
        self.assertEqual(rows["anthropic"]["total_tokens"], 60)
        self.assertEqual(rows["openai"]["calls"], 1)

    def test_get_call_sites_groups_correctly(self):
        rows = {r["call_site"]: r for r in analytics.get_call_sites(self.filters)}
        self.assertEqual(set(rows.keys()), {"chat.rest", "agent.run", "cv.tailor"})


class AnalyticsCacheAnalyticsTests(TestCase):
    def setUp(self):
        cache.clear()
        self.filters = resolve_period("today")
        self.filters.update(provider=None, model=None, call_site=None, estimated=None)

    def test_no_cache_activity_reports_zero_not_fabricated_hit(self):
        mid_today = self.filters["start"] + timedelta(hours=1)
        _make_call(mid_today, provider="anthropic", model="claude-sonnet-5", input_tokens=100, output_tokens=10)
        result = analytics.get_cache_analytics(self.filters)
        self.assertEqual(result["cache_read_tokens"], 0)
        self.assertEqual(result["estimated_tokens_avoided"], 0)

    def test_cache_hit_rate_uses_provider_specific_accounting(self):
        mid_today = self.filters["start"] + timedelta(hours=1)
        _make_call(mid_today, provider="openai", model="gpt-5.6-terra", input_tokens=1000, cache_read_tokens=400, output_tokens=0)
        result = analytics.get_cache_analytics(self.filters)
        self.assertEqual(result["cache_read_tokens"], 400)
        self.assertEqual(result["uncached_input_tokens"], 600)
        self.assertAlmostEqual(result["cache_hit_rate"], 0.4)

    def test_provider_capability_reflects_actual_implementation(self):
        result = analytics.get_cache_analytics(self.filters)
        capability = {row["provider"]: row["prompt_caching"] for row in result["provider_capability"]}
        self.assertEqual(capability["anthropic"], "enabled")
        self.assertEqual(capability["opencode"], "unavailable")


class AnalyticsOptimizationTests(TestCase):
    def setUp(self):
        cache.clear()
        self.filters = resolve_period("today")
        self.filters.update(provider=None, model=None, call_site=None, estimated=None)

    def test_empty_events_return_none_rates_not_errors(self):
        result = analytics.get_optimization_analytics(self.filters)
        self.assertIsNone(result["memory"]["gate_skip_rate"])
        self.assertIsNone(result["dedup"]["duplicate_prevention_rate"])

    def test_memory_gate_skip_rate(self):
        log_optimization_event(category="memory_gate", outcome="skipped")
        log_optimization_event(category="memory_gate", outcome="skipped")
        log_optimization_event(category="memory_gate", outcome="retrieved")
        result = analytics.get_optimization_analytics(self.filters)
        self.assertEqual(result["memory"]["gate_evaluations"], 3)
        self.assertAlmostEqual(result["memory"]["gate_skip_rate"], 2 / 3)

    def test_dedup_prevention_rate(self):
        log_optimization_event(category="dedup", outcome="stored")
        log_optimization_event(category="dedup", outcome="duplicate")
        log_optimization_event(category="dedup", outcome="duplicate")
        log_optimization_event(category="dedup", outcome="duplicate")
        result = analytics.get_optimization_analytics(self.filters)
        self.assertAlmostEqual(result["dedup"]["duplicate_prevention_rate"], 0.75)

    def test_tool_routing_reduction_is_labeled_estimate_and_computed(self):
        log_optimization_event(category="tool_routing", outcome="routed", count=8, extra=36)
        log_optimization_event(category="tool_routing", outcome="routed", count=12, extra=36)
        result = analytics.get_optimization_analytics(self.filters)
        # avg routed = 10, avg full = 36 -> reduction ~72.2%
        self.assertAlmostEqual(result["tool_routing"]["estimated_context_reduction_pct"], 1 - 10 / 36)

    def test_agent_trim_step_counts(self):
        log_optimization_event(category="agent_trim", outcome="not_trimmed", count=5, extra=5)
        log_optimization_event(category="agent_trim", outcome="trimmed", count=40, extra=20)
        result = analytics.get_optimization_analytics(self.filters)
        self.assertEqual(result["agent_trim"]["llm_steps_observed"], 2)
        self.assertEqual(result["agent_trim"]["llm_steps_trimmed"], 1)


class AnalyticsBudgetTests(TestCase):
    def test_no_budget_configured_returns_none_not_zero(self):
        result = analytics.get_budget()
        self.assertIsNone(result["monthly_budget_usd"])
        self.assertIsNone(result["used_pct"])
        self.assertEqual(result["spend_kind"], "application_estimated")

    def test_spend_computed_from_priced_calls_this_month(self):
        PricingConfig.objects.create(provider="anthropic", model="claude-sonnet-5", input_price_per_1m=10.0, output_price_per_1m=30.0)
        now = dj_timezone.now().astimezone(dt_timezone.utc)
        _make_call(now, provider="anthropic", model="claude-sonnet-5", input_tokens=1_000_000, output_tokens=0)
        BudgetSettings.objects.create(pk=1, monthly_budget_usd=100.0)
        result = analytics.get_budget()
        self.assertAlmostEqual(result["current_spend_usd"], 10.0)
        self.assertAlmostEqual(result["remaining_usd"], 90.0)
        self.assertAlmostEqual(result["used_pct"], 0.10)

    def test_threshold_fires_once_per_period(self):
        PricingConfig.objects.create(provider="anthropic", model="claude-sonnet-5", input_price_per_1m=100.0)
        now = dj_timezone.now().astimezone(dt_timezone.utc)
        _make_call(now, provider="anthropic", model="claude-sonnet-5", input_tokens=1_000_000, output_tokens=0)
        BudgetSettings.objects.create(pk=1, monthly_budget_usd=100.0, alert_thresholds="50,75,90,100")
        first = analytics.get_budget()
        self.assertIn(50, first["thresholds_crossed"])
        second = analytics.get_budget()
        self.assertEqual(second["thresholds_crossed"], first["thresholds_crossed"])

    def test_zero_budget_is_not_collapsed_into_no_budget(self):
        # A monthly_budget_usd of exactly 0 is a legitimate "alert on any
        # spend" setting — `_rate`'s falsy-denominator guard used to
        # silently treat 0 the same as an unconfigured (None) budget.
        BudgetSettings.objects.create(pk=1, monthly_budget_usd=0.0)
        result = analytics.get_budget()
        self.assertEqual(result["monthly_budget_usd"], 0.0)
        self.assertEqual(result["used_pct"], 0.0)  # no spend yet against the $0 budget

    def test_zero_budget_with_spend_reads_as_fully_over(self):
        PricingConfig.objects.create(provider="anthropic", model="claude-sonnet-5", input_price_per_1m=10.0)
        now = dj_timezone.now().astimezone(dt_timezone.utc)
        _make_call(now, provider="anthropic", model="claude-sonnet-5", input_tokens=1_000_000, output_tokens=0)
        BudgetSettings.objects.create(pk=1, monthly_budget_usd=0.0, alert_thresholds="50")
        result = analytics.get_budget()
        self.assertEqual(result["used_pct"], 1.0)
        self.assertIn(50, result["thresholds_crossed"])


class AnalyticsPerformanceTests(TestCase):
    def setUp(self):
        cache.clear()

    def test_requests_per_minute_uses_elapsed_time_not_the_full_nominal_period(self):
        # "today"'s filter end is midnight tomorrow (a future instant), not
        # now — dividing by the full nominal span used to understate the
        # actual current pace for any same-day filter. Compare against the
        # correct (elapsed-time) and the old-buggy (full 1440-minute day)
        # calculations directly rather than a fixed threshold, since the
        # correct value depends on what time of day this test happens to
        # run (a hardcoded magic number was flaky for exactly that reason).
        filters = resolve_period("today")
        filters.update(provider=None, model=None, call_site=None, estimated=None)
        now = dj_timezone.now().astimezone(dt_timezone.utc)
        for _ in range(10):
            _make_call(now, input_tokens=10, output_tokens=5)
        result = analytics.get_performance(filters)

        elapsed_minutes = max((now - filters["start"]).total_seconds() / 60, 1)
        expected_rate = 10 / elapsed_minutes
        naive_full_day_rate = 10 / 1440

        self.assertAlmostEqual(result["requests_per_minute"], expected_rate, delta=0.05)
        self.assertGreater(result["requests_per_minute"], naive_full_day_rate)

    def test_empty_performance_returns_none_not_error(self):
        filters = resolve_period("today")
        filters.update(provider=None, model=None, call_site=None, estimated=None)
        result = analytics.get_performance(filters)
        self.assertIsNone(result["avg_latency_ms"])
        self.assertIsNone(result["slowest_request"])
        self.assertEqual(result["requests_per_minute"], 0)


class TopUsageTests(TestCase):
    def setUp(self):
        cache.clear()

    def test_empty_returns_empty_list(self):
        filters = resolve_period("today")
        filters.update(provider=None, model=None, call_site=None, estimated=None)
        result = analytics.get_top_usage(filters, "cost", limit=10, offset=0)
        self.assertEqual(result["results"], [])
        self.assertEqual(result["count"], 0)

    def test_never_exposes_prompt_content(self):
        filters = resolve_period("today")
        filters.update(provider=None, model=None, call_site=None, estimated=None)
        _make_call(filters["start"] + timedelta(hours=1), input_tokens=50, output_tokens=20)
        result = analytics.get_top_usage(filters, "input_tokens", limit=10, offset=0)
        self.assertEqual(len(result["results"]), 1)
        self.assertNotIn("prompt", result["results"][0])
        self.assertNotIn("text", result["results"][0])
        self.assertNotIn("content", result["results"][0])


class StatsApiTests(TestCase):
    def setUp(self):
        cache.clear()

    def test_overview_endpoint_ok(self):
        response = self.client.get("/api/stats/overview/", {"period": "last_7_days"})
        self.assertEqual(response.status_code, 200)
        self.assertIn("tokens", response.json())

    def test_invalid_period_returns_400(self):
        response = self.client.get("/api/stats/overview/", {"period": "bogus"})
        self.assertEqual(response.status_code, 400)

    def test_custom_period_without_dates_returns_400(self):
        response = self.client.get("/api/stats/overview/", {"period": "custom"})
        self.assertEqual(response.status_code, 400)

    def test_meta_endpoint_lists_providers(self):
        response = self.client.get("/api/stats/meta/")
        self.assertEqual(response.status_code, 200)
        self.assertIn("anthropic", response.json()["providers"])

    def test_top_usage_rejects_unknown_kind(self):
        response = self.client.get("/api/stats/top-usage/", {"kind": "bogus"})
        self.assertEqual(response.status_code, 400)

    def test_budget_put_updates_settings(self):
        response = self.client.put(
            "/api/stats/budget/", {"monthly_budget_usd": 250}, content_type="application/json"
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(BudgetSettings.current().monthly_budget_usd, 250.0)

    def test_budget_put_accepts_zero(self):
        response = self.client.put(
            "/api/stats/budget/", {"monthly_budget_usd": 0}, content_type="application/json"
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(BudgetSettings.current().monthly_budget_usd, 0.0)

    def test_budget_put_rejects_string_thresholds(self):
        # A bare string is iterable character-by-character in Python —
        # {int(t) for t in "50"} silently succeeds as {5, 0} instead of
        # raising, unless explicitly rejected before the int() comprehension.
        response = self.client.put(
            "/api/stats/budget/", {"alert_thresholds": "50"}, content_type="application/json"
        )
        self.assertEqual(response.status_code, 400)
        self.assertNotEqual(BudgetSettings.current().thresholds(), [5, 0])

    def test_budget_put_accepts_threshold_list(self):
        response = self.client.put(
            "/api/stats/budget/", {"alert_thresholds": [60, 90]}, content_type="application/json"
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(BudgetSettings.current().thresholds(), [60, 90])

    def test_export_csv_returns_csv_content_type(self):
        response = self.client.get("/api/stats/export/", {"section": "providers"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "text/csv")

    def test_stats_endpoints_are_exempt_from_the_global_anon_throttle(self):
        # settings.REST_FRAMEWORK's AnonRateThrottle (30/min) exists to guard
        # LLM cost (CLAUDE.md) and applies to every DRF view by default. A
        # single Stats dashboard load fires ~10 parallel requests — well
        # past 30/min across a couple of page loads — so every Stats view
        # opts out via @throttle_classes([]) (see views_stats.py). This
        # fires past the default limit to prove the exemption actually
        # takes effect, not just that the decorator is present — an earlier
        # version of this fix had the decorator order backwards (throttle_
        # classes must be applied before api_view wraps the function, since
        # api_view reads func.throttle_classes while building its
        # WrappedAPIView) and silently did nothing.
        for _ in range(35):
            response = self.client.get("/api/stats/overview/", {"period": "today"})
            self.assertEqual(response.status_code, 200)

    def test_other_endpoints_still_throttle(self):
        # Negative control for the test above — confirms AnonRateThrottle is
        # actually active in this test environment (so the Stats test isn't
        # trivially passing because throttling is globally disabled some
        # other way). Uses /api/settings/model/ rather than /api/chat/: same
        # global throttle, but no Celery .delay() calls to a possibly-absent
        # broker or provider I/O, so this stays fast and isolated instead of
        # hammering the full chat pipeline 35 times.
        statuses = [self.client.get("/api/settings/model/").status_code for _ in range(35)]
        self.assertIn(429, statuses)
