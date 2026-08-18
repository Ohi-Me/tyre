"""NLLB-200 translation service — cached in Postgres + Redis."""
from __future__ import annotations

import httpx
from redis.asyncio import Redis

from app.config import settings

_redis: Redis | None = None


async def get_redis() -> Redis:
    global _redis
    if _redis is None:
        _redis = Redis.from_url(settings.redis_url, decode_responses=True)
    return _redis


async def translate_batch(texts: list[str], source_lang: str, target_lang: str) -> list[str]:
    """Translate a batch of strings. Uses Redis cache first, then NLLB service."""
    if source_lang == target_lang:
        return texts

    r = await get_redis()
    cache_keys = [f"tr:{source_lang}:{target_lang}:{hash(t)}" for t in texts]
    cached = await r.mget(cache_keys)

    results: list[str | None] = [None] * len(texts)
    misses: list[int] = []
    for i, c in enumerate(cached):
        if c:
            results[i] = c
        else:
            misses.append(i)

    if misses:
        miss_texts = [texts[i] for i in misses]
        translated = await _call_nllb(miss_texts, source_lang, target_lang)
        # Cache (TTL 30 days)
        pipe = r.pipeline()
        for idx, trans in zip(misses, translated):
            results[idx] = trans
            pipe.setex(cache_keys[idx], 30 * 86400, trans)
        await pipe.execute()

    return results  # type: ignore[return-value]


async def _call_nllb(texts: list[str], source: str, target: str) -> list[str]:
    """Call self-hosted NLLB-200 service (or hosted API)."""
    # Map BCP-47 → NLLB-200 code (mostly identical, but Arabic needs 'arb_Arab' etc.)
    src = _to_nllb_code(source)
    tgt = _to_nllb_code(target)

    if settings.nllb_api_url:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{settings.nllb_api_url}/translate",
                json={"texts": texts, "source_lang": src, "target_lang": tgt},
            )
            resp.raise_for_status()
            return resp.json()["translations"]
    else:
        # Local transformers pipeline — slow but works in dev
        from transformers import pipeline
        pipe = pipeline("translation", model=settings.nllb_model, src_lang=src, tgt_lang=tgt)
        return [p["translation_text"] for p in pipe(texts, max_length=512)]


_NLLB_MAP = {
    "hi": "hin_Deva", "en": "eng_Latn", "bn": "ben_Beng", "te": "tel_Telu",
    "mr": "mar_Deva", "ta": "tam_Taml", "gu": "guj_Gujr", "kn": "kan_Knda",
    "ml": "mal_Mlym", "pa": "pan_Guru", "ur": "urd_Arab", "or": "ory_Orya",
    "ne": "npi_Deva", "si": "sin_Sinh", "sw": "swh_Latn", "ha": "hau_Latn",
    "am": "amh_Ethi", "yo": "yor_Latn", "pt-BR": "por_Latn", "es-MX": "spa_Latn",
    "ar": "arb_Arab", "fa": "pes_Arab", "fr": "fra_Latn", "tr": "tur_Latn",
    "id": "ind_Latn", "vi": "vie_Latn", "th": "tha_Thai", "fil": "fil_Latn",
    "ms": "zsm_Latn", "km": "khm_Khmr", "lo": "lao_Laoo", "my": "mya_Mymr",
    "zu": "zul_Latn", "xh": "xho_Latn", "af": "afr_Latn", "ig": "ibo_Latn",
    "ti": "tir_Ethi", "om": "gaz_Latn", "so": "som_Latn", "rw": "kin_Latn",
    "lg": "lug_Latn", "sn": "sna_Latn", "ny": "nya_Latn", "as": "asm_Beng",
    "bh": "bho_Deva", "ks": "kas_Arab", "sd": "snd_Arab", "sat": "sat_Olck",
    "mni": "mni_Mtei", "kok": "gom_Deva", "mai": "mai_Deva", "ps": "pbt_Arab",
    "dv": "div_Thaa", "bm": "bam_Latn", "ff": "fuv_Latn", "ee": "ewe_Latn",
    "ak": "aka_Latn", "qu": "quy_Latn", "ay": "ayr_Latn", "gn": "grn_Latn",
    "ht": "hat_Latn", "jv": "jav_Latn", "su": "sun_Latn", "ku": "kmr_Latn",
    "az": "azj_Latn", "kk": "kaz_Cyrl", "ky": "kir_Cyrl", "uz": "uzn_Latn",
    "tk": "tuk_Latn", "tg": "tgk_Cyrl", "he": "heb_Hebr", "zh-Hans": "zho_Hans",
    "ja": "jpn_Jpan", "ko": "kor_Hang", "ru": "rus_Cyrl", "uk": "ukr_Cyrl",
}


def _to_nllb_code(locale: str) -> str:
    return _NLLB_MAP.get(locale, _NLLB_MAP.get(locale.split("-")[0], "eng_Latn"))
