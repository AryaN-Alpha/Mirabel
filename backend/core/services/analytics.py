"""Server-side aggregation for the Stats dashboard.

Every function here takes the `filters` dict produced by
core/views_stats.py (see that module for the exact query-param contract)
and returns plain dicts/lists ready to serialize — no raw LLMCallLog rows
ever reach the frontend, and no aggregation happens client-side (CLAUDE.md
Stats spec: "avoid client-side processing of huge datasets").

Aggregation strategy: each function issues ONE query against LLMCallLog
(via `.values(...)`, never fetching model instances it doesn't need) and
does grouping/cost math in Python. For this app's scale (single user, no
auth — see CLAUDE.md's "Known gaps") a filtered range tops out at a few
thousand rows even over a year, so a single indexed query plus an in-memory
pass is simpler and just as fast as pushing the provider-dependent cost
branching (see core/services/pricing.py) into SQL, and avoids N+1 entirely.
Cost is computed per-row because it depends on (provider, model) pricing
AND on a per-provider cache-accounting rule that isn't expressible as a
plain SUM (see pricing.py's module docstring).
"""

from __future__ import annotations

import calendar
from collections import defaultdict
from datetime import timedelta, timezone as dt_timezone

from django.core.cache import cache
from django.db.models import Avg, Count, Sum
from django.utils import timezone as dj_timezone

from core.models import BudgetSettings, LLMCallLog, OptimizationEvent
from core.services.period import bucket_index, iter_buckets
from core.services.pricing import compute_cost, get_pricing_map, uncached_input_tokens
from core.services.providers import AVAILABLE_MODELS

_CACHE_TTL_SECONDS = 30

# Reflects the actual implementation state of core/services/providers/*_provider.py
# (see CLAUDE.md's Pass 4 notes) — never inferred from a generic "has a cache
# field" check, per the Stats spec's explicit instruction not to imply
# capability a provider doesn't really have.
_CACHE_CAPABLE = {"anthropic": True, "openai": True, "gemini": True, "deepseek": True, "opencode": False}


def _rate(numerator: int | float | None, denominator: int | float | None) -> float | None:
    if not denominator:
        return None
    return numerator / denominator


def _queryset(filters: dict, *, use_prev: bool = False):
    start, end = (filters["prev_start"], filters["prev_end"]) if use_prev else (filters["start"], filters["end"])
    qs = LLMCallLog.objects.filter(created_at__gte=start, created_at__lt=end)
    if filters.get("provider"):
        qs = qs.filter(provider=filters["provider"])
    if filters.get("model"):
        qs = qs.filter(model=filters["model"])
    if filters.get("call_site"):
        qs = qs.filter(call_site=filters["call_site"])
    if filters.get("estimated") is not None:
        qs = qs.filter(estimated=filters["estimated"])
    return qs


_ROW_FIELDS = (
    "created_at", "provider", "model", "call_site",
    "input_tokens", "output_tokens", "cache_read_tokens", "cache_write_tokens",
    "latency_ms", "estimated", "error",
)


def _cost_for_row(row: dict, pricing_map) -> dict | None:
    return compute_cost(
        provider=row["provider"],
        model=row["model"],
        input_tokens=row["input_tokens"],
        output_tokens=row["output_tokens"],
        cache_read_tokens=row["cache_read_tokens"],
        cache_write_tokens=row["cache_write_tokens"],
        pricing_map=pricing_map,
    )


def _sum_tokens(rows: list[dict]) -> dict:
    input_tokens = sum(r["input_tokens"] or 0 for r in rows)
    output_tokens = sum(r["output_tokens"] or 0 for r in rows)
    return {"input_tokens": input_tokens, "output_tokens": output_tokens, "total_tokens": input_tokens + output_tokens}


def _cache_key(prefix: str, filters: dict, extra: str = "") -> str:
    return (
        f"stats:{prefix}:{filters['start'].isoformat()}:{filters['end'].isoformat()}:"
        f"{filters.get('provider')}:{filters.get('model')}:{filters.get('call_site')}:{filters.get('estimated')}:{extra}"
    )


