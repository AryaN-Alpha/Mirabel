"""Runs the eval suites for the memory/agent gating pipeline. Styled on
llm_cost_report.py's conventions (argparse via add_arguments, plain
self.stdout.write tabular-ish output).

Usage:
    python manage.py run_evals
    python manage.py run_evals --suite rag
    python manage.py run_evals --suite rag,supersession
    python manage.py run_evals --suite all
"""

from __future__ import annotations

from django.core.management.base import BaseCommand, CommandError

from core.evals.runner import ALL_SUITE_NAMES, FREE_SUITE_NAMES, run_suites


class Command(BaseCommand):
    help = "Run deterministic (gating, routing) and infra/cost-bearing (rag, supersession) eval suites."

    def add_arguments(self, parser):
        parser.add_argument(
            "--suite",
            type=str,
            default=None,
            help=(
                "Comma-separated suite names (gating,routing,rag,supersession) or 'all'. "
                "Default: gating,routing (free, no external dependency)."
            ),
        )

    def handle(self, *args, suite: str | None, **options):
        if suite is None:
            names = list(FREE_SUITE_NAMES)
            self.stdout.write(
                "No --suite given, running the free suites only (gating, routing). "
                "Pass --suite rag / --suite supersession / --suite all to include the "
                "suites that need live Chroma/an Anthropic key (and, for supersession, spend real tokens).\n"
            )
        elif suite == "all":
            names = list(ALL_SUITE_NAMES)
        else:
            names = [s.strip() for s in suite.split(",") if s.strip()]
            for name in names:
                if name not in ALL_SUITE_NAMES:
                    raise CommandError(f"unknown suite {name!r} — choices: {', '.join(ALL_SUITE_NAMES)}, all")

        results = run_suites(names)

        for result in results:
            self.stdout.write(f"\n=== {result.suite} ===")
            if result.skipped_reason:
                self.stdout.write(f"SKIPPED: {result.skipped_reason}")
                continue
            if result.note:
                self.stdout.write(f"({result.note})")
            self.stdout.write(f"{result.correct}/{result.total} correct ({(result.accuracy or 0.0):.0%})")
            for m in result.mismatches:
                self.stdout.write(f"  MISMATCH input={m.input!r} expected={m.expected!r} actual={m.actual!r}")
