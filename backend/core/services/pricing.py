"""Cost calculation for the Stats dashboard, backed entirely by
user-supplied core.models.PricingConfig rows (see that model's docstring
for why nothing here guesses a price). A provider/model with no configured
row costs None, not 0 — callers must render "Cost unavailable", never treat
a missing price as free.

Cache-token accounting differs by provider and matters for correctness
(never double-count a cached token):
- Anthropic reports cache_read_input_tokens/cache_creation_input_tokens as
  ADDITIONAL to usage.input_tokens, not a subset of it (see
  core/services/providers/anthropic_provider.py) — the full input_tokens
  figure is billed at the input rate, then cache tokens billed separately.
- OpenAI/Gemini/DeepSeek report their cache-read figure as a SUBSET of the
  total input_tokens they return (see each provider's log_llm_call call and
  docstring) — the cached portion must be subtracted out of input_tokens
  before billing it at the input rate, or it gets billed twice: once as
  ordinary input, once as a cache read.
"""

from __future__ import annotations

from core.models import PricingConfig

PricingMap = dict[tuple[str, str], PricingConfig]


def get_pricing_map() -> PricingMap:
    return {(p.provider, p.model): p for p in PricingConfig.objects.all()}


def _cost(tokens: int | None, price_per_1m: float | None) -> float:
    if not tokens or price_per_1m is None:
        return 0.0
    return (tokens / 1_000_000) * price_per_1m


def compute_cost(
    *,
    provider: str,
    model: str,
    input_tokens: int | None,
    output_tokens: int | None,
    cache_read_tokens: int | None,
    cache_write_tokens: int | None,
    pricing_map: PricingMap | None = None,
) -> dict[str, float] | None:
    """Returns {"input", "output", "cache_read", "cache_write", "total"} in
    USD, or None if no PricingConfig row exists for (provider, model)."""
    pricing_map = pricing_map if pricing_map is not None else get_pricing_map()
    cfg = pricing_map.get((provider, model))
    if cfg is None:
        return None

    input_tokens = input_tokens or 0
    cache_read_tokens = cache_read_tokens or 0

    if provider == "anthropic":
        uncached_input = input_tokens
    else:
        uncached_input = max(0, input_tokens - cache_read_tokens)

    input_cost = _cost(uncached_input, cfg.input_price_per_1m)
    output_cost = _cost(output_tokens, cfg.output_price_per_1m)
    cache_read_cost = _cost(cache_read_tokens, cfg.cache_read_price_per_1m)
    cache_write_cost = _cost(cache_write_tokens, cfg.cache_write_price_per_1m)

    return {
        "input": input_cost,
        "output": output_cost,
        "cache_read": cache_read_cost,
        "cache_write": cache_write_cost,
        "total": input_cost + output_cost + cache_read_cost + cache_write_cost,
    }


def uncached_input_tokens(*, provider: str, input_tokens: int | None, cache_read_tokens: int | None) -> int:
    """The portion of input_tokens that was NOT served from cache — used
    for "cached vs uncached input tokens" displays. Same per-provider
    accounting split as compute_cost (see module docstring)."""
    input_tokens = input_tokens or 0
    cache_read_tokens = cache_read_tokens or 0
    if provider == "anthropic":
        return input_tokens
    return max(0, input_tokens - cache_read_tokens)