def _cached(prefix: str, filters: dict, compute, *, extra: str = ""):
    """Every list/dict-returning analytics function is fetched in parallel
    on each dashboard load/filter change/refresh — originally only
    get_overview/get_timeseries were cached and every other endpoint (8 of
    10) re-scanned + re-aggregated on every request. Applied uniformly here
    instead of duplicating the get/set boilerplate in each function."""
    key = _cache_key(prefix, filters, extra)
    cached = cache.get(key)
    if cached is not None:
        return cached
    result = compute()
    cache.set(key, result, _CACHE_TTL_SECONDS)
    return result


def get_meta() -> dict:
    """Filter-dropdown options — dynamically derived from the provider
    registry PLUS whatever's actually in telemetry, so a call site or model
    that only ever appears in real traffic (e.g. the agent's provider/model
    combo) still shows up (Stats spec: "Only display call-site categories
    that actually exist in telemetry"). Not date-filtered (dropdown options
    are independent of the selected range), so cached under a fixed key."""
    cached = cache.get("stats:meta")
    if cached is not None:
        return cached

    db_providers = list(LLMCallLog.objects.values_list("provider", flat=True).distinct())
    db_model_rows = list(LLMCallLog.objects.values("provider", "model").distinct())
    call_sites = sorted(v for v in LLMCallLog.objects.values_list("call_site", flat=True).distinct() if v)

    providers = sorted(set(AVAILABLE_MODELS.keys()) | set(db_providers))
    models_by_provider: dict[str, list[str]] = {}
    for provider in providers:
        configured = {m["id"] for m in AVAILABLE_MODELS.get(provider, [])}
        seen = {row["model"] for row in db_model_rows if row["provider"] == provider}
        models_by_provider[provider] = sorted(configured | seen)

    result = {"providers": providers, "models_by_provider": models_by_provider, "call_sites": call_sites}
    cache.set("stats:meta", result, _CACHE_TTL_SECONDS)
    return result


def get_overview(filters: dict) -> dict:
    cache_key = _cache_key("overview", filters)
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    pricing_map = get_pricing_map()
    rows = list(_queryset(filters).values(*_ROW_FIELDS))
    prev_rows = list(_queryset(filters, use_prev=True).values(*_ROW_FIELDS))

    tokens = _sum_tokens(rows)
    prev_tokens = _sum_tokens(prev_rows)
    calls_total = len(rows)
    errors = sum(1 for r in rows if r["error"])
    successful = calls_total - errors
    estimated_tokens = _sum_tokens([r for r in rows if r["estimated"]])["total_tokens"]

    priced_calls = 0
    unpriced_calls = 0
    cost_totals = {"input": 0.0, "output": 0.0, "cache_read": 0.0, "cache_write": 0.0, "total": 0.0}
    for r in rows:
        cost = _cost_for_row(r, pricing_map)
        if cost is None:
            unpriced_calls += 1
            continue
        priced_calls += 1
        for k in cost_totals:
            cost_totals[k] += cost[k]

    prev_cost_total = 0.0
    for r in prev_rows:
        cost = _cost_for_row(r, pricing_map)
        if cost is not None:
            prev_cost_total += cost["total"]

    def pct_delta(current, previous):
        if not previous:
            return None
        return (current - previous) / previous

    def percentile(values: list[int], p: float) -> int | None:
        if not values:
            return None
        vals = sorted(values)
        idx = max(0, min(len(vals) - 1, int(round(p * (len(vals) - 1)))))
        return vals[idx]

    input_values = [r["input_tokens"] for r in rows if r["input_tokens"] is not None]
    output_values = [r["output_tokens"] for r in rows if r["output_tokens"] is not None]

    result = {
        "period": {
            "start": filters["start"].isoformat(),
            "end": filters["end"].isoformat(),
            "granularity": filters["granularity"],
        },
        "tokens": {
            **tokens,
            "estimated_total": estimated_tokens,
            "estimated_share": _rate(estimated_tokens, tokens["total_tokens"]),
        },
        "calls": {
            "total": calls_total,
            "successful": successful,
            "errors": errors,
            "error_rate": _rate(errors, calls_total),
        },
        "averages": {
            "tokens_per_request": _rate(tokens["total_tokens"], successful),
            "input_tokens_per_request": _rate(tokens["input_tokens"], successful),
            "output_tokens_per_request": _rate(tokens["output_tokens"], successful),
        },
        "comparison": {
            "total_tokens_prev": prev_tokens["total_tokens"],
            "total_tokens_delta_pct": pct_delta(tokens["total_tokens"], prev_tokens["total_tokens"]),
            "total_cost_prev": prev_cost_total,
            "total_cost_delta_pct": pct_delta(cost_totals["total"], prev_cost_total),
        },
        "cost": {
            **cost_totals,
            "priced_calls": priced_calls,
            "unpriced_calls": unpriced_calls,
            "available": priced_calls > 0,
        },
        "prompt_efficiency": {
            "avg_input_tokens": _rate(sum(input_values), len(input_values)),
            "avg_output_tokens": _rate(sum(output_values), len(output_values)),
            "input_output_ratio": _rate(sum(input_values), sum(output_values)),
            "p95_input_tokens": percentile(input_values, 0.95),
            "p95_output_tokens": percentile(output_values, 0.95),
            "largest_prompt_tokens": max(input_values, default=None),
            "largest_response_tokens": max(output_values, default=None),
        },
    }
    cache.set(cache_key, result, _CACHE_TTL_SECONDS)
    return result


