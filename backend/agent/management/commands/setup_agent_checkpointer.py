"""One-time-per-environment setup for the agent's LangGraph checkpointer
tables (run alongside `migrate` — it's a separate step because these tables
are owned by langgraph-checkpoint-postgres, not a Django migration).

Usage: python manage.py setup_agent_checkpointer
"""

from django.core.management.base import BaseCommand
from langgraph.checkpoint.postgres import PostgresSaver

from agent.graph import connection_string


class Command(BaseCommand):
    help = "Creates the Postgres tables the agent's LangGraph checkpointer needs. Idempotent."

    def handle(self, *args, **options):
        with PostgresSaver.from_conn_string(connection_string()) as saver:
            saver.setup()
        self.stdout.write(self.style.SUCCESS("Agent checkpointer tables are set up."))
