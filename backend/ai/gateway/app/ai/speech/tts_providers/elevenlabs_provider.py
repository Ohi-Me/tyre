"""ElevenLabs TTS provider — best quality multilingual voice cloning."""
from __future__ import annotations

import base64
import os
import time

import httpx

from app.ai.base import BaseProvider
from app.ai.speech.models import TTSRequest, TTSResult

# Voice IDs per language (replace with real IDs from ElevenLabs dashboard).
# These are multilingual voices that support 32 languages.
_VOICE_MAP = {
    "hi": "pNInz6obpgDQGcFmaJgB",   # Adam — Hindi-capable
    "en": "21m00Tcm4TlvDq8ikWAM",   # Rachel
    "bn": "EXAVITQu4vr4xnSDxMaL",   # Bella — multilingual
    "te": "AZnzlk1XvdvUeBnXmlld",   # Domi
    "mr": "AZnzlk1XvdvUeBnXmlld",
    "ta": "EXAVITQu4vr4xnSDxMaL",
    "ur": "AZnzlk1XvdvUeBnXmlld",
    "gu": "AZnzlk1XvdvUeBnXmlld",
    "kn": "EXAVITQu4vr4xnSDxMaL",
    "ml": "EXAVITQu4vr4xnSDxMaL",
    "pa": "AZnzlk1XvdvUeBnXmlld",
    "sw": "EXAVITQu4vr4xnSDxMaL",
    "ha": "AZnzlk1XvdvUeBnXmlld",
    "ar": "AZnzlk1XvdvUeBnXmlld",
    "pt-BR": "EXAVITQu4vr4xnSDxMaL",
    "es-MX": "AZnzlk1XvdvUeBnXmlld",
}


class ElevenLabsTTSProvider(BaseProvider):
    name = "elevenlabs"

    def __init__(self):
        self._api_key = os.getenv("ELEVENLABS_API_KEY", "")
        self._endpoint = "https://api.elevenlabs.io/v1/text-to-speech"

    async def health(self) -> bool:
        return bool(self._api_key)

    @property
    def supported_languages(self) -> list[str]:
        # ElevenLabs Multilingual v2 supports 32 languages
        return list(_VOICE_MAP.keys()) + ["id", "vi", "th", "fil", "tr", "fr", "de", "it"]

    async def synthesize(self, request: TTSRequest) -> TTSResult:
        if not self._api_key:
            raise RuntimeError("ELEVENLABS_API_KEY not set")
        t0 = time.monotonic()

        voice_id = request.voice_id or _VOICE_MAP.get(request.language, _VOICE_MAP["en"])
        async with httpx.AsyncClient(timeout=30) as c:
            r = await c.post(
                f"{self._endpoint}/{voice_id}",
                headers={"xi-api-key": self._api_key},
                json={
                    "text": request.text,
                    "model_id": "eleven_multilingual_v2",
                    "voice_settings": {
                        "stability": 0.5,
                        "similarity_boost": 0.8,
                        "speed": request.speed,
                    },
                },
            )
            r.raise_for_status()
            audio_bytes = r.content

        return TTSResult(
            audio_base64=base64.b64encode(audio_bytes).decode(),
            format="mp3",
            provider="elevenlabs",
            voice_id=voice_id,
            latency_ms=int((time.monotonic() - t0) * 1000),
        )
