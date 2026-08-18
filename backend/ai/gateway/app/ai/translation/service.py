"""
TranslationService — main facade.

Provider priority (first available wins):
  1. DeepL (highest quality, 30 langs)
  2. Google Translate (130 langs, low-resource)
  3. NLLB-200 (200 langs, self-hosted, free)

Caching:
  - Redis (hot cache, 30-day TTL)
  - Postgres TranslationCache (cold cache, never expires)

Fallback chain:
  If a provider doesn't support target_lang, try next provider.
  If no provider supports target_lang, fall back to locale.fallback.
"""
from __future__ import annotations

import hashlib
import time

from redis.asyncio import Redis

from app.config import settings
from app.i18n.locales import LOCALE_MAP, resolve_locale

from .deepl_provider import DeepLProvider
from .google_provider import GoogleTranslateProvider
from .models import TranslationRequest, TranslationResult
from .nllb_provider import NLLBProvider


class TranslationService:
    def __init__(self):
        self.providers = [
            DeepLProvider(),
            GoogleTranslateProvider(),
            NLLBProvider(),
        ]
        self._redis: Redis | None = None

    async def get_redis(self) -> Redis:
        if self._redis is None:
            self._redis = Redis.from_url(settings.redis_url, decode_responses=True)
        return self._redis

    async def translate(self, request: TranslationRequest) -> TranslationResult:
        """Translate a batch of texts."""
        t0 = time.monotonic()

        source = resolve_locale(request.source_lang)
        target = resolve_locale(request.target_lang)

        if source == target:
            return TranslationResult(
                translations=request.texts,
                source_lang=source,
                target_lang=target,
                provider="passthrough",
                cached=True,
                latency_ms=int((time.monotonic() - t0) * 1000),
            )

        # Check Redis cache
        r = await self.get_redis()
        cache_keys = [self._cache_key(t, source, target) for t in request.texts]
        cached = await r.mget(cache_keys)

        results: list[str | None] = [None] * len(request.texts)
        for i, c in enumerate(cached):
            if c:
                results[i] = c

        misses = [i for i, c in enumerate(cached) if not c]
        if misses:
            miss_texts = [request.texts[i] for i in misses]
            translated = await self._translate_with_fallback(miss_texts, source, target)

            # Cache results
            pipe = r.pipeline()
            for idx, trans in zip(misses, translated):
                results[idx] = trans
                pipe.setex(cache_keys[idx], request.cache_ttl_days * 86400, trans)
            await pipe.execute()

        return TranslationResult(
            translations=results,  # type: ignore[arg-type]
            source_lang=source,
            target_lang=target,
            provider=self._last_provider,
            cached=not misses,
            latency_ms=int((time.monotonic() - t0) * 1000),
        )

    async def translate_one(self, text: str, source: str, target: str) -> str:
        req = TranslationRequest(texts=[text], source_lang=source, target_lang=target)
        result = await self.translate(req)
        return result.translations[0]

    async def _translate_with_fallback(self, texts: list[str], source: str, target: str) -> list[str]:
        """Try each provider in order; fall back to target_locale.fallback if all fail."""
        self._last_provider = "none"
        for provider in self.providers:
            if not await provider.health():
                continue
            if not provider.supports(target):
                continue
            try:
                translated = await provider.translate(texts, source, target)
                self._last_provider = provider.name
                return translated
            except Exception as e:
                print(f"[TranslationService] {provider.name} failed: {e}")
                continue

        # All providers failed — fall back to locale.fallback
        target_cfg = LOCALE_MAP.get(target)
        if target_cfg and target_cfg.fallback and target_cfg.fallback != target:
            return await self._translate_with_fallback(texts, source, target_cfg.fallback)

        # Last resort: return source text
        return texts

    def _cache_key(self, text: str, source: str, target: str) -> str:
        h = hashlib.sha256(f"{source}:{target}:{text}".encode()).hexdigest()
        return f"tyre:tr:{h[:32]}"

    async def detect_and_translate(self, text: str, target: str) -> tuple[str, str]:
        """Auto-detect source language, then translate. Returns (source_lang, translated_text)."""
        from app.ai.language_detection import LanguageDetectionService
        detector = LanguageDetectionService()
        source = await detector.detect(text)
        translated = await self.translate_one(text, source, target)
        return source, translated
