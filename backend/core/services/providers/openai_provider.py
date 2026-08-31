import asyncio
import time
from typing import AsyncIterator

import openai
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

from core.services.telemetry import log_llm_call

from .base import Provider, ProviderError
from .credentials import get_api_key

# Only retry errors that are actually transient. Auth/bad-request/not-found
# failures will never succeed on retry, so retrying them just adds latency.
_RETRYABLE = (openai.APIConnectionError, openai.APITimeoutError, openai.RateLimitError, openai.InternalServerError)


def _with_system_suffix(history: list[dict], system_suffix: str) -> list[dict]:
    """OpenAI's prompt caching is fully automatic (no cache_control API) —
    it matches the longest common prefix of the *entire* request across
    calls. `instructions` (system) must therefore stay byte-identical
    whenever the static prompt hasn't changed; a per-request-varying
    suffix (e.g. a RAG memory block) concatenated into `instructions` would
    make that whole field different on every call with different retrieved
    memories. Instead it's inserted as a leading `developer`-role input
    item, ahead of the actual conversation — `instructions` stays pure and
    cache-eligible, and the dynamic content still reaches the model."""
    if not system_suffix:
        return history
    return [{"role": "developer", "content": system_suffix}, *history]


class OpenAIProvider(Provider):
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
        api_key = get_api_key("openai")
        if not api_key:
            raise ProviderError("No OpenAI API key configured.")
        client = openai.OpenAI(api_key=api_key)
        started = time.perf_counter()
        try:
            response = self._create(
                client,
                model=model,
                instructions=system,
                input=_with_system_suffix(history, system_suffix),
                max_output_tokens=max_tokens,
                temperature=temperature,
            )
        except openai.APIError as exc:
            log_llm_call(
                provider="openai",
                model=model,
                call_site=call_site,
                latency_ms=(time.perf_counter() - started) * 1000,
                error=True,
            )
            raise ProviderError(str(exc)) from exc
        usage = getattr(response, "usage", None)
        cache_details = getattr(usage, "input_tokens_details", None)
        log_llm_call(
            provider="openai",
            model=model,
            call_site=call_site,
            input_tokens=getattr(usage, "input_tokens", None),
            output_tokens=getattr(usage, "output_tokens", None),
            latency_ms=(time.perf_counter() - started) * 1000,
            # OpenAI's prompt caching is fully automatic (no code enables
            # it) — this is the API reporting how much of THIS request's
            # input actually hit the cache, not an estimate.
            cache_read_tokens=getattr(cache_details, "cached_tokens", None),
            cache_write_tokens=getattr(cache_details, "cache_write_tokens", None),
        )
        return response.output_text

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=8),
        retry=retry_if_exception_type(_RETRYABLE),
        reraise=True,
    )
    def _create(self, client: openai.OpenAI, **kwargs):
        return client.responses.create(**kwargs)

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
        api_key = await asyncio.to_thread(get_api_key, "openai")
        if not api_key:
            raise ProviderError("No OpenAI API key configured.")
        client = openai.AsyncOpenAI(api_key=api_key)
        try:
            async with client.responses.stream(
                model=model,
                instructions=system,
                input=_with_system_suffix(history, system_suffix),
                max_output_tokens=max_tokens,
                temperature=temperature,
            ) as stream:
                async for event in stream:
                    if event.type == "response.output_text.delta":
                        yield event.delta
        except openai.APIError as exc:
            raise ProviderError(str(exc)) from exc

    def list_models(self) -> list[dict[str, str]]:
        api_key = get_api_key("openai")
        if not api_key:
            raise ProviderError("No OpenAI API key configured.")
        client = openai.OpenAI(api_key=api_key)
        try:
            return [{"id": m.id, "label": m.id} for m in client.models.list()]
        except openai.APIError as exc:
            raise ProviderError(str(exc)) from exc
