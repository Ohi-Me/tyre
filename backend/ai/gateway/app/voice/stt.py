"""STT — Whisper transcription (hosted API or local)."""
from __future__ import annotations

import io

import httpx

from app.config import settings


async def transcribe_audio(audio: io.BytesIO, language_hint: str = "en") -> tuple[str, str]:
    """
    Returns (transcript, detected_locale).
    Uses OpenAI Whisper API if WHISPER_API_KEY is set, else falls back to Groq's
    Whisper Large v3 (which is free-tier on Groq).
    """
    if settings.whisper_api_key:
        return await _whisper_openai(audio, language_hint)
    elif settings.groq_api_key:
        return await _whisper_groq(audio, language_hint)
    else:
        # AI-C9 fix: previously returned hardcoded Hindi "हम पटना में हैं, दिल्ली जाना है"
        # which made every voice command a Patna→Delhi search. Now raises so the caller
        # can return an honest error to the user instead of fabricating a transcript.
        raise RuntimeError(
            "STT provider not configured. Set WHISPER_API_KEY or GROQ_API_KEY. "
            "Voice commands cannot be transcribed without a real STT provider."
        )


async def _whisper_openai(audio: io.BytesIO, language: str) -> tuple[str, str]:
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            "https://api.openai.com/v1/audio/transcriptions",
            headers={"Authorization": f"Bearer {settings.whisper_api_key}"},
            files={"file": ("audio.webm", audio, "audio/webm")},
            data={"model": settings.whisper_model, "language": language[:2], "response_format": "json"},
        )
        resp.raise_for_status()
        data = resp.json()
        return data["text"], language


async def _whisper_groq(audio: io.BytesIO, language: str) -> tuple[str, str]:
    from groq import AsyncGroq
    client = AsyncGroq(api_key=settings.groq_api_key)
    transcription = await client.audio.transcriptions.create(
        model="whisper-large-v3",
        file=audio,
        language=language[:2],
        response_format="verbose_json",
    )
    return transcription.text, language
