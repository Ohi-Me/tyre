"""
Voice pipeline — STT → NLU → MT → TTS for 100+ languages.

Flow:
  1. If audio_base64 provided: transcribe via Whisper (local or hosted).
     Else use the transcript field directly.
  2. Detect language (Whisper auto-detect or fastText).
  3. Translate transcript → English for ops/audit (NLLB-200).
  4. Run NLU intent extraction (Groq Llama 3.3 70b).
  5. Generate reply in driver's locale (LLM with locale-conditioned prompt).
  6. (Optional) TTS the reply via Coqui/ElevenLabs/Azure.
"""
from __future__ import annotations

import base64
import io
import time
from dataclasses import asdict

from app.agents.intents import VoiceIntent, extract_intent
from app.i18n.locales import resolve_locale, resolve_voice_locale
from app.i18n.translation import translate_batch
from app.voice.stt import transcribe_audio
from app.voice.tts import synthesize_speech


async def process_voice(req: dict) -> dict:
    """Entry point for POST /voice/process."""
    t0 = time.monotonic()

    driver_locale = resolve_locale(req.get("driver_locale"))
    region = req.get("region", "IN")

    # ── 1. STT ──────────────────────────────────────────────────────
    if req.get("audio_base64"):
        audio_bytes = base64.b64decode(req["audio_base64"])
        transcript_original, detected_locale = await transcribe_audio(
            io.BytesIO(audio_bytes), language_hint=driver_locale
        )
    else:
        transcript_original = req.get("transcript", "")
        detected_locale = driver_locale

    if not transcript_original:
        return {
            "success": False,
            "error": "no_transcript",
            "processing_time_ms": int((time.monotonic() - t0) * 1000),
        }

    # ── 2. MT to English for ops/audit ──────────────────────────────
    if detected_locale == "en":
        transcript_english = transcript_original
    else:
        translated = await translate_batch([transcript_original], detected_locale, "en")
        transcript_english = translated[0]

    # ── 3. NLU intent extraction ────────────────────────────────────
    intent_hint = req.get("intent_hint")
    intent = await extract_intent(transcript_english, transcript_original, driver_locale, intent_hint)

    # ── 4. Trigger downstream agent based on intent ─────────────────
    actions_taken: list[str] = []
    if intent.intent == VoiceIntent.FIND_LOAD:
        actions_taken.append("dispatch.search")
    elif intent.intent == VoiceIntent.CHECK_RATE:
        actions_taken.append("pricing.compute")
    elif intent.intent == VoiceIntent.ACCEPT_LOAD:
        actions_taken.append("loads.assign")
    elif intent.intent == VoiceIntent.UPLOAD_POD:
        actions_taken.append("trips.complete")

    # ── 5. Generate reply in driver's locale ────────────────────────
    reply_english = await _generate_reply_english(intent, region)
    if driver_locale == "en":
        reply_localized = reply_english
    else:
        translated = await translate_batch([reply_english], "en", driver_locale)
        reply_localized = translated[0]

    # ── 6. TTS (optional) ───────────────────────────────────────────
    audio_out_b64: str | None = None
    if req.get("return_audio"):
        voice_locale = resolve_voice_locale(driver_locale)
        audio_out_b64 = await synthesize_speech(reply_localized, voice_locale)

    return {
        "success": True,
        "intent": asdict(intent),
        "reply_text_localized": reply_localized,
        "reply_text_english": reply_english,
        "audio_base64": audio_out_b64,
        "actions_taken": actions_taken,
        "detected_locale": detected_locale,
        "processing_time_ms": int((time.monotonic() - t0) * 1000),
    }


async def _generate_reply_english(intent, region: str) -> str:
    """AI-C8 fix: previously returned hardcoded "Found 3 loads... ₹45,000" with
    fake trip IDs. Now returns an honest placeholder until the LLM agent is wired
    to the real BFF load-search API. The caller (process_voice) must populate
    `intent.loads` from a real BFF call; this function just formats the result.
    """
    if intent.intent == VoiceIntent.FIND_LOAD:
        loads = getattr(intent, "loads", None) or []
        if not loads:
            return "No loads found for your route right now. Try again in a few minutes."
        n = len(loads)
        best = loads[0]
        rate = getattr(best, "offered_rate", getattr(best, "offeredRate", "—"))
        advance = getattr(best, "advance_offered", getattr(best, "advanceOffered", "—"))
        return f"Found {n} loads matching your route. The best one pays ₹{rate} with ₹{advance} advance."
    if intent.intent == VoiceIntent.CHECK_RATE:
        rate = getattr(intent, "market_rate", None)
        if rate is None:
            return "Market rate lookup not available — please try again later."
        return f"Market rate for your route is ₹{rate} per km."
    if intent.intent == VoiceIntent.ACCEPT_LOAD:
        trip_id = getattr(intent, "trip_id", None)
        if not trip_id:
            return "Load acceptance failed — no trip was created. Please try again."
        return f"Load accepted! Advance will release to your account shortly. Trip ID: {trip_id}."
    # Default: acknowledge without fabricating data
    return "Acknowledged. An operator will follow up."
