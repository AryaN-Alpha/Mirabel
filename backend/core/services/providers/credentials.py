import os

from core.models import ProviderCredential

ENV_VAR_NAMES = {
    "anthropic": "ANTHROPIC_API_KEY",
    "gemini": "GEMINI_API_KEY",
    "openai": "OPENAI_API_KEY",
    "deepseek": "DEEPSEEK_API_KEY",
}


def get_api_key(provider: str) -> str:
    """DB-stored key (set from the frontend) wins over the env var."""
    try:
        cred = ProviderCredential.objects.get(provider=provider)
    except ProviderCredential.DoesNotExist:
        cred = None
    if cred and cred.api_key:
        return cred.get_api_key()
    return os.environ.get(ENV_VAR_NAMES.get(provider, ""), "")
