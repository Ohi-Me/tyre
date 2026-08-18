"""Transliteration service — provider-agnostic facade."""
from __future__ import annotations

from app.i18n.locales import LOCALE_MAP

from .ai4bharat_provider import AI4BharatTransliterationProvider
from .google_provider import GoogleTransliterationProvider


class TransliterationService:
    """
    Provider priority:
      1. AI4Bharat (Indian languages, best quality)
      2. Google Transliteration (broader coverage, lower quality)

    Use cases:
      - Show native-script text alongside Latin transliteration for ops team
      - Allow drivers to type in Latin ("namaste") and convert to native ("नमस्ते")
      - Cross-script matching: search "Patna" matches "पटना"
    """

    def __init__(self):
        self.providers = [
            AI4BharatTransliterationProvider(),
            GoogleTransliterationProvider(),
        ]

    async def to_latin(self, text: str, source_lang: str) -> str:
        """Transliterate native-script text to Latin/Roman."""
        return await self._transliterate(text, source_lang, "Latin")

    async def to_native(self, text: str, target_lang: str) -> str:
        """Transliterate Latin text to native script of target_lang."""
        return await self._transliterate(text, target_lang, "Native")

    async def _transliterate(self, text: str, lang: str, target_script: str) -> str:
        # If locale doesn't support transliteration, walk fallback chain
        cfg = LOCALE_MAP.get(lang)
        if cfg and not cfg.transliteration_enabled and cfg.fallback:
            return await self._transliterate(text, cfg.fallback, target_script)

        for provider in self.providers:
            if not await provider.health():
                continue
            if not provider.supports(lang):
                continue
            try:
                return await provider.transliterate(text, lang, target_script)
            except Exception as e:
                print(f"[TransliterationService] {provider.name} failed: {e}")
                continue

        # Last resort: return original text
        return text

    async def bilingual(self, text: str, lang: str) -> dict:
        """Returns both native and Latin versions of a text."""
        if lang == "en" or lang.startswith("en-"):
            return {"native": text, "latin": text, "language": lang}

        native = text
        latin = await self.to_latin(text, lang)
        return {"native": native, "latin": latin, "language": lang}
