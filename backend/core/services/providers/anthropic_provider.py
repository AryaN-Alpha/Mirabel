import asyncio
from typing import AsyncIterator

import anthropic
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

from .base import Provider, ProviderError
from .credentials import get_api_key

# Only retry errors that are actually transient. Auth/bad-request/not-found
# failures will never succeed on retry, so retrying them just adds latency.
_RETRYABLE = (anthropic.APIConnectionError, anthropic.APITimeoutError, anthropic.RateLimitError, anthropic.InternalServerError)


class AnthropicProvider(Provider):
    def generate_text(
        self,
        *,
        model: str,
        system: str,
        history: list[dict],
        max_tokens: int,
        temperature: float,
    ) -> str:
        api_key = get_api_key("anthropic")
        if not api_key:
            raise ProviderError("No Anthropic API key configured.")
        client = anthropic.Anthropic(api_key=api_key)
        try:
            response = self._create(
                client,
                model=model,
                system=system,
                messages=history,
                max_tokens=max_tokens,
                # Anthropic's temperature range is 0-1, unlike OpenAI/Gemini's 0-2.
                temperature=min(temperature, 1.0),
            )
        except anthropic.APIError as exc:
            raise ProviderError(str(exc)) from exc
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
    ) -> AsyncIterator[str]:
        api_key = await asyncio.to_thread(get_api_key, "anthropic")
        if not api_key:
            raise ProviderError("No Anthropic API key configured.")
        client = anthropic.AsyncAnthropic(api_key=api_key)
        try:
            async with client.messages.stream(
                model=model,
                system=system,
                messages=history,
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
