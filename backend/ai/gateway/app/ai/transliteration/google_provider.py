"""Google Transliteration provider — fallback for non-Indian languages."""
from __future__ import annotations

import os

import httpx

from app.ai.base import BaseProvider


class GoogleTransliterationProvider(BaseProvider):
    """
    Google Transliteration (via Google Input Tools API).
    Supports 70+ languages including all major Indian scripts.
    Used as a fallback when AI4Bharat is unavailable.
    """

    name = "google-transliteration"

    def __init__(self):
        self._api_key = os.getenv("GOOGLE_INPUT_API_KEY", "")

    async def health(self) -> bool:
        return True  # Google Input Tools has a free endpoint

    @property
    def supported_languages(self) -> list[str]:
        return ["hi", "en", "bn", "te", "mr", "ta", "ur", "gu", "kn", "or", "ml",
                "pa", "as", "ne", "si", "ar", "fa", "ru", "el", "ja", "ko", "zh",
                "th", "vi"]

    async def transliterate(self, text: str, source_lang: str, target_script: str = "Latin") -> str:
        # Google Input Tools transliteration
        lang_map = {"hi": "hindi", "bn": "bengali", "te": "telugu", "mr": "marathi",
                    "ta": "tamil", "ur": "urdu", "gu": "gujarati", "kn": "kannada",
                    "ml": "malayalam", "pa": "punjabi", "or": "oriya", "as": "assamese",
                    "ne": "nepali", "si": "sinhala", "ar": "arabic", "fa": "persian",
                    "ru": "russian"}

        target_lang = lang_map.get(source_lang, "hindi")
        endpoint = "https://inputtools.google.com/request"
        params = {
            "text": text,
            "itc": f"{source_lang}-t-i0-und",  # input method code
            "num": 1,
            "cp": 0,
            "cs": 0,
            "ie": "utf-8",
            "oe": "utf-8",
        }
        async with httpx.AsyncClient(timeout=10) as c:
            r = await c.get(endpoint, params=params)
            r.raise_for_status()
            data = r.json()
            # Google returns nested arrays; extract the first transliteration
            if data.get("status") == 200 and len(data) > 1:
                return data[1][0][1][0] if data[1] and data[1][0] else text
            return text
