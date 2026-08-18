"""NLLB-200 provider — Meta's 200-language MT model, self-hosted."""
from __future__ import annotations

import httpx

from app.ai.base import BaseProvider
from app.config import settings

# BCP-47 → NLLB-200 code mapping.
# Covers all 50+ Indian languages + 60+ global languages in the TYRE registry.
_NLLB_MAP = {
    # Tier 1 Indian
    "hi": "hin_Deva", "en": "eng_Latn", "bn": "ben_Beng", "te": "tel_Telu",
    "mr": "mar_Deva", "ta": "tam_Taml", "ur": "urd_Arab", "gu": "guj_Gujr",
    "kn": "kan_Knda", "or": "ory_Orya", "ml": "mal_Mlym", "pa": "pan_Guru",
    "as": "asm_Beng",
    # Tier 2 Indian (dialects + regional)
    "bho": "bho_Deva", "mag": "mag_Deva", "ang": "anp_Deva", "mai": "mai_Deva",
    "hne": "hne_Deva", "awa": "awa_Deva", "bgc": "bgc_Deva", "bns": "bns_Deva",
    "mwr": "mwr_Deva", "raj": "raj_Deva", "gbm": "gbm_Deva", "kfy": "kfy_Deva",
    "tcy": "tcy_Knda", "kfa": "kfa_Knda", "kok": "kok_Deva", "ks": "kas_Arab",
    "dgo": "dgo_Deva", "mni": "mni_Mtei", "sat": "sat_Olck", "brx": "brx_Deva",
    "grt": "grt_Latn", "kha": "kha_Latn", "lus": "lus_Latn", "nag": "nag_Latn",
    "trp": "trp_Beng", "bhb": "bhb_Deva", "gon": "gon_Deva", "hoc": "hoc_Olck",
    "unr": "unr_Olck", "kru": "kru_Deva", "sck": "sck_Deva", "sjp": "sjp_Deva",
    "dak": "dak_Arab", "lmn": "lmn_Deva", "sa": "san_Deva", "sd": "snd_Arab",
    # Tier 1 global
    "sw": "swh_Latn", "ha": "hau_Latn", "pt-BR": "por_Latn", "es-MX": "spa_Latn",
    "ar": "arb_Arab", "ne": "npi_Deva", "si": "sin_Sinh",
    # Tier 3 global
    "yo": "yor_Latn", "ig": "ibo_Latn", "am": "amh_Ethi", "zu": "zul_Latn",
    "xh": "xho_Latn", "af": "afr_Latn", "rw": "kin_Latn", "fr": "fra_Latn",
    "fr-CI": "fra_Latn", "fr-SN": "fra_Latn", "wo": "wol_Latn", "so": "som_Latn",
    "es-CO": "spa_Latn", "es-PE": "spa_Latn", "es-AR": "spa_Latn", "qu": "quy_Latn",
    "fa": "pes_Arab", "tr": "tur_Latn", "he": "heb_Hebr",
    "id": "ind_Latn", "vi": "vie_Latn", "th": "tha_Thai", "fil": "fil_Latn",
    "ms": "zsm_Latn", "km": "khm_Khmr", "lo": "lao_Laoo", "my": "mya_Mymr",
    "jv": "jav_Latn", "su": "sun_Latn",
    "kk": "kaz_Cyrl", "ky": "kir_Cyrl", "uz": "uzn_Latn", "tk": "tuk_Latn",
    "tg": "tgk_Cyrl",
    "ak": "aka_Latn", "ee": "ewe_Latn", "bm": "bam_Latn", "ff": "fuv_Latn",
    "om": "gaz_Latn", "ti": "tir_Ethi", "lg": "lug_Latn", "sn": "sna_Latn",
    "ny": "nya_Latn", "ln": "lin_Latn", "fr-CD": "fra_Latn",
    "es-ES": "spa_Latn", "es-CL": "spa_Latn", "es-EC": "spa_Latn",
    "es-VE": "spa_Latn", "es-BO": "spa_Latn", "ay": "ayr_Latn", "gn": "grn_Latn",
    "ht": "hat_Latn",
    "ps": "pbt_Arab", "si-LK": "sin_Sinh", "dv": "div_Thaa",
    "bn-BD": "ben_Beng",
    # Tier 4 global
    "zh-Hans": "zho_Hans", "ja": "jpn_Jpan", "ko": "kor_Hang", "ru": "rus_Cyrl",
    "uk": "ukr_Cyrl", "pl": "pol_Latn", "de": "deu_Latn", "it": "ita_Latn",
    "nl": "nld_Latn", "sv": "swe_Latn",
}


class NLLBProvider(BaseProvider):
    """
    NLLB-200 — Meta's No Language Left Behind model.
    200+ languages including all Indian dialects.
    Self-hosted via transformers / hosted via API.
    """

    name = "nllb"

    def __init__(self):
        self._api_url = settings.nllb_api_url
        self._model_name = settings.nllb_model

    async def health(self) -> bool:
        if not self._api_url:
            return False
        try:
            async with httpx.AsyncClient(timeout=5) as c:
                r = await c.get(f"{self._api_url}/health")
                return r.status_code == 200
        except Exception:
            return False

    @property
    def supported_languages(self) -> list[str]:
        return list(_NLLB_MAP.keys())

    async def translate(self, texts: list[str], source: str, target: str) -> list[str]:
        src_code = self._to_nllb_code(source)
        tgt_code = self._to_nllb_code(target)

        if self._api_url:
            return await self._translate_via_api(texts, src_code, tgt_code)
        return await self._translate_local(texts, src_code, tgt_code)

    async def _translate_via_api(self, texts: list[str], src: str, tgt: str) -> list[str]:
        async with httpx.AsyncClient(timeout=30) as c:
            r = await c.post(
                f"{self._api_url}/translate",
                json={"texts": texts, "source_lang": src, "target_lang": tgt},
            )
            r.raise_for_status()
            return r.json()["translations"]

    async def _translate_local(self, texts: list[str], src: str, tgt: str) -> list[str]:
        """Local inference via transformers pipeline (dev only — slow)."""
        from transformers import pipeline
        pipe = pipeline("translation", model=self._model_name, src_lang=src, tgt_lang=tgt)
        return [p["translation_text"] for p in pipe(texts, max_length=512)]

    def _to_nllb_code(self, locale: str) -> str:
        return _NLLB_MAP.get(locale, _NLLB_MAP.get(locale.split("-")[0], "eng_Latn"))
