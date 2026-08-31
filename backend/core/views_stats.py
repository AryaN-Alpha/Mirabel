"""Stats dashboard API — a read-only analytics layer over LLMCallLog/
OptimizationEvent (see core/services/analytics.py for the actual
aggregation). Deliberately separate from core/views.py: this is a distinct,
sizeable surface (LLM usage/cost observability) with no overlap in
responsibility with the settings/chat endpoints already in that file.

Every endpoint here is read-only observability except PUT /stats/budget/ —
nothing here can affect LLM execution (Stats spec: "The Stats system is an
observability layer, not part of the critical LLM execution path").
"""

from __future__ import annotations

import csv

from django.http import HttpResponse
from rest_framework.decorators import api_view, throttle_classes
from rest_framework.request import Request
from rest_framework.response import Response

from core.models import BudgetSettings, PricingConfig
from core.services import analytics
from core.services.period import InvalidPeriod, resolve_period

# core/views.py's `chat` throttle (settings.REST_FRAMEWORK's global
# AnonRateThrottle, 30/min) exists as "a cheap guard against runaway
# per-request LLM cost" (CLAUDE.md) — it applies to every DRF view by
# default, including these. None of the Stats endpoints call an LLM or cost
# anything; they're read-only DB aggregation. Left throttled, a single
# dashboard load (~10 parallel requests: overview/timeseries/providers/
# models/call-sites/cache/performance/optimization/budget/meta, then
# Top Usage) burns a third of the per-minute budget by itself — verified
# live: two page loads plus a filter change was enough to trip "Request was
# throttled" in the browser. Opt every Stats view out rather than raising
# the global rate, which would also loosen the actual LLM-cost guard on `chat`.
_UNTHROTTLED = throttle_classes([])


def _parse_filters(request: Request) -> tuple[dict | None, Response | None]:
    period = request.query_params.get("period", "last_30_days")
    start_date = request.query_params.get("start_date")
    end_date = request.query_params.get("end_date")
    try:
        resolved = resolve_period(period, start_date, end_date)
    except InvalidPeriod as exc:
        return None, Response({"error": str(exc)}, status=400)

    estimated_param = request.query_params.get("estimated")
    estimated = None
    if estimated_param is not None:
        estimated = estimated_param.strip().lower() in ("1", "true", "yes")

    filters = dict(resolved)
    filters["provider"] = request.query_params.get("provider") or None
    filters["model"] = request.query_params.get("model") or None
    filters["call_site"] = request.query_params.get("call_site") or None
    filters["estimated"] = estimated
    return filters, None


@api_view(["GET"])
@_UNTHROTTLED
def meta(_request: Request) -> Response:
    return Response(analytics.get_meta())


@api_view(["GET"])
@_UNTHROTTLED
def overview(request: Request) -> Response:
    filters, err = _parse_filters(request)
    if err:
        return err
    return Response(analytics.get_overview(filters))


@api_view(["GET"])
@_UNTHROTTLED
def timeseries(request: Request) -> Response:
    filters, err = _parse_filters(request)
    if err:
        return err
    result = {"buckets": analytics.get_timeseries(filters)}
    if request.query_params.get("group_by") == "provider":
        result["by_provider"] = analytics.get_provider_cost_timeseries(filters)
    return Response(result)


@api_view(["GET"])
@_UNTHROTTLED
def providers(request: Request) -> Response:
    filters, err = _parse_filters(request)
    if err:
        return err
    return Response({"results": analytics.get_providers(filters)})


@api_view(["GET"])
@_UNTHROTTLED
def models(request: Request) -> Response:
    filters, err = _parse_filters(request)
    if err:
        return err
    return Response({"results": analytics.get_models(filters)})


@api_view(["GET"])
@_UNTHROTTLED
def call_sites(request: Request) -> Response:
    filters, err = _parse_filters(request)
    if err:
        return err
    return Response({"results": analytics.get_call_sites(filters)})


@api_view(["GET"])
@_UNTHROTTLED
def cache_analytics(request: Request) -> Response:
    filters, err = _parse_filters(request)
    if err:
        return err
    return Response(analytics.get_cache_analytics(filters))


@api_view(["GET"])
@_UNTHROTTLED
def performance(request: Request) -> Response:
    filters, err = _parse_filters(request)
    if err:
        return err
    return Response(analytics.get_performance(filters))


