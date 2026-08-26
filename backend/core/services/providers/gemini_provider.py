import asyncio
from typing import AsyncIterator

from google import genai
from google.genai import errors as genai_errors
from google.genai import types
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

from .base import Provider, ProviderError
from .credentials import get_api_key

_ROLE_MAP = {"user": "user", "assistant": "model"}

# Only retry errors that are actually transient (5xx). ClientError (4xx —
# bad key, bad request) will never succeed on retry, so retrying it just
# adds latency.
_RETRYABLE = (genai_errors.ServerError,)


def _to_contents(history: list[dict]) -> list[types.Content]:
    return [
        types.Content(role=_ROLE_MAP.get(m["role"], "user"), parts=[types.Part(text=m["content"])])
        for m in history
    ]


class GeminiProvider(Provider):
    def generate_text(
        self,
        *,
        model: str,
        system: str,
        history: list[dict],
        max_tokens: int,
        temperature: float,
    ) -> str:
        api_key = get_api_key("gemini")
        if not api_key:
            raise ProviderError("No Gemini API key configured.")
        client = genai.Client(api_key=api_key)
        try:
            response = self._generate(
                client,
                model=model,
                contents=_to_contents(history),
                config=types.GenerateContentConfig(
                    system_instruction=system,
                    max_output_tokens=max_tokens,
                    temperature=temperature,
                    thinking_config=types.ThinkingConfig(thinking_level=types.ThinkingLevel.MINIMAL),
                ),
            )
        except genai_errors.APIError as exc:
            raise ProviderError(str(exc)) from exc
        return response.text

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=8),
        retry=retry_if_exception_type(_RETRYABLE),
        reraise=True,
    )
    def _generate(self, client: genai.Client, **kwargs):
        return client.models.generate_content(**kwargs)

    async def stream_text(
        self,
        *,
        model: str,
        system: str,
        history: list[dict],
        max_tokens: int,
        temperature: float,
    ) -> AsyncIterator[str]:
        api_key = await asyncio.to_thread(get_api_key, "gemini")
        if not api_key:
            raise ProviderError("No Gemini API key configured.")
        client = genai.Client(api_key=api_key)
        try:
            stream = await client.aio.models.generate_content_stream(
                model=model,
                contents=_to_contents(history),
                config=types.GenerateContentConfig(
                    system_instruction=system,
                    max_output_tokens=max_tokens,
                    temperature=temperature,
                    thinking_config=types.ThinkingConfig(thinking_level=types.ThinkingLevel.MINIMAL),
                ),
            )
            async for chunk in stream:
                if chunk.text:
                    yield chunk.text
        except genai_errors.APIError as exc:
            raise ProviderError(str(exc)) from exc

    def list_models(self) -> list[dict[str, str]]:
        api_key = get_api_key("gemini")
        if not api_key:
            raise ProviderError("No Gemini API key configured.")
        client = genai.Client(api_key=api_key)
        try:
            models = []
            for m in client.models.list():
                model_id = (m.name or "").removeprefix("models/")
                models.append({"id": model_id, "label": m.display_name or model_id})
            return models
        except genai_errors.APIError as exc:
            raise ProviderError(str(exc)) from exc
