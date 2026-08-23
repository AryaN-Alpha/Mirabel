import asyncio
from typing import AsyncIterator

import openai
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

from .base import Provider, ProviderError
from .credentials import get_api_key

# Only retry errors that are actually transient. Auth/bad-request/not-found
# failures will never succeed on retry, so retrying them just adds latency.
_RETRYABLE = (openai.APIConnectionError, openai.APITimeoutError, openai.RateLimitError, openai.InternalServerError)


class OpenAIProvider(Provider):
    def generate_text(
        self,
        *,
        model: str,
        system: str,
        history: list[dict],
        max_tokens: int,
        temperature: float,
    ) -> str:
        api_key = get_api_key("openai")
        if not api_key:
            raise ProviderError("No OpenAI API key configured.")
        client = openai.OpenAI(api_key=api_key)
        try:
            response = self._create(
                client,
                model=model,
                instructions=system,
                input=history,
                max_output_tokens=max_tokens,
                temperature=temperature,
            )
        except openai.APIError as exc:
            raise ProviderError(str(exc)) from exc
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
    ) -> AsyncIterator[str]:
        api_key = await asyncio.to_thread(get_api_key, "openai")
        if not api_key:
            raise ProviderError("No OpenAI API key configured.")
        client = openai.AsyncOpenAI(api_key=api_key)
        try:
            async with client.responses.stream(
                model=model,
                instructions=system,
                input=history,
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
