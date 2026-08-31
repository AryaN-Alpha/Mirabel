"""Date-range resolution for the Stats dashboard's global filter bar.

All boundaries are computed in UTC. This app has a single hardcoded
TIME_ZONE="UTC" (mirabel/settings.py, USE_TZ=True) and no per-user timezone
concept (no auth/multi-user system — see CLAUDE.md's "Known gaps"), so UTC
is the one consistent timezone convention to apply everywhere the dashboard
buckets or compares dates.
"""

from __future__ import annotations

import calendar
from datetime import datetime, timedelta, timezone as dt_timezone

from django.utils import timezone as dj_timezone

PERIOD_CHOICES = (
    "today", "yesterday", "this_week", "last_7_days", "this_month",
    "last_30_days", "this_year", "last_12_months", "custom",
)


class InvalidPeriod(ValueError):
    pass


def _start_of_day(dt: datetime) -> datetime:
    return dt.replace(hour=0, minute=0, second=0, microsecond=0)


def _start_of_week(dt: datetime) -> datetime:
    day = _start_of_day(dt)
    return day - timedelta(days=day.weekday())


def _start_of_month(dt: datetime) -> datetime:
    return _start_of_day(dt).replace(day=1)


def _start_of_year(dt: datetime) -> datetime:
    return _start_of_day(dt).replace(month=1, day=1)


def _add_months(dt: datetime, months: int) -> datetime:
    """Day-clamping month arithmetic: `resolve_period`'s own callers always
    pass a day=1 datetime, but `iter_buckets` also calls this with whatever
    day a `custom` range's start_date happens to be — a start_date of the
    29th/30th/31st stepping into a shorter month (e.g. Jan 31 -> Feb) would
    otherwise raise ValueError (verified: `datetime.replace(month=2, day=31)`
    is not a recoverable-by-luck case, every February lacks day 29-31 in a
    non-leap year and no month has 31 in exactly half of cases) and 500 the
    request. Clamp to the target month's last real day instead, the same
    convention `dateutil.relativedelta` uses."""
    month_index = dt.month - 1 + months
    year = dt.year + month_index // 12
    month = month_index % 12 + 1
    day = min(dt.day, calendar.monthrange(year, month)[1])
    return dt.replace(year=year, month=month, day=day)


def resolve_period(period: str, start_date: str | None = None, end_date: str | None = None) -> dict:
    """Returns start/end (tz-aware UTC, end EXCLUSIVE), prev_start/prev_end
    (the immediately preceding period of equal length — used for the KPI
    "vs previous period" comparison), and a granularity ("hour"/"day"/
    "month") for time-series bucketing that scales with the range's length
    rather than needlessly aggregating a single day down to monthly points
    or exploding a year into hourly ones.
    """
    now = dj_timezone.now().astimezone(dt_timezone.utc)
    today = _start_of_day(now)

    if period == "today":
        start, end, granularity = today, today + timedelta(days=1), "hour"
    elif period == "yesterday":
        start, end, granularity = today - timedelta(days=1), today, "hour"
    elif period == "this_week":
        start, end, granularity = _start_of_week(now), today + timedelta(days=1), "day"
    elif period == "last_7_days":
        start, end, granularity = today - timedelta(days=6), today + timedelta(days=1), "day"
    elif period == "this_month":
        start, end, granularity = _start_of_month(now), today + timedelta(days=1), "day"
    elif period == "last_30_days":
        start, end, granularity = today - timedelta(days=29), today + timedelta(days=1), "day"
    elif period == "this_year":
        start, end, granularity = _start_of_year(now), today + timedelta(days=1), "month"
    elif period == "last_12_months":
        start = _add_months(_start_of_month(now), -11)
        end, granularity = today + timedelta(days=1), "month"
    elif period == "custom":
        if not start_date or not end_date:
            raise InvalidPeriod("custom period requires start_date and end_date")
        try:
            start = _start_of_day(datetime.fromisoformat(start_date)).replace(tzinfo=dt_timezone.utc)
            end_inclusive = _start_of_day(datetime.fromisoformat(end_date)).replace(tzinfo=dt_timezone.utc)
        except ValueError as exc:
            raise InvalidPeriod(f"invalid date: {exc}") from None
        if end_inclusive < start:
            raise InvalidPeriod("end_date must not be before start_date")
        end = end_inclusive + timedelta(days=1)
        span_days = (end - start).days
        granularity = "hour" if span_days <= 2 else "day" if span_days <= 92 else "month"
    else:
        raise InvalidPeriod(f"unknown period: {period!r}")

    span = end - start
    prev_start, prev_end = start - span, start

    return {
        "start": start,
        "end": end,
        "prev_start": prev_start,
        "prev_end": prev_end,
        "granularity": granularity,
    }


def bucket_index(dt: datetime, start: datetime, granularity: str) -> int:
    """Index of the bucket `dt` falls into, given the same (start,
    granularity) passed to iter_buckets — a direct O(1) computation since
    buckets are regular-width, avoiding an O(buckets) scan per telemetry
    row when assigning thousands of rows to buckets."""
    if granularity == "hour":
        return int((dt - start).total_seconds() // 3600)
    if granularity == "day":
        return (dt.date() - start.date()).days
    return (dt.year - start.year) * 12 + (dt.month - start.month)


def iter_buckets(start: datetime, end: datetime, granularity: str):
    """Yields (bucket_start, bucket_end) pairs spanning [start, end) — used
    to zero-fill time-series buckets that have no telemetry rows, so a quiet
    hour/day/month renders as 0 rather than simply not appearing."""
    cur = start
    while cur < end:
        if granularity == "hour":
            nxt = cur + timedelta(hours=1)
        elif granularity == "day":
            nxt = cur + timedelta(days=1)
        else:
            nxt = _add_months(cur, 1)
        yield cur, nxt
        cur = nxt
