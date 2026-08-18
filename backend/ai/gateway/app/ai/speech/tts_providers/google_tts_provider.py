"""Google Cloud TTS provider — WaveNet voices, 40+ languages."""
from __future__ import annotations

import os
import time

import httpx

from app.ai.base import BaseProvider
from app.ai.speech.models import TTSRequest, TTSResult

_GOOGLE_VOICE_MAP = {
    "hi": "hi-IN-Wavenet-B",
    "en": "en-IN-Wavenet-A",
    "bn": "bn-IN-Wavenet-A",
    "te": "te-IN-Wavenet-A",
    "mr": "mr-IN-Wavenet-A",
    "ta": "ta-IN-Wavenet-A",
    "ur": "ur-IN-Wavenet-A",
    "gu": "gu-IN-Wavenet-A",
    "kn": "kn-IN-Wavenet-A",
    "ml": "ml-IN-Wavenet-A",
    "pa": "pa-IN-Wavenet-A",
    "sw": "sw-Wavenet-A",
    "af": "af-ZA-Wavenet-A",
    "ar": "ar-XA-Wavenet-A",
    "fr": "fr-FR-Wavenet-A",
    "pt-BR": "pt-BR-Wavenet-A",
    "es-MX": "es-MX-Wavenet-A",
    "tr": "tr-TR-Wavenet-A",
    "vi": "vi-VN-Wavenet-A",
    "th": "th-TH-Wavenet-A",
    "id": "id-ID-Wavenet-A",
    "ru": "ru-RU-Wavenet-A",
    "zh-Hans": "cmn-CN-Wavenet-A",
    "ja": "ja-JP-Wavenet-A",
    "ko": "ko-KR-Wavenet-A",
    "de": "de-DE-Wavenet-A",
}


class GoogleTTSProvider(BaseProvider):
    name = "google-tts"

    def __init__(self):
        self._api_key = os.getenv("GOOGLE_TTS_API_KEY", "")

    async def health(self) -> bool:
        return bool(self._api_key)

    @property
    def supported_languages(self) -> list[str]:
        return list(_GOOGLE_VOICE_MAP.keys())

    async def synthesize(self, request: TTSRequest) -> TTSResult:
        if not self._api_key:
            raise RuntimeError("GOOGLE_TTS_API_KEY not set")
        t0 = time.monotonic()

        voice = _GOOGLE_VOICE_MAP.get(request.language, _GOOGLE_VOICE_MAP["en"])
        lang_code = voice.split("-Wavenet")[0] if "-Wavenet" in voice else request.language

        payload = {
            "input": {"text": request.text},
            "voice": {"languageCode": lang_code, "name": voice},
            "audioConfig": {
                "audioEncoding": "MP3" if request.format == "mp3" else "LINEAR16",
                "speakingRate": request.speed,
                "pitch": request.pitch,
            },
        }
        async with httpx.AsyncClient(timeout=30) as c:
            r = await c.post(
                "https://texttospeech.googleapis.com/v1/text:synthesize",
                params={"key": self._api_key},
                json=payload,
            )
            r.raise_for_status()
            data = r.json()

        return TTSResult(
            audio_base64=data["audioContent"],  # Google returns base64 directly
            format=request.format,
            provider="google-tts",
            voice_id=voice,
            latency_ms=int((time.monotonic() - t0) * 1000),
        )
