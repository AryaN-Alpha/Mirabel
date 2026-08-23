from .anthropic_provider import AnthropicProvider
from .base import Provider, ProviderError
from .credentials import ENV_VAR_NAMES as ENV_VAR_NAMES
from .gemini_provider import GeminiProvider
from .opencode_provider import OpenCodeProvider
from .openai_provider import OpenAIProvider

AVAILABLE_MODELS: dict[str, list[dict[str, str]]] = {
    "anthropic": [
        {"id": "claude-opus-5", "label": "Claude Opus 5 — most capable"},
        {"id": "claude-sonnet-5", "label": "Claude Sonnet 5 — balanced (default)"},
        {"id": "claude-haiku-4-5", "label": "Claude Haiku 4.5 — fastest"},
    ],
    "gemini": [
        {"id": "gemini-3.1-pro-preview", "label": "Gemini 3.1 Pro Preview — most capable"},
        {"id": "gemini-3.6-flash", "label": "Gemini 3.6 Flash — balanced (default)"},
        {"id": "gemini-3.5-flash-lite", "label": "Gemini 3.5 Flash Lite — fastest"},
    ],
    "openai": [
        {"id": "gpt-5.6-sol", "label": "GPT-5.6 Sol — most capable"},
        {"id": "gpt-5.6-terra", "label": "GPT-5.6 Terra — balanced (default)"},
        {"id": "gpt-5.6-luna", "label": "GPT-5.6 Luna — fastest"},
    ],
    # Not wired up yet — kept in the registry so the frontend can show it as
    # "coming soon" instead of not knowing it exists.
    "opencode": [],
}

_PROVIDERS: dict[str, Provider] = {
    "anthropic": AnthropicProvider(),
    "gemini": GeminiProvider(),
    "openai": OpenAIProvider(),
    "opencode": OpenCodeProvider(),
}


def get_provider(name: str) -> Provider:
    try:
        return _PROVIDERS[name]
    except KeyError:
        raise ProviderError(f"Unknown provider: {name!r}") from None
