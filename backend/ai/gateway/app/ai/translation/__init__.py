"""Translation service — provider abstraction layer."""
from .deepl_provider import DeepLProvider
from .google_provider import GoogleTranslateProvider
from .models import TranslationRequest, TranslationResult
from .nllb_provider import NLLBProvider
from .service import TranslationService

__all__ = [
    "TranslationService",
    "TranslationRequest",
    "TranslationResult",
    "NLLBProvider",
    "GoogleTranslateProvider",
    "DeepLProvider",
]
