"""Whisper STT provider — Groq (free), OpenAI API, or local."""
from __future__ import annotations

import base64
import io

import httpx

from app.ai.base import BaseProvider
from app.ai.speech.models import STTRequest, STTResult
from app.config import settings


class WhisperSTTProvider(BaseProvider):
    """
    Whisper Large v3 — 99 languages.
    Routes to:
      1. Groq (free, fastest) — if GROQ_API_KEY set
      2. OpenAI Whisper API — if WHISPER_API_KEY set
      3. Local transformers pipeline — fallback (slow)
    """

    name = "whisper"

    async def health(self) -> bool:
        return bool(settings.groq_api_key or settings.whisper_api_key)

    @property
    def supported_languages(self) -> list[str]:
        # Whisper Large v3 supports 99 languages
        # Including all Tier 1 Indian + most Tier 2 Indian dialects
        return ["hi", "en", "bn", "te", "mr", "ta", "ur", "gu", "kn", "or", "ml",
                "pa", "as", "bho", "mai", "sat", "ks", "sd", "ne", "si",
                "sw", "ha", "yo", "ig", "am", "zu", "af", "fr", "pt", "es", "ar",
                "id", "vi", "th", "fil", "ms", "tr", "fa", "he", "ru", "uk",
                "zh", "ja", "ko"]

    async def transcribe(self, request: STTRequest) -> STTResult:
        if settings.groq_api_key:
            return await self._transcribe_groq(request)
        elif settings.whisper_api_key:
            return await self._transcribe_openai(request)
        else:
            return await self._transcribe_local(request)

    async def _transcribe_groq(self, request: STTRequest) -> STTResult:
        import time
        t0 = time.monotonic()
        from groq import AsyncGroq
        client = AsyncGroq(api_key=settings.groq_api_key)

        audio_bytes = base64.b64decode(request.audio_base64) if request.audio_base64 else None
        if not audio_bytes:
            raise ValueError("audio_base64 required for Whisper")

        transcription = await client.audio.transcriptions.create(
            model="whisper-large-v3",
            file=("audio.webm", io.BytesIO(audio_bytes), "audio/webm"),
            language=request.language_hint[:2] if request.language_hint else None,
            response_format="verbose_json",
        )

        return STTResult(
            transcript=transcription.text,
            detected_language=request.language_hint or transcription.language or "en",
            confidence=0.95,
            provider="whisper-groq",
            latency_ms=int((time.monotonic() - t0) * 1000),
        )

    async def _transcribe_openai(self, request: STTRequest) -> STTResult:
        import time
        t0 = time.monotonic()
        audio_bytes = base64.b64decode(request.audio_base64) if request.audio_base64 else None

        async with httpx.AsyncClient(timeout=60) as c:
            r = await c.post(
                "https://api.openai.com/v1/audio/transcriptions",
                headers={"Authorization": f"Bearer {settings.whisper_api_key}"},
                files={"file": ("audio.webm", io.BytesIO(audio_bytes), "audio/webm")},
                data={
                    "model": settings.whisper_model,
                    "language": request.language_hint[:2] if request.language_hint else "",
                    "response_format": "verbose_json",
                },
            )
            r.raise_for_status()
            data = r.json()

        return STTResult(
            transcript=data["text"],
            detected_language=data.get("language", request.language_hint or "en"),
            confidence=0.95,
            provider="whisper-openai",
            latency_ms=int((time.monotonic() - t0) * 1000),
        )

    async def _transcribe_local(self, request: STTRequest) -> STTResult:
        import time
        t0 = time.monotonic()
        # Local Whisper pipeline — slow but works for dev
        # In production, always use Groq or OpenAI API
        audio_bytes = base64.b64decode(request.audio_base64) if request.audio_base64 else None
        from transformers import pipeline
        pipe = pipeline("automatic-speech-recognition", model="openai/whisper-large-v3")
        result = pipe(io.BytesIO(audio_bytes), return_language=True)
        return STTResult(
            transcript=result["text"],
            detected_language=result.get("language", request.language_hint or "en"),
            confidence=0.9,
            provider="whisper-local",
            latency_ms=int((time.monotonic() - t0) * 1000),
        )
