"""Speech data models."""
from __future__ import annotations

from dataclasses import dataclass


@dataclass
class STTRequest:
    audio_base64: str | None = None       # raw audio (webm/wav/mp3)
    audio_url: str | None = None          # remote URL
    transcript_hint: str | None = None    # pre-transcribed (skips STT)
    language_hint: str | None = None      # BCP-47 hint
    enable_diarization: bool = False         # speaker separation
    enable_word_timestamps: bool = False


@dataclass
class STTResult:
    transcript: str
    detected_language: str       # BCP-47
    confidence: float
    provider: str
    segments: list[dict] = None  # word-level timestamps if enabled
    latency_ms: int = 0


@dataclass
class TTSRequest:
    text: str
    language: str                 # BCP-47
    voice_id: str | None = None
    speed: float = 1.0
    pitch: float = 0.0
    format: str = "mp3"           # mp3 | wav | ogg
    streaming: bool = False


@dataclass
class TTSResult:
    audio_base64: str
    format: str
    provider: str
    voice_id: str
    latency_ms: int = 0