def get_timeseries(filters: dict) -> list[dict]:
    cache_key = _cache_key("timeseries", filters)
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    pricing_map = get_pricing_map()
    start, end, granularity = filters["start"], filters["end"], filters["granularity"]
    buckets = list(iter_buckets(start, end, granularity))
    accum = [
        {
            "input_tokens": 0, "output_tokens": 0, "total_tokens": 0, "calls": 0, "errors": 0,
            "cache_read_tokens": 0, "cache_write_tokens": 0, "cost": 0.0, "cost_available": False,
        }
        for _ in buckets
    ]

    for r in _queryset(filters).values(*_ROW_FIELDS):
        idx = bucket_index(r["created_at"], start, granularity)
        if idx < 0 or idx >= len(accum):
            continue
        row = accum[idx]
        row["calls"] += 1
        row["errors"] += 1 if r["error"] else 0
        input_tokens, output_tokens = r["input_tokens"] or 0, r["output_tokens"] or 0
        row["input_tokens"] += input_tokens
        row["output_tokens"] += output_tokens
        row["total_tokens"] += input_tokens + output_tokens
        row["cache_read_tokens"] += r["cache_read_tokens"] or 0
        row["cache_write_tokens"] += r["cache_write_tokens"] or 0
        cost = _cost_for_row(r, pricing_map)
        if cost is not None:
            row["cost"] += cost["total"]
            row["cost_available"] = True

    result = []
    for (bucket_start, _bucket_end), row in zip(buckets, accum):
        row["bucket"] = bucket_start.isoformat()
        row["avg_input_tokens_per_call"] = _rate(row["input_tokens"], row["calls"])
        result.append(row)
    cache.set(cache_key, result, _CACHE_TTL_SECONDS)
    return result


def get_provider_cost_timeseries(filters: dict) -> dict:
    """Cost-over-time split by provider — powers the provider-comparison
    overlay on the cost chart when 'All Providers' is selected. Ignores any
    `provider` filter (the whole point is comparing across providers) — so
    the cache key is built from the provider-cleared filters too, or a date
    range queried under two different provider filters would otherwise
    cache the same result twice for no reason."""
    unfiltered = dict(filters)
    unfiltered["provider"] = None
    return _cached("provider_cost_timeseries", unfiltered, lambda: _compute_provider_cost_timeseries(filters, unfiltered))


def _compute_provider_cost_timeseries(filters: dict, unfiltered: dict) -> dict:
    start, end, granularity = filters["start"], filters["end"], filters["granularity"]
    buckets = list(iter_buckets(start, end, granularity))
    pricing_map = get_pricing_map()

    series: dict[str, list[float]] = defaultdict(lambda: [0.0] * len(buckets))
    for r in _queryset(unfiltered).values(*_ROW_FIELDS):
        idx = bucket_index(r["created_at"], start, granularity)
        if idx < 0 or idx >= len(buckets):
            continue
        cost = _cost_for_row(r, pricing_map)
        if cost is not None:
            series[r["provider"]][idx] += cost["total"]

    return {
        "buckets": [b[0].isoformat() for b in buckets],
        "providers": dict(series),
    }


