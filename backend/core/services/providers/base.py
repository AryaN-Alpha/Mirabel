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

    def list_models(self) -> list[dict[str, str]]:
        raise NotImplementedError
