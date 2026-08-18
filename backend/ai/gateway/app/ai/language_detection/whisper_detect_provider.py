"""Whisper language detection — used as fallback when fastText unavailable."""
from __future__ import annotations

import base64
import io

from app.ai.base import BaseProvider


class WhisperDetectProvider(BaseProvider):
    """
    Uses Whisper's auto-detect capability.
    Slower than fastText but works without a separate model file.
    """

    name = "whisper-detect"

    async def health(self) -> bool:
        return True  # always available via Groq

    @property
    def supported_languages(self) -> list[str]:
        return ["hi", "en", "bn", "te", "mr", "ta", "ur", "gu", "kn", "ml", "pa",
                "as", "or", "ne", "si", "sw", "ha", "yo", "ig", "am", "zu", "af",
                "fr", "pt", "es", "ar", "id", "vi", "th", "fil", "ms", "tr", "fa",
                "he", "ru", "uk", "zh", "ja", "ko"]

    async def detect_from_audio(self, audio_base64: str) -> tuple[str, float]:
        """Detect language from audio (uses Whisper's built-in detection)."""
        from groq import AsyncGroq

        from app.config import settings

        client = AsyncGroq(api_key=settings.groq_api_key)
        audio_bytes = base64.b64decode(audio_base64)

        transcription = await client.audio.transcriptions.create(
            model="whisper-large-v3",
            file=("audio.webm", io.BytesIO(audio_bytes), "audio/webm"),
            response_format="verbose_json",
        )
        # Whisper returns detected language
        detected = getattr(transcription, "language", "en")
        confidence = 0.95  # Whisper doesn't return confidence; assume high
        return detected, confidence

    async def detect(self, text: str) -> tuple[str, float]:
        """Whisper doesn't do text-based detection — fall back to English."""
        return "en", 0.5
