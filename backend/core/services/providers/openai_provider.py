import openai
from tenacity import retry, stop_after_attempt, wait_exponential

from .base import Provider, ProviderError
from .credentials import get_api_key


class OpenAIProvider(Provider):
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
        api_key = get_api_key("openai")
        if not api_key:
            raise ProviderError("No OpenAI API key configured.")
        client = openai.OpenAI(api_key=api_key)
        try:
            response = client.responses.create(
                model=model,
                instructions=system,
                input=history,
                max_output_tokens=max_tokens,
                temperature=temperature,
            )
        except openai.APIError as exc:
            raise ProviderError(str(exc)) from exc
        return response.output_text

    def list_models(self) -> list[dict[str, str]]:
        api_key = get_api_key("openai")
        if not api_key:
            raise ProviderError("No OpenAI API key configured.")
        client = openai.OpenAI(api_key=api_key)
        try:
            return [{"id": m.id, "label": m.id} for m in client.models.list()]
        except openai.APIError as exc:
            raise ProviderError(str(exc)) from exc
