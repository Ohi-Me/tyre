"""TTS Service — provider-agnostic text-to-speech facade."""
from __future__ import annotations

from app.ai.speech.models import TTSRequest, TTSResult
from app.ai.speech.tts_providers.azure_provider import AzureTTSProvider
from app.ai.speech.tts_providers.elevenlabs_provider import ElevenLabsTTSProvider
from app.ai.speech.tts_providers.google_tts_provider import GoogleTTSProvider
from app.ai.speech.tts_providers.openai_provider import OpenAITTSProvider
from app.i18n.locales import resolveVoiceLocale


class TTSService:
    """
    Provider priority:
      1. ElevenLabs (best quality, 32 langs, multilingual v2)
      2. Azure (broadest coverage, 100+ langs, best for low-resource Indian dialects)
      3. OpenAI TTS (fast, 50 langs)
      4. Google TTS (WaveNet, 40 langs, paid)

    Voice locale resolution:
      If the driver's preferred locale has no voice, walk the fallback chain.
      E.g., Angika → Bhojpuri (no voice) → Hindi (voice available).
    """

    def __init__(self):
        self.providers = [
            ElevenLabsTTSProvider(),
            AzureTTSProvider(),
            OpenAITTSProvider(),
            GoogleTTSProvider(),
        ]

    async def synthesize(self, request: TTSRequest) -> TTSResult:
        # Resolve voice-supported locale via fallback chain
        language = resolveVoiceLocale(request.language)

        for provider in self.providers:
            if not await provider.health():
                continue
            if not provider.supports(language):
                continue
            try:
                req = TTSRequest(
                    text=request.text,
                    language=language,  # Use resolved language
                    voice_id=request.voice_id,
                    speed=request.speed,
                    pitch=request.pitch,
                    format=request.format,
                    streaming=request.streaming,
                )
                return await provider.synthesize(req)
            except Exception as e:
                print(f"[TTSService] {provider.name} failed: {e}")
                continue

        # Last-resort: empty audio
        return TTSResult(
            audio_base64="",
            format=request.format,
            provider="none",
            voice_id="none",
            latency_ms=0,
        )
