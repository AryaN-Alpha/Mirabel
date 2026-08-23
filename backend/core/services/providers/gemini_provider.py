from google import genai
from google.genai import errors as genai_errors
from google.genai import types
from tenacity import retry, stop_after_attempt, wait_exponential

from .base import Provider, ProviderError
from .credentials import get_api_key

_ROLE_MAP = {"user": "user", "assistant": "model"}


def _to_contents(history: list[dict]) -> list[types.Content]:
    return [
        types.Content(role=_ROLE_MAP.get(m["role"], "user"), parts=[types.Part(text=m["content"])])
        for m in history
    ]


class GeminiProvider(Provider):
    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=8),
    )
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
            response = client.models.generate_content(
                model=model,
                contents=_to_contents(history),
                config=types.GenerateContentConfig(
                    system_instruction=system,
                    max_output_tokens=max_tokens,
                    temperature=temperature,
                ),
            )
        except genai_errors.APIError as exc:
            raise ProviderError(str(exc)) from exc
        return response.text

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
