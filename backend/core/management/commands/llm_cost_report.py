"""Aggregates the `telemetry` log lines written by core/services/telemetry.py
into a per-call-site cost/usage summary — the log-based answer to "why did
this cost X", without a DB table or migration (see core/services/telemetry.py's
module docstring for why structured log lines were chosen over a schema).

Usage:
    python manage.py llm_cost_report
    python manage.py llm_cost_report --since-hours 24
    python manage.py llm_cost_report --log-file /path/to/other.log
"""

from __future__ import annotations

import re
from datetime import datetime, timedelta
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand

_LINE_RE = re.compile(
    r"^(?P<ts>\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2},\d{3}) \S+ telemetry llm_call "
    r"provider=(?P<provider>\S+) model=(?P<model>\S+) call_site=(?P<call_site>\S+) "
    r"input_tokens=(?P<input>\S+) output_tokens=(?P<output>\S+) total_tokens=(?P<total>\S+) "
    r"latency_ms=(?P<latency>\S+) estimated=(?P<estimated>\S+)"
    r"(?: cache_read_tokens=(?P<cache_read>\S+) cache_write_tokens=(?P<cache_write>\S+))?"
)


def _to_int(value: str) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _to_float(value: str) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


class Command(BaseCommand):
    help = "Aggregate telemetry log lines into a per-call-site LLM cost/usage report."

    def add_arguments(self, parser):
        parser.add_argument(
            "--since-hours", type=float, default=None,
            help="Only include calls from the last N hours (default: entire current log file).",
        )
        parser.add_argument(
            "--log-file", type=str, default=None,
            help="Override the log file path (default: settings.BASE_DIR/logs/mirabel.log).",
        )

    def handle(self, *args, since_hours: float | None, log_file: str | None, **options):
        path = Path(log_file) if log_file else settings.BASE_DIR / "logs" / "mirabel.log"
        if not path.exists():
            self.stderr.write(f"No log file at {path}")
            return

        cutoff = datetime.now() - timedelta(hours=since_hours) if since_hours else None
        by_site: dict[str, dict] = {}

        with path.open(encoding="utf-8", errors="ignore") as f:
            for line in f:
                match = _LINE_RE.search(line)
                if not match:
                    continue
                if cutoff is not None:
                    try:
                        ts = datetime.strptime(match["ts"], "%Y-%m-%d %H:%M:%S,%f")
                    except ValueError:
                        continue
                    if ts < cutoff:
                        continue

                key = f"{match['call_site']} ({match['provider']})"
                row = by_site.setdefault(
                    key,
                    {"calls": 0, "input": 0, "output": 0, "latency_sum": 0.0, "latency_n": 0,
                     "estimated": 0, "cache_read": 0, "cache_write": 0},
                )
                row["calls"] += 1
                row["input"] += _to_int(match["input"]) or 0
                row["output"] += _to_int(match["output"]) or 0
                row["cache_read"] += _to_int(match["cache_read"]) or 0
                row["cache_write"] += _to_int(match["cache_write"]) or 0
                latency = _to_float(match["latency"])
                if latency is not None:
                    row["latency_sum"] += latency
                    row["latency_n"] += 1
                if match["estimated"] == "True":
                    row["estimated"] += 1

        if not by_site:
            self.stdout.write("No telemetry lines found for the given window.")
            return

        header = (
            f"{'call_site (provider)':<38}{'calls':>7}{'input_tok':>12}{'output_tok':>12}"
            f"{'cache_rd':>10}{'cache_wr':>10}{'avg_ms':>10}{'est.':>6}"
        )
        self.stdout.write(header)
        self.stdout.write("-" * len(header))
        total_calls = total_input = total_output = total_cache_read = 0
        for key, row in sorted(by_site.items(), key=lambda kv: -kv[1]["input"] - kv[1]["output"]):
            avg_latency = row["latency_sum"] / row["latency_n"] if row["latency_n"] else 0.0
            self.stdout.write(
                f"{key:<38}{row['calls']:>7}{row['input']:>12}{row['output']:>12}"
                f"{row['cache_read']:>10}{row['cache_write']:>10}{avg_latency:>10.0f}{row['estimated']:>6}"
            )
            total_calls += row["calls"]
            total_input += row["input"]
            total_output += row["output"]
            total_cache_read += row["cache_read"]
        self.stdout.write("-" * len(header))
        self.stdout.write(f"{'TOTAL':<38}{total_calls:>7}{total_input:>12}{total_output:>12}")
        if total_cache_read:
            self.stdout.write(
                f"\n{total_cache_read} input tokens served from a provider-side prompt cache "
                "(Anthropic/OpenAI/Gemini/DeepSeek all report this; rate varies by provider)."
            )
