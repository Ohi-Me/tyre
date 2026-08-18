"""AI4Bharat IndicTrans2 transliteration provider — best for Indian languages."""
from __future__ import annotations

import os

import httpx

from app.ai.base import BaseProvider


class AI4BharatTransliterationProvider(BaseProvider):
    """
    AI4Bharat IndicTrans2 — supports all 22 scheduled Indian languages + dialects.
    Self-hosted via the AI4Bharat inference server or called via ULCA API.
    Handles Devanagari ↔ Latin, Bengali ↔ Latin, Tamil ↔ Latin, etc.
    """

    name = "ai4bharat"

    def __init__(self):
        self._api_url = os.getenv("AI4BHARAT_API_URL", "")
        self._api_key = os.getenv("AI4BHARAT_API_KEY", "")

    async def health(self) -> bool:
        return bool(self._api_url) or bool(self._api_key)

    @property
    def supported_languages(self) -> list[str]:
        # AI4Bharat supports all 22 scheduled Indian languages + many dialects
        return ["hi", "en", "bn", "te", "mr", "ta", "ur", "gu", "kn", "or", "ml",
                "pa", "as", "bho", "mai", "sat", "ks", "sd", "sa", "ne", "si",
                "kok", "mni", "brx", "dgo", "hne", "mag", "awa", "ang"]

    async def transliterate(self, text: str, source_lang: str, target_script: str = "Latin") -> str:
        """Transliterate text from one script to another.

        Args:
            text: Input text (e.g., "नमस्ते")
            source_lang: BCP-47 (e.g., "hi")
            target_script: "Latin" (Roman) or "Native" (Devanagari for Hindi, etc.)
        """
        if not self._api_url:
            raise RuntimeError("AI4BHARAT_API_URL not set")

        async with httpx.AsyncClient(timeout=15) as c:
            r = await c.post(
                f"{self._api_url}/transliterate",
                headers={"Authorization": f"Bearer {self._api_key}"} if self._api_key else {},
                json={
                    "text": text,
                    "source_language": source_lang,
                    "target_script": target_script,
                },
            )
            r.raise_for_status()
            data = r.json()
            return data.get("transliterated_text", text)
