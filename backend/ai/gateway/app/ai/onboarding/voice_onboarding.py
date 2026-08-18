"""Voice-first onboarding — Y1 H1 critical feature.

Reduces onboarding from 15 min (typing) to 2 min (voice).

How it works:
  Driver calls TYRE or sends WhatsApp voice note:
    "Main Ramesh hoon, Patna ka truck MH12AB1234, 12-chakka hai"

  AI extracts:
    - Driver name: Ramesh
    - Current location: Patna
    - Truck number: MH12AB1234
    - Truck type: 12-wheeler

  AI responds in driver's language:
    "Ramesh bhai, aapka truck MH12AB1234, 12-chakka, Patna —
     sab record ho gaya. Aadhaar, PAN, license upload karein.
     Phir ₹10,000 advance ke liye ready!"

  Driver uploads KYC docs via app or WhatsApp.
  Once verified, driver can search loads + receive advance.

Target: 2 minutes from voice note to verified driver.
"""
from __future__ import annotations

import time
from dataclasses import dataclass

from app.ai.language_detection import LanguageDetectionService
from app.ai.speech.models import STTRequest, TTSRequest
from app.ai.speech.stt import STTService
from app.ai.speech.tts import TTSService
from app.ai.translation import TranslationService
from app.ai.translation.models import TranslationRequest
from app.clients import bff_client
from app.llm import chat_completion


@dataclass
class OnboardingResult:
    driver_name: str
    driver_phone: str
    driver_locale: str
    detected_locale: str
    current_location: str | None
    truck_number: str | None
    truck_type: str | None
    truck_capacity_tons: float | None
    onboarding_id: str
    next_steps: list[str]
    voice_confirmation_url: str
    duration_seconds: int
    success: bool


