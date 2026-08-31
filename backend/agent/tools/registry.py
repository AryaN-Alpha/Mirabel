"""The centralized tool registry.

To add a future tool: write the function in the right domain module (or a
new module for a new domain) and append it to that module's TOOLS list. If
it's a new module, import it and add its TOOLS here.

ALL_TOOLS is the full registry and the fail-open fallback — agent/tasks.py
binds a domain-routed subset by default (see agent/tools/routing.py) and
falls back to ALL_TOOLS whenever the instruction doesn't clearly resolve to
a small number of domains. A new domain module only needs to be added here;
wiring it into routing.py's keyword table is optional (an unrouted domain
just always falls open to the full set, same as before this existed).
"""

from agent.tools import (
    classroom_tools,
    conversation_tools,
    cv_tools,
    kanban_tools,
    linkedin_tools,
    memory_tools,
    outlook_tools,
    spotify_tools,
)

ALL_TOOLS = (
    kanban_tools.TOOLS
    + cv_tools.TOOLS
    + linkedin_tools.TOOLS
    + outlook_tools.TOOLS
    + classroom_tools.TOOLS
    + spotify_tools.TOOLS
    + memory_tools.TOOLS
    + conversation_tools.TOOLS
)
