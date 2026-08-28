"""The centralized tool registry.

To add a future tool: write the function in the right domain module (or a
new module for a new domain) and append it to that module's TOOLS list. If
it's a new module, import it and add its TOOLS here. Nothing else in the
agent needs to change — agent/graph.py always binds ALL_TOOLS as-is.
"""

from agent.tools import (
    classroom_tools,
    conversation_tools,
    cv_tools,
    kanban_tools,
    linkedin_tools,
    memory_tools,
    outlook_tools,
)

ALL_TOOLS = (
    kanban_tools.TOOLS
    + cv_tools.TOOLS
    + linkedin_tools.TOOLS
    + outlook_tools.TOOLS
    + classroom_tools.TOOLS
    + memory_tools.TOOLS
    + conversation_tools.TOOLS
)
