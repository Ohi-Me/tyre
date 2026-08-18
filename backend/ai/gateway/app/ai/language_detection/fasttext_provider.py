"""fastText language detection provider — 176 languages, runs locally."""
from __future__ import annotations

import os

from app.ai.base import BaseProvider


class FastTextProvider(BaseProvider):
    """
    fastText lid.176.bin — Meta's 176-language detection model.
    Runs entirely on CPU, ~1ms per detection.
    Distinguishes 22+ Indian languages and most dialects.
    """

    name = "fasttext"

    def __init__(self):
        self._model = None
        self._model_path = os.getenv("FASTTEXT_MODEL_PATH", "/models/lid.176.bin")

    async def health(self) -> bool:
        return os.path.exists(self._model_path)

    @property
    def supported_languages(self) -> list[str]:
        # fastText supports 176 ISO 639-1 codes
        # Indian languages it distinguishes: hi, en, bn, te, mr, ta, ur, gu, kn,
        # ml, pa, as, or, ne, si, sd, ks, sa, bho, mai, sat
        return ["hi", "en", "bn", "te", "mr", "ta", "ur", "gu", "kn", "ml", "pa",
                "as", "or", "ne", "si", "sd", "ks", "sa", "bho", "mai", "sat",
                "sw", "ha", "yo", "ig", "am", "zu", "af", "fr", "pt", "es", "ar",
                "id", "vi", "th", "fil", "ms", "tr", "fa", "he", "ru", "uk",
                "zh", "ja", "ko"]

    async def detect(self, text: str) -> tuple[str, float]:
        """Returns (BCP-47 locale, confidence)."""
        if self._model is None:
            try:
                import fasttext
                self._model = fasttext.load_model(self._model_path)
            except ImportError:
                raise RuntimeError("fasttext not installed: pip install fasttext")

        # fastText returns label like "__label__hin"
        predictions = self._model.predict(text, k=3)
        labels = predictions[0]
        probs = predictions[1]

        # Map fastText's ISO 639-3 → BCP-47
        iso3_to_bcp47 = {
            "hin": "hi", "eng": "en", "ben": "bn", "tel": "te", "mar": "mr",
            "tam": "ta", "urd": "ur", "guj": "gu", "kan": "kn", "mal": "ml",
            "pan": "pa", "asm": "as", "ori": "or", "nep": "ne", "sin": "si",
            "snd": "sd", "kas": "ks", "san": "sa", "bho": "bho", "mai": "mai",
            "sat": "sat", "swh": "sw", "hau": "ha", "yor": "yo", "ibo": "ig",
            "amh": "am", "zul": "zu", "afr": "af", "fra": "fr", "por": "pt-BR",
            "spa": "es-MX", "arb": "ar", "ind": "id", "vie": "vi", "tha": "th",
            "fil": "fil", "msa": "ms", "tur": "tr", "fas": "fa", "heb": "he",
            "rus": "ru", "ukr": "uk", "zho": "zh-Hans", "jpn": "ja", "kor": "ko",
        }

        top_label = labels[0].replace("__label__", "")
        bcp47 = iso3_to_bcp47.get(top_label, "en")
        confidence = float(probs[0])

        return bcp47, confidence
