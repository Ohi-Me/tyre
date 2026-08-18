"""Translation data models."""
from __future__ import annotations

from dataclasses import dataclass


@dataclass
class TranslationRequest:
    texts: list[str]
    source_lang: str          # BCP-47
    target_lang: str          # BCP-47
    domain: str = "general"   # general | freight | legal | finance
    cache_ttl_days: int = 30


@dataclass
class TranslationResult:
    translations: list[str]
    source_lang: str
    target_lang: str
    provider: str
    cached: bool = False
    confidence: float = 1.0
    latency_ms: int = 0
