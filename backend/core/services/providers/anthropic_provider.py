import asyncio
import time
from typing import AsyncIterator

import anthropic
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

from core.services.telemetry import log_llm_call

from .base import Provider, ProviderError
from .credentials import get_api_key

# Only retry errors that are actually transient. Auth/bad-request/not-found
# failures will never succeed on retry, so retrying them just adds latency.
_RETRYABLE = (anthropic.APIConnectionError, anthropic.APITimeoutError, anthropic.RateLimitError, anthropic.InternalServerError)


def _cacheable_system(system: str, system_suffix: str = "") -> list[dict]:
    """Marks the static system prompt as its own cache breakpoint,
    separate from `system_suffix` (e.g. a per-request RAG memory block).
    This split matters: concatenating a per-request-varying suffix into the
    same cached block as the static prompt (as an earlier version of this
    function did) makes the whole block byte-different on every request
    with different retrieved memories, which misses the cache almost every
    time — defeating the point. Keeping them as two blocks means the first
    (static) block still hits cache even when the second (dynamic) one
    changes. Below Anthropic's per-breakpoint minimum token count (~1024
    for this model tier) caching a block is a harmless no-op."""
    blocks = [{"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}]
    if system_suffix:
        blocks.append({"type": "text", "text": system_suffix})
    return blocks


def _with_cache_breakpoint(history: list[dict]) -> list[dict]:
    """Marks the second-to-last message as a cache breakpoint. Anthropic
    reuses everything up to and including a matching prefix from the
    previous call, so a growing multi-turn conversation only pays full
    price for the newest turn each time, not the whole resent history.
    Never mutates the caller's history list/dicts."""
    if len(history) < 2:
        return history
    idx = len(history) - 2
    marked = list(history)
    original = marked[idx]
    content = original["content"]
    blocks = content if isinstance(content, list) else [{"type": "text", "text": content}]
    # Only the last block is ever replaced (with a fresh dict via the spread
    # below) — a shallow list copy is enough to protect the caller's list
    # from mutation; deep-copying every other block was wasted allocation.
    blocks = list(blocks)
    blocks[-1] = {**blocks[-1], "cache_control": {"type": "ephemeral"}}
    marked[idx] = {**original, "content": blocks}
    return marked


class AnthropicProvider(Provider):
    def generate_text(
        self,
        *,
        model: str,
        system: str,
        history: list[dict],
        max_tokens: int,
        temperature: float,
        call_site: str = "",
        system_suffix: str = "",
    ) -> str:
        api_key = get_api_key("anthropic")
        if not api_key:
            raise ProviderError("No Anthropic API key configured.")
        client = anthropic.Anthropic(api_key=api_key)
        started = time.perf_counter()
        try:
            response = self._create(
                client,
                model=model,
                system=_cacheable_system(system, system_suffix),
                messages=_with_cache_breakpoint(history),
                max_tokens=max_tokens,
                # Anthropic's temperature range is 0-1, unlike OpenAI/Gemini's 0-2.
                temperature=min(temperature, 1.0),
            )
        except anthropic.APIError as exc:
            log_llm_call(
                provider="anthropic",
                model=model,
                call_site=call_site,
                latency_ms=(time.perf_counter() - started) * 1000,
                error=True,
            )
            raise ProviderError(str(exc)) from exc
        log_llm_call(
            provider="anthropic",
            model=model,
            call_site=call_site,
            input_tokens=response.usage.input_tokens,
            output_tokens=response.usage.output_tokens,
            latency_ms=(time.perf_counter() - started) * 1000,
            cache_read_tokens=response.usage.cache_read_input_tokens,
            cache_write_tokens=response.usage.cache_creation_input_tokens,
        )
        return response.content[0].text

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=8),
        retry=retry_if_exception_type(_RETRYABLE),
        reraise=True,
    )
    def _create(self, client: anthropic.Anthropic, **kwargs):
        return client.messages.create(**kwargs)

    async def stream_text(
        self,
        *,
        model: str,
        system: str,
        history: list[dict],
        max_tokens: int,
        temperature: float,
        system_suffix: str = "",
    ) -> AsyncIterator[str]:
        api_key = await asyncio.to_thread(get_api_key, "anthropic")
        if not api_key:
            raise ProviderError("No Anthropic API key configured.")
        client = anthropic.AsyncAnthropic(api_key=api_key)
        try:
            async with client.messages.stream(
                model=model,
                system=_cacheable_system(system, system_suffix),
                messages=_with_cache_breakpoint(history),
                max_tokens=max_tokens,
                temperature=min(temperature, 1.0),
            ) as stream:
                async for delta in stream.text_stream:
                    yield delta
        except anthropic.APIError as exc:
            raise ProviderError(str(exc)) from exc

    def list_models(self) -> list[dict[str, str]]:
        api_key = get_api_key("anthropic")
        if not api_key:
            raise ProviderError("No Anthropic API key configured.")
        client = anthropic.Anthropic(api_key=api_key)
        try:
            return [{"id": m.id, "label": m.display_name} for m in client.models.list()]
        except anthropic.APIError as exc:
            raise ProviderError(str(exc)) from exc