def _grouped(filters: dict, key_fields: tuple[str, ...]) -> list[dict]:
    pricing_map = get_pricing_map()
    groups: dict[tuple, dict] = {}
    for r in _queryset(filters).values(*_ROW_FIELDS):
        key = tuple(r[f] for f in key_fields)
        g = groups.setdefault(key, {
            "calls": 0, "errors": 0, "input_tokens": 0, "output_tokens": 0,
            "cache_read_tokens": 0, "cache_write_tokens": 0,
            "latency_sum": 0.0, "latency_n": 0, "cost_total": 0.0, "cost_available": False,
        })
        g["calls"] += 1
        g["errors"] += 1 if r["error"] else 0
        g["input_tokens"] += r["input_tokens"] or 0
        g["output_tokens"] += r["output_tokens"] or 0
        g["cache_read_tokens"] += r["cache_read_tokens"] or 0
        g["cache_write_tokens"] += r["cache_write_tokens"] or 0
        if r["latency_ms"] is not None:
            g["latency_sum"] += r["latency_ms"]
            g["latency_n"] += 1
        cost = _cost_for_row(r, pricing_map)
        if cost is not None:
            g["cost_total"] += cost["total"]
            g["cost_available"] = True

    out = []
    for key, g in groups.items():
        row = dict(zip(key_fields, key))
        total_tokens = g["input_tokens"] + g["output_tokens"]
        row.update({
            "calls": g["calls"],
            "errors": g["errors"],
            "error_rate": _rate(g["errors"], g["calls"]),
            "input_tokens": g["input_tokens"],
            "output_tokens": g["output_tokens"],
            "total_tokens": total_tokens,
            "avg_tokens_per_call": _rate(total_tokens, g["calls"]),
            "cache_read_tokens": g["cache_read_tokens"],
            "cache_write_tokens": g["cache_write_tokens"],
            "avg_latency_ms": _rate(g["latency_sum"], g["latency_n"]),
            "cost": g["cost_total"] if g["cost_available"] else None,
        })
        out.append(row)
    return out


def get_providers(filters: dict) -> list[dict]:
    return _cached("providers", filters, lambda: _grouped(filters, ("provider",)))


def get_models(filters: dict) -> list[dict]:
    return _cached("models", filters, lambda: _grouped(filters, ("provider", "model")))


def get_call_sites(filters: dict) -> list[dict]:
    return _cached("call_sites", filters, lambda: _grouped(filters, ("call_site",)))


def get_performance(filters: dict) -> dict:
    return _cached("performance", filters, lambda: _compute_performance(filters))


