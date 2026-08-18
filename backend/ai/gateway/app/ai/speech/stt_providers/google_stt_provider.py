"""Google Speech-to-Text provider."""
from __future__ import annotations

import base64
import os
import time

import httpx

from app.ai.base import BaseProvider
from app.ai.speech.models import STTRequest, STTResult


class GoogleSpeechProvider(BaseProvider):
    name = "google-stt"

    def __init__(self):
        self._api_key = os.getenv("GOOGLE_SPEECH_API_KEY", "")

    async def health(self) -> bool:
        return bool(self._api_key)

    @property
    def supported_languages(self) -> list[str]:
        # Google STT supports 125+ languages including all Indian languages
        return ["hi", "en", "bn", "te", "mr", "ta", "ur", "gu", "kn", "or", "ml",
                "pa", "as", "bho", "mai", "sat", "ks", "sd", "ne", "si",
                "sw", "ha", "yo", "ig", "am", "zu", "af", "fr", "pt", "es", "ar",
                "id", "vi", "th", "fil", "ms", "tr", "fa", "he", "ru", "uk",
                "zh", "ja", "ko"]

    async def transcribe(self, request: STTRequest) -> STTResult:
        if not self._api_key:
            raise RuntimeError("GOOGLE_SPEECH_API_KEY not set")
        t0 = time.monotonic()

        audio_bytes = base64.b64decode(request.audio_base64) if request.audio_base64 else None
        # Google STT v2 REST endpoint (simplified)
        endpoint = "https://speech.googleapis.com/v1/speech:recognize"
        payload = {
            "config": {
                "encoding": "WEBM_OPUS",
                "sampleRateHertz": 16000,
                "languageCode": request.language_hint or "hi",
                "enableAutomaticPunctuation": True,
            },
            "audio": {"content": base64.b64encode(audio_bytes).decode()},
        }
        async with httpx.AsyncClient(timeout=60) as c:
            r = await c.post(endpoint, params={"key": self._api_key}, json=payload)
            r.raise_for_status()
            data = r.json()

        results = data.get("results", [])
        transcript = " ".join(
            alt["transcript"]
            for r in results
            for alt in r.get("alternatives", [])
        )
        return STTResult(
            transcript=transcript,
            detected_language=request.language_hint or "hi",
            confidence=0.92,
            provider="google-stt",
            latency_ms=int((time.monotonic() - t0) * 1000),
        )
