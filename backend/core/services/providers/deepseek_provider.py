import asyncio
import time
from typing import AsyncIterator

import openai
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

from core.services.telemetry import log_llm_call, log_output_truncated

from .base import Provider, ProviderError
from .credentials import get_api_key

# DeepSeek exposes an OpenAI-compatible REST API at a different base URL.
# We use the openai SDK's base_url override so we get retries, connection
# pooling, and streaming for free without any extra dependency.
# Exported (no leading underscore) so agent/graph.py's LangChain-based
# ChatOpenAI wiring can reuse this instead of repeating the literal — the two
# used to drift apart into two separately-hardcoded copies of the same URL.
DEEPSEEK_BASE_URL = "https://api.deepseek.com/v1"

# DeepSeek uses the classic chat/completions endpoint (not the newer OpenAI
# Responses API), so retryable errors come from the same openai error hierarchy.
_RETRYABLE = (openai.APIConnectionError, openai.APITimeoutError, openai.RateLimitError, openai.InternalServerError)

# deepseek-reasoner spends chain-of-thought tokens out of the SAME max_tokens
# budget as its visible answer (reasoning_content + content share one cap,
# unlike Anthropic's separate thinking budget) — with ModelPreference's
# default of 400, the reasoning phase alone can exhaust max_tokens and leave
# nothing for the actual answer. This floor only applies when the reasoner
# model is explicitly selected; deepseek-chat (used everywhere else via
# fast_model_for) is unaffected.
_REASONER_MIN_MAX_TOKENS = 2000


def _effective_max_tokens(model: str, max_tokens: int) -> int:
    if "reasoner" in model.lower():
        return max(max_tokens, _REASONER_MIN_MAX_TOKENS)
    return max_tokens


def _build_messages(system: str, system_suffix: str, history: list[dict]) -> list[dict]:
    """DeepSeek's context caching (disk-based, fully automatic — no code
    enables it) matches the longest common token prefix across calls, same
    caveat as OpenAI/Gemini's automatic caching: the leading system message
    must stay byte-identical whenever the static prompt hasn't changed, so
    a per-request-varying suffix (e.g. a RAG memory block) goes in its own
    message right after system rather than folded into it."""
    messages = [{"role": "system", "content": system}]
    if system_suffix:
        messages.append({"role": "system", "content": system_suffix})
    messages.extend(history)
    return messages


class DeepSeekProvider(Provider):
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
        api_key = get_api_key("deepseek")
        if not api_key:
            raise ProviderError("No DeepSeek API key configured.")
        client = openai.OpenAI(api_key=api_key, base_url=DEEPSEEK_BASE_URL)
        messages = _build_messages(system, system_suffix, history)
        started = time.perf_counter()
        try:
            response = self._create(
                client,
                model=model,
                messages=messages,
                max_tokens=_effective_max_tokens(model, max_tokens),
                temperature=temperature,
            )
        except openai.APIError as exc:
            log_llm_call(
                provider="deepseek",
                model=model,
                call_site=call_site,
                latency_ms=(time.perf_counter() - started) * 1000,
                error=True,
            )
            raise ProviderError(str(exc)) from exc
        usage = getattr(response, "usage", None)
        log_llm_call(
            provider="deepseek",
            model=model,
            call_site=call_site,
            input_tokens=getattr(usage, "prompt_tokens", None),
            output_tokens=getattr(usage, "completion_tokens", None),
            latency_ms=(time.perf_counter() - started) * 1000,
            # DeepSeek's context caching is automatic and disk-based — no
            # code enables it. `prompt_cache_hit_tokens`/`_miss_tokens` are
            # DeepSeek's documented extensions to the OpenAI-compatible
            # usage object (the openai SDK's response models allow unknown
            # extra fields, confirmed via CompletionUsage.model_config).
            # Live-verified against this app's real DeepSeek traffic: a
            # follow-up call reusing the same persona prompt reported
            # cache_read_tokens=640 of input_tokens=676 (~95% hit) — these
            # are genuinely the right field names, not a guess. getattr
            # still degrades to None (never a fake 0) if a future response
            # ever lacks the field.
            cache_read_tokens=getattr(usage, "prompt_cache_hit_tokens", None),
            cache_write_tokens=getattr(usage, "prompt_cache_miss_tokens", None),
        )
        if response.choices[0].finish_reason == "length":
            log_output_truncated(provider="deepseek", model=model, call_site=call_site, max_tokens=max_tokens)
        return response.choices[0].message.content

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=8),
        retry=retry_if_exception_type(_RETRYABLE),
        reraise=True,
    )
    def _create(self, client: openai.OpenAI, **kwargs):
        return client.chat.completions.create(**kwargs)

    async def stream_text(
        self,
        *,
        model: str,
        system: str,
        history: list[dict],
        max_tokens: int,
        temperature: float,
        call_site: str = "",
        system_suffix: str = "",
    ) -> AsyncIterator[str]:
        api_key = await asyncio.to_thread(get_api_key, "deepseek")
        if not api_key:
            raise ProviderError("No DeepSeek API key configured.")
        messages = _build_messages(system, system_suffix, history)
        # `async with` closes the client's underlying httpx.AsyncClient (and
        # its connection pool) when the stream ends — a bare `AsyncOpenAI(...)`
        # with no explicit close() left one dangling per turn over a long
        # voice session.
        try:
            async with openai.AsyncOpenAI(api_key=api_key, base_url=DEEPSEEK_BASE_URL) as client:
                stream = await client.chat.completions.create(
                    model=model,
                    messages=messages,
                    max_tokens=_effective_max_tokens(model, max_tokens),
                    temperature=temperature,
                    stream=True,
                )
                finish_reason = None
                async for chunk in stream:
                    if not chunk.choices:
                        continue
                    delta = chunk.choices[0].delta.content
                    if delta:
                        yield delta
                    # Only the final chunk for a choice carries a non-None
                    # finish_reason — every delta chunk before it has None here.
                    finish_reason = chunk.choices[0].finish_reason or finish_reason
                if finish_reason == "length":
                    log_output_truncated(provider="deepseek", model=model, call_site=call_site, max_tokens=max_tokens)
        except openai.APIError as exc:
            raise ProviderError(str(exc)) from exc

    def list_models(self) -> list[dict[str, str]]:
        api_key = get_api_key("deepseek")
        if not api_key:
            raise ProviderError("No DeepSeek API key configured.")
        client = openai.OpenAI(api_key=api_key, base_url=DEEPSEEK_BASE_URL)
        try:
            return [{"id": m.id, "label": m.id} for m in client.models.list()]
        except openai.APIError as exc:
            raise ProviderError(str(exc)) from exc
