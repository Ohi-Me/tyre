"""
TYRE AI Layer — Multilingual + Voice services.

Modules:
  - translation/         : NLLB-200, Google, DeepL providers + caching
  - speech/              : STT (Whisper/Deepgram/Google) + TTS (OpenAI/ElevenLabs/Azure/Google)
  - language_detection/  : fastText + Whisper auto-detect
  - transliteration/     : AI4Bharat IndicTrans2 + Google Transliteration
  - localization/        : Locale-aware formatting (currency, dates, numbers, plurals)
  - conversation/        : Cross-language conversation sync engine

Provider abstraction: every service has a base interface + multiple providers.
Switch providers via env var without changing business logic.
"""

from .conversation import ConversationSyncEngine
from .language_detection import LanguageDetectionService
from .localization import LocalizationService
from .speech import STTService, TTSService
from .translation import TranslationService
from .transliteration import TransliterationService

__all__ = [
    "TranslationService",
    "STTService",
    "TTSService",
    "LanguageDetectionService",
    "TransliterationService",
    "LocalizationService",
    "ConversationSyncEngine",
]
