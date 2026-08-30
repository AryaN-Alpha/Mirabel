"""Per-call LLM token/cost telemetry — structured log lines, no schema
change. Greppable immediately: `grep telemetry backend/logs/mirabel.log`.

Deliberately a thin, never-raising wrapper: a telemetry failure must never
break the request it's trying to measure (see CLAUDE.md's "optimization
failures don't break normal operation" convention)."""

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
) -> None:
    try:
        total = (
            (input_tokens or 0) + (output_tokens or 0)
            if input_tokens is not None or output_tokens is not None
            else None
        )
        logger.info(
            "llm_call provider=%s model=%s call_site=%s input_tokens=%s output_tokens=%s "
            "total_tokens=%s latency_ms=%s estimated=%s cache_read_tokens=%s cache_write_tokens=%s",
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
        )
    except Exception:
        logger.debug("telemetry logging failed", exc_info=True)


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
