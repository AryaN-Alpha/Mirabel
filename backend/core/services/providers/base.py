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
        call_site: str = "",
        system_suffix: str = "",
    ) -> str:
        """`system` must stay byte-identical across calls whenever the
        caller's static instructions haven't changed — every provider's
        prompt-caching mechanism (explicit or automatic) keys off exact
        prefix matches, so concatenating per-request dynamic content (e.g.
        a RAG memory block) into `system` defeats caching on every call
        where that content differs. Pass dynamic content via
        `system_suffix` instead — providers place it so it never breaks the
        static prefix's cache eligibility (see each provider's docstring)."""
        raise NotImplementedError

    async def stream_text(
        self,
        *,
        model: str,
        system: str,
        history: list[dict],
        max_tokens: int,
        temperature: float,
        system_suffix: str = "",
    ) -> AsyncIterator[str]:
        """Yields text deltas. Used by the voice/WebSocket pipeline. See
        generate_text's docstring re: system vs system_suffix."""
        raise NotImplementedError
        yield ""  # unreachable — keeps this an async generator, not a coroutine

    def list_models(self) -> list[dict[str, str]]:
        raise NotImplementedError
