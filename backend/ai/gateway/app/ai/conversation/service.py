"""
ConversationSyncEngine — keeps cross-language conversations synchronized.

Use case:
  Driver (Angika) → speaks "हम रांची में हैं, कोलकाता जाना है"
                  ↓
  System detects Angika, translates to English (canonical)
                  ↓
  Broker (Odia) receives in Odia: "ମୁଁ ରାଞ୍ଚିରେ ଅଛି, କଲିକାତା ଯିବାକୁ ଚାହେଁ"
                  ↓
  Shipper (Kannada) receives in Kannada: "ನಾನು ರಾಂಚಿಯಲ್ಲಿ ಇದ್ದೇನೆ, ಕೋಲ್ಕತಾ ಹೋಗಬೇಕು"
                  ↓
  Operator (English) receives in English: "I'm in Ranchi, want to go to Kolkata"

All participants see the conversation in their own language, in real-time,
without manually translating anything. This is the core product thesis.
"""
from __future__ import annotations

import asyncio
import time
import uuid

from app.ai.language_detection import LanguageDetectionService
from app.ai.speech import STTService, TTSService
from app.ai.speech.models import STTRequest, TTSRequest
from app.ai.translation import TranslationRequest, TranslationService
from app.ai.transliteration import TransliterationService

from .models import ConversationMessage, ConversationParticipant


class ConversationSyncEngine:
    """
    Synchronizes a conversation between participants who speak different languages.

    For each message:
      1. Detect source language (if not provided)
      2. Translate to each recipient's preferred language (parallel)
      3. Transliterate to Latin for ops/audit
      4. Synthesize TTS audio for each recipient (if voice-enabled, parallel)
      5. Return the synchronized message bundle
    """

    def __init__(self):
        self.translation = TranslationService()
        self.transliteration = TransliterationService()
        self.stt = STTService()
        self.tts = TTSService()
        self.detection = LanguageDetectionService()

    async def process_message(
        self,
        conversation_id: str,
        sender: ConversationParticipant,
        recipients: list[ConversationParticipant],
        text: str | None = None,
        audio_base64: str | None = None,
    ) -> ConversationMessage:
        """
        Process a new conversation message:
        - If audio provided: STT → detect language
        - Translate to each recipient's locale (parallel)
        - Transliterate to Latin for each (parallel)
        - TTS for each voice-enabled recipient (parallel)

        Returns a ConversationMessage with all language variants.
        """
        t0 = time.monotonic()
        msg_id = str(uuid.uuid4())
        timestamp = str(int(time.time()))

        # ── Step 1: Get text + detect language ──────────────────────
        original_text, original_locale = await self._extract_text_and_locale(
            text, audio_base64, sender.preferred_locale
        )

        # ── Step 2: Collect unique target locales ───────────────────
        # Always include English as the canonical/ops locale
        target_locales = list(set([r.preferred_locale for r in recipients] + ["en"]))
        if original_locale in target_locales:
            target_locales.remove(original_locale)  # no need to translate to source

        # ── Step 3: Translate to all target locales in parallel ─────
        translations = {original_locale: original_text}
        if target_locales:
            translation_tasks = [
                self.translation.translate(TranslationRequest(
                    texts=[original_text],
                    source_lang=original_locale,
                    target_lang=t,
                ))
                for t in target_locales
            ]
            results = await asyncio.gather(*translation_tasks, return_exceptions=True)
            for target, result in zip(target_locales, results):
                if isinstance(result, Exception):
                    print(f"[ConversationSync] translation to {target} failed: {result}")
                    translations[target] = original_text  # fallback
                else:
                    translations[target] = result.translations[0]

        # ── Step 4: Transliterate to Latin for each non-Latin locale ─
        transliterations = {}
        translit_tasks = []
        translit_targets = []
        for locale, text in translations.items():
            if locale not in ("en",) and not locale.startswith("en-"):
                translit_tasks.append(self.transliteration.to_latin(text, locale.split("-")[0]))
                translit_targets.append(locale)
        if translit_tasks:
            results = await asyncio.gather(*translit_tasks, return_exceptions=True)
            for locale, result in zip(translit_targets, results):
                if not isinstance(result, Exception):
                    transliterations[locale] = result

        # ── Step 5: TTS for voice-enabled recipients (parallel) ─────
        audio_per_locale = {}
        voice_recipients = [r for r in recipients if r.voice_enabled]
        if voice_recipients:
            voice_locales = list(set(r.preferred_locale for r in voice_recipients))
            tts_tasks = [
                self.tts.synthesize(TTSRequest(
                    text=translations.get(l, original_text),
                    language=l,
                ))
                for l in voice_locales
            ]
            results = await asyncio.gather(*tts_tasks, return_exceptions=True)
            for locale, result in zip(voice_locales, results):
                if not isinstance(result, Exception) and result.audio_base64:
                    audio_per_locale[locale] = result.audio_base64

        # ── Step 6: Build message ───────────────────────────────────
        return ConversationMessage(
            id=msg_id,
            conversation_id=conversation_id,
            sender=sender,
            original_text=original_text,
            original_locale=original_locale,
            original_audio_base64=audio_base64,
            translations=translations,
            transliterations=transliterations,
            audio_per_locale=audio_per_locale,
            timestamp=timestamp,
        )

    async def _extract_text_and_locale(
        self,
        text: str | None,
        audio_base64: str | None,
        hint_locale: str,
    ) -> tuple[str, str]:
        """Returns (text, detected_locale)."""
        if audio_base64:
            # STT with auto-detect
            stt_result = await self.stt.transcribe(STTRequest(
                audio_base64=audio_base64,
                language_hint=hint_locale,
            ))
            return stt_result.transcript, stt_result.detected_language
        elif text:
            # Detect language from text
            detected = await self.detection.detect(text)
            return text, detected
        else:
            raise ValueError("Either text or audio_base64 must be provided")

    async def process_voice_command(
        self,
        sender: ConversationParticipant,
        audio_base64: str,
        recipients: list[ConversationParticipant],
        conversation_id: str | None = None,
    ) -> ConversationMessage:
        """Convenience method for voice-first input."""
        return await self.process_message(
            conversation_id=conversation_id or str(uuid.uuid4()),
            sender=sender,
            recipients=recipients,
            audio_base64=audio_base64,
        )
