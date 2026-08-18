"""Language detection service — facade for fastText + Whisper fallback."""
from __future__ import annotations

from .fasttext_provider import FastTextProvider
from .whisper_detect_provider import WhisperDetectProvider


class LanguageDetectionService:
    """
    Detects language from text or audio.

    Priority:
      1. fastText (text input, 1ms, 176 langs)
      2. Whisper auto-detect (audio input, 500ms, 99 langs)

    The service always returns a BCP-47 locale code.
    """

    def __init__(self):
        self.text_provider = FastTextProvider()
        self.audio_provider = WhisperDetectProvider()

    async def detect(self, text: str) -> str:
        """Detect language from text. Returns BCP-47 locale."""
        if not text or len(text.strip()) < 3:
            return "en"  # too short to detect

        try:
            locale, _ = await self.text_provider.detect(text)
            return locale
        except Exception as e:
            print(f"[LanguageDetectionService] fastText failed: {e}")
            return "en"

    async def detect_from_audio(self, audio_base64: str) -> str:
        """Detect language from audio. Returns BCP-47 locale."""
        try:
            locale, _ = await self.audio_provider.detect_from_audio(audio_base64)
            return locale
        except Exception as e:
            print(f"[LanguageDetectionService] Whisper detect failed: {e}")
            return "en"

    async def detect_with_confidence(self, text: str) -> tuple[str, float]:
        """Returns (locale, confidence 0-1)."""
        try:
            return await self.text_provider.detect(text)
        except Exception:
            return "en", 0.5
