"""STT Service — provider-agnostic speech-to-text facade."""
from __future__ import annotations

from app.ai.speech.models import STTRequest, STTResult
from app.ai.speech.stt_providers.deepgram_provider import DeepgramSTTProvider
from app.ai.speech.stt_providers.google_stt_provider import GoogleSpeechProvider
from app.ai.speech.stt_providers.whisper_provider import WhisperSTTProvider
from app.i18n.locales import resolveSTTLocale


class STTService:
    """
    Provider priority (first available + supports language wins):
      1. Deepgram (lowest latency, streaming-capable)
      2. Whisper via Groq (free, 99 langs)
      3. Google Speech (most languages, paid)
      4. Whisper via OpenAI (paid, best accuracy)
      5. Whisper local (slow, dev only)
    """

    def __init__(self):
        self.providers = [
            DeepgramSTTProvider(),
            WhisperSTTProvider(),
            GoogleSpeechProvider(),
        ]

    async def transcribe(self, request: STTRequest) -> STTResult:
        if request.transcript_hint:
            # Skip STT — caller provided a pre-transcribed text
            return STTResult(
                transcript=request.transcript_hint,
                detected_language=request.language_hint or "en",
                confidence=1.0,
                provider="passthrough",
                latency_ms=0,
            )

        # Resolve STT-supported locale (walks fallback chain if needed)
        language = resolveSTTLocale(request.language_hint or "en")

        for provider in self.providers:
            if not await provider.health():
                continue
            if not provider.supports(language):
                continue
            try:
                # Override the requested language with the resolved one
                req = STTRequest(
                    audio_base64=request.audio_base64,
                    audio_url=request.audio_url,
                    transcript_hint=request.transcript_hint,
                    language_hint=language,
                    enable_diarization=request.enable_diarization,
                    enable_word_timestamps=request.enable_word_timestamps,
                )
                return await provider.transcribe(req)
            except Exception as e:
                print(f"[STTService] {provider.name} failed: {e}")
                continue

        # Last-resort: return empty
        return STTResult(
            transcript="",
            detected_language=language,
            confidence=0.0,
            provider="none",
            latency_ms=0,
        )