def _compute_performance(filters: dict) -> dict:
    """Latency percentiles overall and broken down by provider/model/call
    site — nearest-rank percentile over the filtered latencies (no extra
    dependency; exact for this data size)."""
    def percentile(sorted_values: list[float], p: float) -> float | None:
        if not sorted_values:
            return None
        idx = max(0, min(len(sorted_values) - 1, int(round(p * (len(sorted_values) - 1)))))
        return sorted_values[idx]

    rows = list(_queryset(filters).values("provider", "model", "call_site", "latency_ms", "error", "created_at"))
    latencies = sorted(r["latency_ms"] for r in rows if r["latency_ms"] is not None)
    errors = sum(1 for r in rows if r["error"])

    slowest = max(rows, key=lambda r: r["latency_ms"] or 0, default=None)

    def breakdown(key_field: str) -> list[dict]:
        by_key: dict[str, list[float]] = defaultdict(list)
        err_by_key: dict[str, int] = defaultdict(int)
        calls_by_key: dict[str, int] = defaultdict(int)
        for r in rows:
            k = r[key_field]
            calls_by_key[k] += 1
            if r["error"]:
                err_by_key[k] += 1
            if r["latency_ms"] is not None:
                by_key[k].append(r["latency_ms"])
        out = []
        for k, vals in by_key.items():
            vals.sort()
            out.append({
                key_field: k,
                "calls": calls_by_key[k],
                "avg_latency_ms": sum(vals) / len(vals) if vals else None,
                "p50_latency_ms": percentile(vals, 0.5),
                "p95_latency_ms": percentile(vals, 0.95),
                "error_rate": _rate(err_by_key[k], calls_by_key[k]),
            })
        return out

    # filters["end"] is the period's nominal boundary, which for every
    # preset except "yesterday"/a past-dated custom range extends through
    # the END of today (or this week/month/year) — i.e. into the future
    # relative to right now. Dividing by the full nominal span for a
    # same-day "Today" filter understated the actual current pace by up to
    # ~24x (a full day's worth of not-yet-elapsed minutes in the
    # denominator). Clamp the effective end to "now" so this is a rate over
    # what's actually elapsed, not the whole selected window.
    effective_end = min(filters["end"], dj_timezone.now().astimezone(dt_timezone.utc))
    span_minutes = max((effective_end - filters["start"]).total_seconds() / 60, 1)

    return {
        "avg_latency_ms": sum(latencies) / len(latencies) if latencies else None,
        "p50_latency_ms": percentile(latencies, 0.5),
        "p95_latency_ms": percentile(latencies, 0.95),
        "slowest_request": (
            {"provider": slowest["provider"], "model": slowest["model"], "call_site": slowest["call_site"],
             "latency_ms": slowest["latency_ms"], "created_at": slowest["created_at"].isoformat()}
            if slowest and slowest["latency_ms"] is not None else None
        ),
        "requests_per_minute": len(rows) / span_minutes,
        "error_rate": _rate(errors, len(rows)),
        "by_provider": breakdown("provider"),
        "by_model": breakdown("model"),
        "by_call_site": breakdown("call_site"),
    }


def get_cache_analytics(filters: dict) -> dict:
    return _cached("cache", filters, lambda: _compute_cache_analytics(filters))


def _compute_cache_analytics(filters: dict) -> dict:
    rows = list(_queryset(filters).values(*_ROW_FIELDS))
    cache_read = sum(r["cache_read_tokens"] or 0 for r in rows)
    cache_write = sum(r["cache_write_tokens"] or 0 for r in rows)
    uncached_input = sum(
        uncached_input_tokens(provider=r["provider"], input_tokens=r["input_tokens"], cache_read_tokens=r["cache_read_tokens"])
        for r in rows
    )

    by_model: dict[tuple[str, str], dict] = {}
    for r in rows:
        key = (r["provider"], r["model"])
        g = by_model.setdefault(key, {"cache_read_tokens": 0, "cache_write_tokens": 0, "uncached_input_tokens": 0, "calls": 0})
        g["cache_read_tokens"] += r["cache_read_tokens"] or 0
        g["cache_write_tokens"] += r["cache_write_tokens"] or 0
        g["uncached_input_tokens"] += uncached_input_tokens(
            provider=r["provider"], input_tokens=r["input_tokens"], cache_read_tokens=r["cache_read_tokens"]
        )
        g["calls"] += 1

    by_model_out = []
    for (provider, model), g in by_model.items():
        by_model_out.append({
            "provider": provider, "model": model, **g,
            "cache_hit_rate": _rate(g["cache_read_tokens"], g["cache_read_tokens"] + g["uncached_input_tokens"]),
        })

    provider_capability = [
        {
            "provider": provider,
            "prompt_caching": "enabled" if capable else "unavailable",
            "read_tokens": sum(r["cache_read_tokens"] or 0 for r in rows if r["provider"] == provider),
            "write_tokens": sum(r["cache_write_tokens"] or 0 for r in rows if r["provider"] == provider),
        }
        for provider, capable in _CACHE_CAPABLE.items()
    ]

    return {
        "cache_read_tokens": cache_read,
        "cache_write_tokens": cache_write,
        "uncached_input_tokens": uncached_input,
        "cache_hit_rate": _rate(cache_read, cache_read + uncached_input),
        # Provider-reported cache reads ARE the tokens that avoided full
        # reprocessing — not a separate estimate layered on top (Stats spec:
        # "Only count actual cache reads from provider telemetry").
        "estimated_tokens_avoided": cache_read,
        "by_model": by_model_out,
        "provider_capability": provider_capability,
    }


def get_optimization_analytics(filters: dict) -> dict:
    return _cached("optimization", filters, lambda: _compute_optimization_analytics(filters))


