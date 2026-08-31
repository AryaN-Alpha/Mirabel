"""Per-call LLM token/cost telemetry — structured log lines, plus a
best-effort mirror into the LLMCallLog table (see core/models.py) that the
Stats dashboard (core/services/analytics.py) queries. The log line stays the
source of truth for live `grep`-based debugging: `grep telemetry
backend/logs/mirabel.log`. The DB row exists only because the dashboard
needs indexed date-range/provider/model/call-site filtering and time-series
aggregation, which repeatedly re-parsing the log file can't do efficiently.

Deliberately a thin, never-raising wrapper: a telemetry failure must never
break the request it's trying to measure (see CLAUDE.md's "optimization
failures don't break normal operation" convention). The DB write is wrapped
separately from the log line so a DB outage doesn't also silence the log
line, and vice versa.
"""

import logging

logger = logging.getLogger("telemetry")


def log_llm_call(
    *,
    provider: str,
    model: str,
    call_site: str,
    input_tokens: int | None = None,
    output_tokens: int | None = None,
    latency_ms: float | None = None,
    estimated: bool = False,
    cache_read_tokens: int | None = None,
    cache_write_tokens: int | None = None,
    error: bool = False,
) -> None:
    try:
        total = (
            (input_tokens or 0) + (output_tokens or 0)
            if input_tokens is not None or output_tokens is not None
            else None
        )
        logger.info(
            "llm_call provider=%s model=%s call_site=%s input_tokens=%s output_tokens=%s "
            "total_tokens=%s latency_ms=%s estimated=%s cache_read_tokens=%s cache_write_tokens=%s error=%s",
            provider,
            model,
            call_site,
            input_tokens,
            output_tokens,
            total,
            f"{latency_ms:.0f}" if latency_ms is not None else None,
            estimated,
            cache_read_tokens,
            cache_write_tokens,
            error,
        )
    except Exception:
        logger.debug("telemetry logging failed", exc_info=True)

    try:
        from core.models import LLMCallLog

        LLMCallLog.objects.create(
            provider=provider,
            model=model,
            call_site=call_site,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            cache_read_tokens=cache_read_tokens,
            cache_write_tokens=cache_write_tokens,
            latency_ms=latency_ms,
            estimated=estimated,
            error=error,
        )
    except Exception:
        logger.debug("telemetry DB write failed", exc_info=True)


def log_optimization_event(
    *,
    category: str,
    outcome: str = "",
    count: int | None = None,
    extra: int | None = None,
) -> None:
    """Records one observed event for the "Token Optimization Analytics"
    Stats section (memory gating/retrieval-cache, dedup, agent tool
    routing, agent history trimming). Never raises — see module docstring.
    """
    try:
        from core.models import OptimizationEvent

        OptimizationEvent.objects.create(category=category, outcome=outcome, count=count, extra=extra)
    except Exception:
        logger.debug("optimization event logging failed", exc_info=True)


def log_truncation(
    *,
    label: str,
    call_site: str,
    original_chars: int,
    kept_chars: int,
) -> None:
    """Fired only when core/services/text_utils.py actually cuts something
    (never on the common case where content already fits). Gives real
    evidence of how often/how much the existing truncation caps are hit —
    the input a future gated-semantic-compression pass would need before
    it's worth building, rather than guessing. Greppable:
    `grep truncation backend/logs/mirabel.log`."""
    try:
        logger.info(
            "truncation label=%s call_site=%s original_chars=%s kept_chars=%s omitted_chars=%s",
            label,
            call_site,
            original_chars,
            kept_chars,
            original_chars - kept_chars,
        )
    except Exception:
        logger.debug("telemetry logging failed", exc_info=True)

    log_optimization_event(category="truncation", outcome=label, count=original_chars, extra=kept_chars)
