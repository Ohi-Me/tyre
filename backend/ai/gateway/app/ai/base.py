"""Provider base class — all AI service providers implement this."""
from __future__ import annotations

from abc import ABC, abstractmethod


class BaseProvider(ABC):
    """Base for all AI service providers (STT, TTS, MT, etc.)."""

    name: str = "base"
    supports_streaming: bool = False

    @abstractmethod
    async def health(self) -> bool:
        """Quick health check — returns True if provider is reachable."""
        ...

    @property
    @abstractmethod
    def supported_languages(self) -> list[str]:
        """List of BCP-47 locale codes this provider supports."""
        ...

    def supports(self, locale: str) -> bool:
        """Check if this provider supports a given locale."""
        return locale in self.supported_languages or locale.split("-")[0] in [
            l.split("-")[0] for l in self.supported_languages
        ]
