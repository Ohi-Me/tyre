"""Google Translate provider — best for low-resource languages."""
from __future__ import annotations

import os

import httpx

from app.ai.base import BaseProvider


class GoogleTranslateProvider(BaseProvider):
    name = "google"

    def __init__(self):
        self._api_key = os.getenv("GOOGLE_TRANSLATE_API_KEY", "")
        self._endpoint = "https://translation.googleapis.com/language/translate/v2"

    async def health(self) -> bool:
        return bool(self._api_key)

    @property
    def supported_languages(self) -> list[str]:
        # Google Translate supports 130+ languages — return common TYRE locales
        return ["hi", "en", "bn", "te", "mr", "ta", "ur", "gu", "kn", "or", "ml",
                "pa", "as", "bho", "mai", "sat", "ks", "sd", "sa", "ne", "si",
                "sw", "ha", "yo", "ig", "am", "zu", "af", "fr", "pt", "es", "ar",
                "id", "vi", "th", "fil", "ms", "tr", "fa", "he", "ru", "uk",
                "zh-CN", "ja", "ko", "de", "it", "nl", "sv"]

    async def translate(self, texts: list[str], source: str, target: str) -> list[str]:
        if not self._api_key:
            raise RuntimeError("GOOGLE_TRANSLATE_API_KEY not set")
        # Google supports up to 128 texts per request
        results: list[str] = []
        for chunk in self._chunk(texts, 128):
            async with httpx.AsyncClient(timeout=30) as c:
                r = await c.post(
                    self._endpoint,
                    params={"key": self._api_key},
                    json={
                        "q": chunk,
                        "source": source.split("-")[0],
                        "target": target.split("-")[0],
                        "format": "text",
                    },
                )
                r.raise_for_status()
                data = r.json()
                results.extend(t["translatedText"] for t in data["data"]["translations"])
        return results

    def _chunk(self, lst: list, n: int):
        for i in range(0, len(lst), n):
            yield lst[i:i + n]
