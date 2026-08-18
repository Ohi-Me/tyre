"""Deepgram STT provider — best for streaming + low-latency."""
from __future__ import annotations

import base64
import os
import time

import httpx

from app.ai.base import BaseProvider
from app.ai.speech.models import STTRequest, STTResult


class DeepgramSTTProvider(BaseProvider):
    name = "deepgram"

    def __init__(self):
        self._api_key = os.getenv("DEEPGRAM_API_KEY", "")
        self._endpoint = "https://api.deepgram.com/v1/listen"

    async def health(self) -> bool:
        return bool(self._api_key)

    @property
    def supported_languages(self) -> list[str]:
        # Deepgram supports ~36 languages including major Indian languages
        return ["hi", "en", "bn", "te", "mr", "ta", "ur", "gu", "kn", "ml",
                "pa", "es", "fr", "pt", "de", "it", "ja", "ko", "zh", "ru", "ar", "tr"]

    async def transcribe(self, request: STTRequest) -> STTResult:
        if not self._api_key:
            raise RuntimeError("DEEPGRAM_API_KEY not set")
        t0 = time.monotonic()

        audio_bytes = base64.b64decode(request.audio_base64) if request.audio_base64 else None
        params = {
            "model": "nova-2",
            "language": request.language_hint or "hi",
            "smart_format": "true",
            "punctuate": "true",
            "diarize": str(request.enable_diarization).lower(),
        }
        async with httpx.AsyncClient(timeout=60) as c:
            r = await c.post(
                self._endpoint,
                headers={
                    "Authorization": f"Token {self._api_key}",
                    "Content-Type": "audio/webm",
                },
                params=params,
                content=audio_bytes,
            )
            r.raise_for_status()
            data = r.json()

        alt = data["results"]["channels"][0]["alternatives"][0]
        return STTResult(
            transcript=alt["transcript"],
            detected_language=request.language_hint or "hi",
            confidence=alt.get("confidence", 0.9),
            provider="deepgram",
            latency_ms=int((time.monotonic() - t0) * 1000),
        )