def _compute_optimization_analytics(filters: dict) -> dict:
    qs = OptimizationEvent.objects.filter(created_at__gte=filters["start"], created_at__lt=filters["end"])

    def count(category: str, outcome: str | None = None) -> int:
        q = qs.filter(category=category)
        return q.filter(outcome=outcome).count() if outcome is not None else q.count()

    gate_total = count("memory_gate")
    gate_skipped = count("memory_gate", "skipped")

    hits = count("memory_retrieval", "cache_hit")
    misses = count("memory_retrieval", "cache_miss")
    retrieval_agg = qs.filter(category="memory_retrieval").aggregate(avg_count=Avg("count"))
    miss_agg = qs.filter(category="memory_retrieval", outcome="cache_miss").aggregate(avg_filtered=Avg("extra"))

    dedup_total = count("dedup")
    dedup_dupes = count("dedup", "duplicate")

    routing_full = count("tool_routing", "full")
    routing_routed = count("tool_routing", "routed")
    routing_agg = qs.filter(category="tool_routing").aggregate(avg_tools=Avg("count"))
    routed_agg = qs.filter(category="tool_routing", outcome="routed").aggregate(avg_routed=Avg("count"), avg_full=Avg("extra"))
    reduction_pct = None
    if routed_agg["avg_routed"] and routed_agg["avg_full"]:
        reduction_pct = 1 - (routed_agg["avg_routed"] / routed_agg["avg_full"])

    trim_agg = qs.filter(category="agent_trim").aggregate(avg_before=Avg("count"), avg_sent=Avg("extra"))
    trim_steps_trimmed = count("agent_trim", "trimmed")
    trim_steps_total = count("agent_trim")

    trunc_qs = qs.filter(category="truncation")
    trunc_agg = trunc_qs.aggregate(original=Sum("count"), kept=Sum("extra"), n=Count("id"))

    return {
        "memory": {
            "gate_evaluations": gate_total,
            "gate_skipped": gate_skipped,
            "gate_skip_rate": _rate(gate_skipped, gate_total),
            "retrieval_cache_hits": hits,
            "retrieval_cache_misses": misses,
            "retrieval_cache_hit_rate": _rate(hits, hits + misses),
            "avg_memories_retrieved": retrieval_agg["avg_count"],
            "avg_memories_filtered_by_threshold": miss_agg["avg_filtered"],
        },
        "tool_routing": {
            "full_toolset_requests": routing_full,
            "routed_requests": routing_routed,
            "avg_tools_exposed": routing_agg["avg_tools"],
            # Tool-COUNT reduction, not a measured token reduction — labeled
            # as an estimate per the Stats spec's rule on unmeasured savings.
            "estimated_context_reduction_pct": reduction_pct,
        },
        "dedup": {
            "write_attempts": dedup_total,
            "duplicates_prevented": dedup_dupes,
            "duplicate_prevention_rate": _rate(dedup_dupes, dedup_total),
        },
        "truncation": {
            "truncated_payloads": trunc_agg["n"] or 0,
            "original_chars": trunc_agg["original"] or 0,
            "kept_chars": trunc_agg["kept"] or 0,
        },
        "agent_trim": {
            # Per LLM-loop step, not per whole agent run (pre_model_hook
            # fires once per iteration) — see agent/graph.py::_trim_agent_messages.
            "llm_steps_observed": trim_steps_total,
            "llm_steps_trimmed": trim_steps_trimmed,
            "avg_messages_before": trim_agg["avg_before"],
            "avg_messages_sent_to_model": trim_agg["avg_sent"],
        },
    }


def get_top_usage(filters: dict, kind: str, limit: int = 10, offset: int = 0) -> dict:
    """kind: "cost" | "input_tokens" | "output_tokens". Never returns
    prompt/response content — metadata + usage numbers only (Stats spec
    security rule)."""
    return _cached(
        "top_usage", filters,
        lambda: _compute_top_usage(filters, kind, limit, offset),
        extra=f"{kind}:{limit}:{offset}",
    )


