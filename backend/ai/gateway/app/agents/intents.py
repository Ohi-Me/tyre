"""Voice intent extraction — multi-language NLU."""
from __future__ import annotations

import json
from dataclasses import dataclass
from enum import Enum

from app.llm import chat_completion


class VoiceIntent(str, Enum):
    FIND_LOAD = "FIND_LOAD"
    CHECK_RATE = "CHECK_RATE"
    REPORT_ISSUE = "REPORT_ISSUE"
    NAVIGATE = "NAVIGATE"
    STATUS = "STATUS"
    ACCEPT_LOAD = "ACCEPT_LOAD"
    REQUEST_ADVANCE = "REQUEST_ADVANCE"
    UPLOAD_POD = "UPLOAD_POD"


@dataclass
class Intent:
    intent: VoiceIntent
    current_location: str
    destination: str
    vehicle_type: str
    language: str
    transcript_original: str
    transcript_english: str
    confidence: float
    detected_locale: str


INTENT_SYSTEM_PROMPT = """You are the TYRE Voice Intent Extractor for emerging-market trucking.
Given an English transcript from a truck driver (translated from their native language), extract structured intent.

Common patterns (Hindi):
- "I am in Patna, want to go to Delhi, 12-wheeler" → FIND_LOAD, location=Patna, destination=Delhi, vehicle=12-wheeler
- "What will the rate be?" → CHECK_RATE
- "Truck is broken" → REPORT_ISSUE
- "Accept this load" → ACCEPT_LOAD
- "Where am I?" → STATUS
- "Upload POD" → UPLOAD_POD
- "Need advance" → REQUEST_ADVANCE

ALWAYS respond in valid JSON only:
{
  "intent": "FIND_LOAD" | "CHECK_RATE" | "REPORT_ISSUE" | "NAVIGATE" | "STATUS" | "ACCEPT_LOAD" | "REQUEST_ADVANCE" | "UPLOAD_POD",
  "current_location": "<English city name>",
  "destination": "<English city name or empty>",
  "vehicle_type": "<e.g. 12-wheeler, 16-wheeler, LCV-14ft>",
  "confidence": <0.0-1.0>
}
"""


async def extract_intent(
    transcript_english: str,
    transcript_original: str,
    detected_locale: str,
    intent_hint: str | None = None,
) -> Intent:
    user_prompt = f"Transcript: {transcript_english}"
    if intent_hint:
        user_prompt += f"\nHint: most likely intent is {intent_hint}"

    try:
        raw = await chat_completion(INTENT_SYSTEM_PROMPT, user_prompt, json_mode=True)
        parsed = json.loads(raw)
        return Intent(
            intent=VoiceIntent(parsed["intent"]),
            current_location=parsed.get("current_location", ""),
            destination=parsed.get("destination", ""),
            vehicle_type=parsed.get("vehicle_type", "12-wheeler"),
            language=detected_locale,
            transcript_original=transcript_original,
            transcript_english=transcript_english,
            confidence=float(parsed.get("confidence", 0.9)),
            detected_locale=detected_locale,
        )
    except Exception:
        # Rule-based fallback
        return _rule_based_intent(transcript_english, transcript_original, detected_locale)


def _rule_based_intent(transcript_english: str, transcript_original: str, locale: str) -> Intent:
    text = (transcript_english or "").lower()
    if any(w in text for w in ["accept", "load"]):
        intent = VoiceIntent.ACCEPT_LOAD if "accept" in text else VoiceIntent.FIND_LOAD
    elif "rate" in text or "price" in text:
        intent = VoiceIntent.CHECK_RATE
    elif "broken" in text or "issue" in text or "problem" in text:
        intent = VoiceIntent.REPORT_ISSUE
    elif "where" in text:
        intent = VoiceIntent.STATUS
    elif "pod" in text or "proof" in text:
        intent = VoiceIntent.UPLOAD_POD
    elif "advance" in text:
        intent = VoiceIntent.REQUEST_ADVANCE
    else:
        intent = VoiceIntent.FIND_LOAD
    return Intent(
        intent=intent, current_location="", destination="", vehicle_type="12-wheeler",
        language=locale, transcript_original=transcript_original, transcript_english=transcript_english,
        confidence=0.7, detected_locale=locale,
    )
