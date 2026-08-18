"""Azure Speech TTS provider — 100+ languages, best for low-resource locales."""
from __future__ import annotations

import base64
import os
import time

import httpx

from app.ai.base import BaseProvider
from app.ai.speech.models import TTSRequest, TTSResult

# Azure voice names per locale.
# Azure covers 100+ languages including all Tier 1 + Tier 2 Indian languages.
_AZURE_VOICE_MAP = {
    "hi": "hi-IN-MadhurNeural",
    "en": "en-IN-NeerjaNeural",
    "bn": "bn-IN-BashkarNeural",
    "te": "te-IN-MohanNeural",
    "mr": "mr-IN-AarohiNeural",
    "ta": "ta-IN-PallaviNeural",
    "ur": "ur-IN-GulNeural",
    "gu": "gu-IN-NiranjanNeural",
    "kn": "kn-IN-GaganNeural",
    "or": "or-IN-SubhasiniNeural",
    "ml": "ml-IN-MidhunNeural",
    "pa": "pa-IN-InnuNeural",
    "as": "as-IN-AaryanNeural",
    "bho": "hi-IN-MadhurNeural",  # Bhojpuri → Hindi voice fallback
    "mai": "hi-IN-MadhurNeural",
    "sw": "sw-KE-ZuriNeural",
    "ha": "ha-NG-AishaNeural",
    "yo": "yo-NG-AdedeNeural",
    "ig": "ig-NG-EzinneNeural",
    "am": "am-ET-MekdesNeural",
    "zu": "zu-ZA-ThandoNeural",
    "af": "af-ZA-AdriNeural",
    "fr": "fr-FR-DeniseNeural",
    "pt-BR": "pt-BR-FranciscaNeural",
    "es-MX": "es-MX-DaliaNeural",
    "es-CO": "es-CO-SalomeNeural",
    "es-PE": "es-PE-CamilaNeural",
    "ar": "ar-SA-ZariyahNeural",
    "fa": "fa-IR-DilaraNeural",
    "tr": "tr-TR-EmelNeural",
    "id": "id-ID-GadisNeural",
    "vi": "vi-VN-HoaiMyNeural",
    "th": "th-TH-PremwadeeNeural",
    "fil": "fil-PH-BlessicaNeural",
    "ms": "ms-MY-YasminNeural",
    "ru": "ru-RU-SvetlanaNeural",
    "uk": "uk-UA-PolinaNeural",
    "zh-Hans": "zh-CN-XiaoxiaoNeural",
    "ja": "ja-JP-NanamiNeural",
    "ko": "ko-KR-SunHiNeural",
    "de": "de-DE-KatjaNeural",
    "it": "it-IT-ElsaNeural",
}


class AzureTTSProvider(BaseProvider):
    name = "azure-tts"

    def __init__(self):
        self._key = os.getenv("AZURE_SPEECH_KEY", "")
        self._region = os.getenv("AZURE_SPEECH_REGION", "centralindia")
        self._endpoint = f"https://{self._region}.tts.speech.microsoft.com/cognitiveservices/v1"

    async def health(self) -> bool:
        return bool(self._key)

    @property
    def supported_languages(self) -> list[str]:
        # Azure covers 100+ languages — the broadest coverage of any provider
        return list(_AZURE_VOICE_MAP.keys())

    async def synthesize(self, request: TTSRequest) -> TTSResult:
        if not self._key:
            raise RuntimeError("AZURE_SPEECH_KEY not set")
        t0 = time.monotonic()

        voice = _AZURE_VOICE_MAP.get(request.language, _AZURE_VOICE_MAP["en"])
        if request.voice_id:
            voice = request.voice_id

        # Azure uses SSML
        ssml = f"""
        <speak version='1.0' xml:lang='{request.language}'>
          <voice name='{voice}'>
            <prosody rate='{request.speed}' pitch='{request.pitch}Hz'>
              {request.text}
            </prosody>
          </voice>
        </speak>"""

        fmt = "audio-16khz-128kbitrate-mono-mp3" if request.format == "mp3" else "riff-16khz-16bit-mono-pcm"
        async with httpx.AsyncClient(timeout=30) as c:
            r = await c.post(
                self._endpoint,
                headers={
                    "Ocp-Apim-Subscription-Key": self._key,
                    "Content-Type": "application/ssml+xml",
                    "X-Microsoft-OutputFormat": fmt,
                },
                content=ssml,
            )
            r.raise_for_status()
            audio_bytes = r.content

        return TTSResult(
            audio_base64=base64.b64encode(audio_bytes).decode(),
            format=request.format,
            provider="azure-tts",
            voice_id=voice,
            latency_ms=int((time.monotonic() - t0) * 1000),
        )