@api_view(["GET"])
@_UNTHROTTLED
def optimization(request: Request) -> Response:
    filters, err = _parse_filters(request)
    if err:
        return err
    return Response(analytics.get_optimization_analytics(filters))


@api_view(["GET"])
@_UNTHROTTLED
def top_usage(request: Request) -> Response:
    filters, err = _parse_filters(request)
    if err:
        return err
    kind = request.query_params.get("kind", "cost")
    if kind not in ("cost", "input_tokens", "output_tokens"):
        return Response({"error": f"unknown kind: {kind!r}"}, status=400)
    try:
        limit = min(max(int(request.query_params.get("limit", 10)), 1), 100)
        offset = max(int(request.query_params.get("offset", 0)), 0)
    except (TypeError, ValueError):
        return Response({"error": "limit/offset must be integers"}, status=400)
    return Response(analytics.get_top_usage(filters, kind, limit=limit, offset=offset))


@api_view(["GET"])
@_UNTHROTTLED
def pricing(_request: Request) -> Response:
    rows = list(
        PricingConfig.objects.values(
            "provider", "model", "input_price_per_1m", "output_price_per_1m",
            "cache_read_price_per_1m", "cache_write_price_per_1m",
        )
    )
    return Response({"results": rows})


@api_view(["GET", "PUT"])
@_UNTHROTTLED
def budget(request: Request) -> Response:
    if request.method == "GET":
        return Response(analytics.get_budget())

    settings_row = BudgetSettings.current()
    raw_budget = request.data.get("monthly_budget_usd", settings_row.monthly_budget_usd)
    if raw_budget is not None:
        try:
            raw_budget = float(raw_budget)
        except (TypeError, ValueError):
            return Response({"error": "monthly_budget_usd must be a number"}, status=400)
        if raw_budget < 0:
            return Response({"error": "monthly_budget_usd must not be negative"}, status=400)

    raw_thresholds = request.data.get("alert_thresholds")
    thresholds_str = settings_row.alert_thresholds
    if raw_thresholds is not None:
        # A bare string (e.g. "50") is iterable character-by-character in
        # Python — {int(t) for t in "50"} silently succeeds as {5, 0}
        # instead of raising, which would accept malformed input as if it
        # were a valid threshold list. Require an actual list/tuple first.
        if not isinstance(raw_thresholds, (list, tuple)):
            return Response({"error": "alert_thresholds must be a list of integers"}, status=400)
        try:
            parsed = sorted({int(t) for t in raw_thresholds})
        except (TypeError, ValueError):
            return Response({"error": "alert_thresholds must be a list of integers"}, status=400)
        if any(t <= 0 or t > 500 for t in parsed):
            return Response({"error": "alert_thresholds must be between 1 and 500"}, status=400)
        thresholds_str = ",".join(str(t) for t in parsed)

    settings_row.monthly_budget_usd = raw_budget
    settings_row.alert_thresholds = thresholds_str
    settings_row.save(update_fields=["monthly_budget_usd", "alert_thresholds"])
    return Response(analytics.get_budget())


@api_view(["GET"])
@_UNTHROTTLED
def export_csv(request: Request) -> HttpResponse:
    """CSV export of the currently filtered aggregate rows — never raw
    telemetry/prompt content (Stats spec: "Export aggregated usage data
    rather than exposing sensitive raw prompts")."""
    filters, err = _parse_filters(request)
    if err:
        return err
    section = request.query_params.get("section", "call_sites")
    getters = {
        "providers": (analytics.get_providers, ("provider", "calls", "input_tokens", "output_tokens", "total_tokens", "avg_tokens_per_call", "cache_read_tokens", "cost", "error_rate")),
        "models": (analytics.get_models, ("provider", "model", "calls", "input_tokens", "output_tokens", "total_tokens", "avg_tokens_per_call", "cost", "error_rate")),
        "call_sites": (analytics.get_call_sites, ("call_site", "calls", "input_tokens", "output_tokens", "total_tokens", "avg_tokens_per_call", "cost", "error_rate")),
    }
    if section not in getters:
        return Response({"error": f"unknown section: {section!r}"}, status=400)
    getter, columns = getters[section]
    rows = getter(filters)

    response = HttpResponse(content_type="text/csv")
    response["Content-Disposition"] = f'attachment; filename="mirabel-stats-{section}.csv"'
    writer = csv.writer(response)
    writer.writerow(columns)
    for row in rows:
        writer.writerow([row.get(col, "") for col in columns])
    return response
