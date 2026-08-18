"""Language detection service."""
from .fasttext_provider import FastTextProvider
from .service import LanguageDetectionService
from .whisper_detect_provider import WhisperDetectProvider

__all__ = ["LanguageDetectionService", "FastTextProvider", "WhisperDetectProvider"]
