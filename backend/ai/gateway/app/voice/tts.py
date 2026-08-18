"""TTS — speech synthesis for 100+ languages.

Provider chain:
  1. ElevenLabs (best quality, supports 32 languages)
  2. Coqui XTTS-v2 (self-hosted, supports 17 languages incl. low-resource)
  3. Azure TTS (100+ languages, paid)
  4. Browser built-in (client-side fallback)

If a locale is unsupported, we fall back to the driver_locale's fallback chain
via @tyre/i18n resolve_voice_locale.
"""
from __future__ import annotations

import base64

from app.config import settings


async def synthesize_speech(text: str, locale: str) -> str | None:
    """Returns base64-encoded MP3, or None if no provider available.

    Provider chain (TYRE v1.1 item #13): ElevenLabs → Azure TTS. ElevenLabs is best
    quality but a single point of failure; when it's down or unconfigured, Azure
    Cognitive Services TTS (widely used in the Indian market, 100+ languages) keeps
    voice replies audible instead of silent.
    """
    if settings.elevenlabs_api_key:
        try:
            audio = await _elevenlabs(text, locale)
            if audio:
                return base64.b64encode(audio).decode()
        except Exception:
            pass  # fall through to Azure
    if settings.azure_speech_key:
        try:
            audio = await _azure_tts(text, locale)
            if audio:
                return base64.b64encode(audio).decode()
        except Exception:
            pass
    return None


# Map our BCP-47 locale → an Azure neural voice. Falls back to Hindi/English.
_AZURE_VOICE_MAP = {
    "hi": "hi-IN-SwaraNeural",
    "en": "en-IN-NeerjaNeural",
    "bn": "bn-IN-TanishaaNeural",
    "ta": "ta-IN-PallaviNeural",
    "te": "te-IN-ShrutiNeural",
    "mr": "mr-IN-AarohiNeural",
    "gu": "gu-IN-DhwaniNeural",
    "ar": "ar-SA-ZariyahNeural",
    "sw": "sw-KE-ZuriNeural",
}


async def _azure_tts(text: str, locale: str) -> bytes | None:
    """Azure Cognitive Services TTS — REST API, returns MP3 bytes."""
    import httpx

    voice = _AZURE_VOICE_MAP.get(locale, _AZURE_VOICE_MAP["hi"])
    lang = voice.split("-")[0] + "-" + voice.split("-")[1]
    region = settings.azure_speech_region or "centralindia"
    ssml = (
        f"<speak version='1.0' xml:lang='{lang}'>"
        f"<voice xml:lang='{lang}' name='{voice}'>{_xml_escape(text)}</voice></speak>"
    )
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            f"https://{region}.tts.speech.microsoft.com/cognitiveservices/v1",
            headers={
                "Ocp-Apim-Subscription-Key": settings.azure_speech_key,
                "Content-Type": "application/ssml+xml",
                "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3",
                "User-Agent": "tyre-ai-gateway",
            },
            content=ssml.encode("utf-8"),
        )
        if resp.status_code != 200:
            return None
        return resp.content


def _xml_escape(s: str) -> str:
    return (
        s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
        .replace('"', "&quot;").replace("'", "&apos;")
    )


async def _elevenlabs(text: str, locale: str) -> bytes | None:
    import httpx
    # Map our locale → ElevenLabs voice ID
    # (in production, store these in DB per locale)
    voice_map = {
        "hi": "pNInz6obpgDQGcFmaJgB",  # Adam — Hindi-capable
        "en": "21m00Tcm4TlvDq8ikWAM",
        "sw": "EXAVITQu4vr4xnSDxMaL",
        "ar": "onwK4e9ZLuTAKqWW03F9",
    }
    voice_id = voice_map.get(locale, voice_map["en"])
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}",
            headers={"xi-api-key": settings.elevenlabs_api_key},
            json={"text": text, "model_id": "eleven_multilingual_v2", "voice_settings": {"stability": 0.5, "similarity_boost": 0.8}},
        )
        if resp.status_code != 200:
            return None
        return resp.content