class VoiceOnboardingService:
    """Voice-first driver onboarding."""

    def __init__(self):
        self.stt = STTService()
        self.tts = TTSService()
        self.translation = TranslationService()
        self.detection = LanguageDetectionService()

    async def onboard_from_voice(
        self,
        audio_base64: str | None = None,
        transcript: str | None = None,
        driver_phone: str = "",
        driver_locale_hint: str = "hi",
    ) -> OnboardingResult:
        """
        Onboard a driver from a single voice sample.

        Audio or transcript must be provided.
        Returns extracted driver info + next steps.
        """
        t0 = time.monotonic()

        # 1. STT (if audio) or use provided transcript
        if audio_base64:
            stt_result = await self.stt.transcribe(STTRequest(
                audio_base64=audio_base64,
                language_hint=driver_locale_hint,
            ))
            transcript = stt_result.transcript
            detected_locale = stt_result.detected_language
        else:
            detected_locale = await self.detection.detect(transcript or "")

        # 2. LLM extraction — pull structured fields from transcript
        extracted = await self._extract_entities(transcript, detected_locale)

        # 3. Generate confirmation message in driver's locale
        confirmation_text_en = self._build_confirmation_text_en(extracted, driver_phone)
        confirmation_localized = confirmation_text_en
        if detected_locale != "en":
            translated = await self.translation.translate(TranslationRequest(
                texts=[confirmation_text_en],
                source_lang="en",
                target_lang=detected_locale,
            ))
            confirmation_localized = translated.translations[0]

        # 4. TTS the confirmation
        tts_result = await self.tts.synthesize(TTSRequest(
            text=confirmation_localized,
            language=detected_locale,
        ))

        # 5. Persist onboarding record via the BFF — Phase 0 fix: this used to be
        # `# Real impl: db.voiceOnboarding.create` with no actual write. The onboarding_id
        # now comes back from a real upserted Postgres row when the BFF call succeeds;
        # falls back to a locally-generated id (clearly not a DB id) if the BFF is
        # unreachable, so the voice flow still completes for the driver either way.
        persisted = await bff_client.persist_voice_onboarding({
            "driver_name": extracted.get("driver_name", ""),
            "driver_phone": driver_phone,
            "driver_locale": driver_locale_hint,
            "truck_number": extracted.get("truck_number"),
            "truck_type": extracted.get("truck_type"),
            "truck_capacity_tons": extracted.get("truck_capacity_tons"),
            "voice_sample_url": f"https://tyre-voice.s3.ap-south-1.amazonaws.com/{driver_phone}.mp3" if audio_base64 else None,
            "stt_provider": getattr(self.stt, "active_provider_name", None),
            "detected_locale": detected_locale,
            "onboarding_duration_sec": int(time.monotonic() - t0),
        })
        onboarding_id = persisted["data"]["onboarding_id"] if persisted and persisted.get("success") else f"VON-LOCAL-{int(time.time())}"

        duration = int(time.monotonic() - t0)

        return OnboardingResult(
            driver_name=extracted.get("driver_name", ""),
            driver_phone=driver_phone,
            driver_locale=driver_locale_hint,
            detected_locale=detected_locale,
            current_location=extracted.get("current_location"),
            truck_number=extracted.get("truck_number"),
            truck_type=extracted.get("truck_type"),
            truck_capacity_tons=extracted.get("truck_capacity_tons"),
            onboarding_id=onboarding_id,
            next_steps=[
                "Upload Aadhaar photo",
                "Upload PAN photo",
                "Upload driving license photo",
                "Upload RC book photo",
                "Upload 6 truck photos (front, back, both sides, cargo, license plate)",
                "Verify UPI ID for advance payment",
            ],
            voice_confirmation_url=f"https://tyre-voice.s3.ap-south-1.amazonaws.com/{onboarding_id}.mp3",
            duration_seconds=duration,
            success=True,
        )

    async def _extract_entities(self, transcript: str, locale: str) -> dict:
        """Use LLM to extract structured driver info from voice transcript."""
        system = """You are the TYRE Voice Onboarding extractor.
Given a driver's voice transcript (in any Indian language), extract these fields:
  - driver_name: full name
  - current_location: city name in English
  - truck_number: Indian truck number plate (e.g., MH12AB1234)
  - truck_type: one of [12-wheeler, 16-wheeler, 10-wheeler, LCV-14ft, Container, Open-body, Reefer]
  - truck_capacity_tons: number in tons (12-wheeler ~ 18T, 16-wheeler ~ 25T, 10-wheeler ~ 12T)

Common patterns:
  - "Main Ramesh hoon, Patna ka truck MH12AB1234, 12-chakka hai"
  - "Ham Ranchi me hain, GJ05XY5678, 16 chakka"
  - "Naam Chhotu, Mumbai, KA05PQ9012, 10-wheeler"

ALWAYS respond in valid JSON only:
{
  "driver_name": "<string>",
  "current_location": "<English city name>",
  "truck_number": "<Indian plate format>",
  "truck_type": "<one of the listed types>",
  "truck_capacity_tons": <number>
}"""

        try:
            raw = await chat_completion(
                system, transcript, json_mode=True, temperature=0.1, max_tokens=512
            )
            import json
            return json.loads(raw)
        except Exception as e:
            print(f"[VoiceOnboarding] LLM extraction failed: {e}")
            # Rule-based fallback — pattern match
            return self._rule_based_extract(transcript)

    def _rule_based_extract(self, transcript: str) -> dict:
        """Fallback: regex-based extraction when LLM fails."""
        import re
        result = {
            "driver_name": "",
            "current_location": "",
            "truck_number": "",
            "truck_type": "12-wheeler",
            "truck_capacity_tons": 18.0,
        }

        # Indian plate pattern: 2 letters + 2 digits + 1-3 letters + 4 digits
        plate_match = re.search(r'\b([A-Z]{2}\d{1,2}[A-Z]{1,3}\d{4})\b', transcript.upper())
        if plate_match:
            result["truck_number"] = plate_match.group(1)

        # Truck type patterns
        if "16" in transcript and ("chakka" in transcript.lower() or "wheeler" in transcript.lower()):
            result["truck_type"] = "16-wheeler"
            result["truck_capacity_tons"] = 25.0
        elif "10" in transcript and ("chakka" in transcript.lower() or "wheeler" in transcript.lower()):
            result["truck_type"] = "10-wheeler"
            result["truck_capacity_tons"] = 12.0

        return result

    def _build_confirmation_text_en(self, extracted: dict, phone: str) -> str:
        """Build confirmation message in English (will be translated)."""
        return (
            f"Welcome to TYRE! Here's what I got: "
            f"Name: {extracted.get('driver_name', 'unknown')}. "
            f"Phone: {phone}. "
            f"Truck: {extracted.get('truck_number', 'unknown')}, "
            f"{extracted.get('truck_type', 'unknown')} "
            f"({extracted.get('truck_capacity_tons', 0)} tons). "
            f"Location: {extracted.get('current_location', 'unknown')}. "
            f"To start receiving loads and ₹10,000 advance, "
            f"please upload your Aadhaar, PAN, license, and RC book. "
            f"Then upload 6 photos of your truck. "
            f"It takes 5 minutes."
        )
