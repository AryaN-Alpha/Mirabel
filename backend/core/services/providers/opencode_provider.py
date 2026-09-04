from typing import AsyncIterator

from .base import Provider, ProviderError


class OpenCodeProvider(Provider):
    """Placeholder — not wired up yet. Kept so the provider is a known,
    selectable option in the API/frontend instead of silently missing."""

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
        raise ProviderError("OpenCode support isn't wired up yet — pick another provider for now.")

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
        raise ProviderError("OpenCode support isn't wired up yet — pick another provider for now.")
        yield ""  # unreachable — keeps this an async generator, not a coroutine

    def list_models(self) -> list[dict[str, str]]:
        raise ProviderError("OpenCode support isn't wired up yet — pick another provider for now.")
