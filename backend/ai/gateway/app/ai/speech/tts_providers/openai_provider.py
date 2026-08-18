"""OpenAI TTS provider."""
from __future__ import annotations

import base64
import os
import time

import httpx

from app.ai.base import BaseProvider
from app.ai.speech.models import TTSRequest, TTSResult


class OpenAITTSProvider(BaseProvider):
    name = "openai-tts"

    def __init__(self):
        self._api_key = os.getenv("OPENAI_API_KEY", "")

    async def health(self) -> bool:
        return bool(self._api_key)

    @property
    def supported_languages(self) -> list[str]:
        # OpenAI TTS supports 50+ languages including major Indian languages
        return ["hi", "en", "bn", "te", "mr", "ta", "ur", "gu", "kn", "or", "ml",
                "pa", "as", "ne", "sw", "ha", "fr", "pt", "es", "ar", "id", "vi",
                "th", "fil", "tr", "zh", "ja", "ko", "ru", "de"]

    async def synthesize(self, request: TTSRequest) -> TTSResult:
        if not self._api_key:
            raise RuntimeError("OPENAI_API_KEY not set")
        t0 = time.monotonic()

        # OpenAI TTS doesn't take language directly — voices are multilingual
        voice = request.voice_id or "alloy"
        async with httpx.AsyncClient(timeout=30) as c:
            r = await c.post(
                "https://api.openai.com/v1/audio/speech",
                headers={"Authorization": f"Bearer {self._api_key}"},
                json={
                    "model": "tts-1",
                    "input": request.text,
                    "voice": voice,
                    "response_format": request.format,
                    "speed": request.speed,
                },
            )
            r.raise_for_status()
            audio_bytes = r.content

        return TTSResult(
            audio_base64=base64.b64encode(audio_bytes).decode(),
            format=request.format,
            provider="openai-tts",
            voice_id=voice,
            latency_ms=int((time.monotonic() - t0) * 1000),
        )
