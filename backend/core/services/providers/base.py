from typing import AsyncIterator


class ProviderError(Exception):
    """Raised when a provider cannot fulfil a text-generation request."""


class Provider:
    def generate_text(
        self,
        *,
        model: str,
        system: str,
        history: list[dict],
        max_tokens: int,
        temperature: float,
    ) -> str:
        raise NotImplementedError

    async def stream_text(
        self,
        *,
        model: str,
        system: str,
        history: list[dict],
        max_tokens: int,
        temperature: float,
    ) -> AsyncIterator[str]:
        """Yields text deltas. Used by the voice/WebSocket pipeline."""
        raise NotImplementedError
        yield ""  # unreachable — keeps this an async generator, not a coroutine

    def list_models(self) -> list[dict[str, str]]:
        raise NotImplementedError
