import anthropic
from tenacity import retry, stop_after_attempt, wait_exponential

from .base import Provider, ProviderError
from .credentials import get_api_key


class AnthropicProvider(Provider):
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
        api_key = get_api_key("anthropic")
        if not api_key:
            raise ProviderError("No Anthropic API key configured.")
        client = anthropic.Anthropic(api_key=api_key)
        try:
            response = client.messages.create(
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

    def list_models(self) -> list[dict[str, str]]:
        api_key = get_api_key("anthropic")
        if not api_key:
            raise ProviderError("No Anthropic API key configured.")
        client = anthropic.Anthropic(api_key=api_key)
        try:
            return [{"id": m.id, "label": m.display_name} for m in client.models.list()]
        except anthropic.APIError as exc:
            raise ProviderError(str(exc)) from exc
