"""Shared model-selection helper for short, deterministic, non-conversational
LLM calls (structuring, scoring, light rewriting, drafting) — as opposed to
the multi-turn chat/voice pipeline or the agent's own reasoning loop, which
pick their model differently and don't use this.

DeepSeek's default model for this provider is a reasoning-tier model that
spends a large, variable share of `max_tokens` on hidden chain-of-thought
before ever emitting the visible answer. For a short, deterministic task
(JSON structuring, a fit score, a two-paragraph draft) that reasoning buys
nothing and is the actual, live-verified cause of responses that either come
back empty (the hidden reasoning alone exceeds `max_tokens`) or cost several
times what the visible output would justify. Anthropic/OpenAI aren't
overridden here — this app never opts into their reasoning-tier behavior (no
`thinking`/`reasoning_effort` param is set in anthropic_provider.py /
openai_provider.py) — and Gemini already forces thinking_level=MINIMAL for
every call inside gemini_provider.py itself.

Originally two independent copies of this same dict/function lived in
agent/graph.py and cv/services/tailoring.py (found and consolidated here per
docs/EXTENDING.md's "never duplicate a classifier/heuristic" rule) — extend
this one, don't add a third.
"""

from core.models import ModelPreference

_FAST_MODEL_OVERRIDE = {"deepseek": "deepseek-chat"}


def fast_model_for(pref: ModelPreference) -> str:
    """The model string to actually call for a short, deterministic task —
    `pref.model` for every provider except DeepSeek, which is redirected to
    its real non-reasoning chat model regardless of what's configured."""
    return _FAST_MODEL_OVERRIDE.get(pref.provider, pref.model)
