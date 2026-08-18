"""DeepL provider — best quality for supported languages."""
from __future__ import annotations

import os

import httpx

from app.ai.base import BaseProvider


class DeepLProvider(BaseProvider):
    name = "deepl"

    def __init__(self):
        self._api_key = os.getenv("DEEPL_API_KEY", "")
        self._endpoint = "https://api-free.deepl.com/v2/translate" if self._api_key.endswith(":fx") \
            else "https://api.deepl.com/v2/translate"

    async def health(self) -> bool:
        return bool(self._api_key)

    @property
    def supported_languages(self) -> list[str]:
        # DeepL supports ~30 languages — limited but highest quality
        return ["en", "de", "fr", "es", "it", "pt", "nl", "pl", "ru", "uk",
                "ja", "ko", "zh-Hans", "ar", "tr", "id", "th"]

    async def translate(self, texts: list[str], source: str, target: str) -> list[str]:
        if not self._api_key:
            raise RuntimeError("DEEPL_API_KEY not set")
        async with httpx.AsyncClient(timeout=30) as c:
            r = await c.post(
                self._endpoint,
                data={
                    "auth_key": self._api_key,
                    "text": texts,
                    "source_lang": source.upper().split("-")[0],
                    "target_lang": target.upper().split("-")[0],
                },
            )
            r.raise_for_status()
            data = r.json()
            return [t["text"] for t in data["translations"]]