def _compute_top_usage(filters: dict, kind: str, limit: int, offset: int) -> dict:
    pricing_map = get_pricing_map()
    rows = list(_queryset(filters).values(*_ROW_FIELDS))

    def row_out(r: dict) -> dict:
        cost = _cost_for_row(r, pricing_map)
        return {
            "created_at": r["created_at"].isoformat(),
            "provider": r["provider"],
            "model": r["model"],
            "call_site": r["call_site"],
            "input_tokens": r["input_tokens"],
            "output_tokens": r["output_tokens"],
            "cache_read_tokens": r["cache_read_tokens"],
            "cache_write_tokens": r["cache_write_tokens"],
            "estimated": r["estimated"],
            "cost": cost["total"] if cost is not None else None,
            "latency_ms": r["latency_ms"],
        }

    if kind == "cost":
        decorated = [(row_out(r), None) for r in rows]
        decorated.sort(key=lambda pair: pair[0]["cost"] if pair[0]["cost"] is not None else -1, reverse=True)
    elif kind == "output_tokens":
        decorated = [(row_out(r), None) for r in rows]
        decorated.sort(key=lambda pair: pair[0]["output_tokens"] or 0, reverse=True)
    else:
        decorated = [(row_out(r), None) for r in rows]
        decorated.sort(key=lambda pair: pair[0]["input_tokens"] or 0, reverse=True)

    ordered = [pair[0] for pair in decorated]
    return {"count": len(ordered), "results": ordered[offset : offset + limit]}


def get_budget() -> dict:
    """Always the CURRENT calendar month, independent of the dashboard's
    selected date-range filter — a "monthly budget" means the calendar
    month, not whatever range happens to be selected. Purely an
    application-estimated figure computed from LLMCallLog + PricingConfig;
    see BudgetSettings' docstring for why this is never a provider account
    balance."""
    now = dj_timezone.now().astimezone(dt_timezone.utc)
    period_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    days_in_month = calendar.monthrange(now.year, now.month)[1]
    period_end = period_start.replace(day=days_in_month) + timedelta(days=1)

    settings_row = BudgetSettings.current()
    pricing_map = get_pricing_map()
    rows = list(
        LLMCallLog.objects.filter(created_at__gte=period_start, created_at__lt=now)
        .values(*_ROW_FIELDS)
    )
    spend = 0.0
    priced_calls = 0
    for r in rows:
        cost = _cost_for_row(r, pricing_map)
        if cost is not None:
            spend += cost["total"]
            priced_calls += 1

    days_elapsed = max((now - period_start).total_seconds() / 86400, 1 / 24)
    projected = (spend / days_elapsed) * days_in_month if priced_calls else None

    budget = settings_row.monthly_budget_usd
    # A budget of exactly $0 is a legitimate "alert on any spend" setting,
    # not the same as "no budget configured" — `_rate` treats a falsy
    # denominator (0 included) as "no rate", which would silently collapse
    # a real $0 budget into the same None as an unconfigured one. Handle it
    # explicitly: 0/0 reads as on-budget (0%), any spend against a $0
    # budget reads as maximally over.
    if budget is None:
        used_pct = None
    elif budget == 0:
        used_pct = 1.0 if spend > 0 else 0.0
    else:
        used_pct = spend / budget

    current_period_key = now.strftime("%Y-%m")
    fired = settings_row.fired_thresholds() if settings_row.alerts_period == current_period_key else []
    newly_crossed = []
    if budget is not None and used_pct is not None:
        pct_int = used_pct * 100
        for t in settings_row.thresholds():
            if pct_int >= t and t not in fired:
                newly_crossed.append(t)
        if newly_crossed:
            fired = sorted(set(fired + newly_crossed))
            settings_row.alerts_fired = ",".join(str(t) for t in fired)
            settings_row.alerts_period = current_period_key
            settings_row.save(update_fields=["alerts_fired", "alerts_period"])

    return {
        "monthly_budget_usd": budget,
        "period_start": period_start.isoformat(),
        "period_end": period_end.isoformat(),
        "current_spend_usd": spend,
        "remaining_usd": (budget - spend) if budget is not None else None,
        "used_pct": used_pct,
        "projected_period_spend_usd": projected,
        "thresholds": settings_row.thresholds(),
        "thresholds_crossed": fired,
        "cost_available": priced_calls > 0,
        "spend_kind": "application_estimated",
    }
