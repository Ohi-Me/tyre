"""Copilot Agent — operator-facing multilingual chat."""
from __future__ import annotations

import time

from app.agents.base import AgentResult, BaseAgent
from app.i18n.translation import translate_batch
from app.llm import chat_completion

SYSTEM = """You are TYRE Copilot — the AI assistant for emerging-market logistics operators.
You help dispatchers, brokers, shippers, and fleet managers with real-time insights about loads, trucks, pricing, fraud, and negotiations.
Be concise and actionable. 2-4 sentences max. Reply in English; the caller will translate.
Sprinkle in local language phrases naturally when contextually appropriate.
"""

class CopilotAgent(BaseAgent):
    name = "Copilot"

    async def run(self, input_data: dict) -> AgentResult:
        t0 = time.monotonic()
        user_locale = input_data.get("user_locale", "en")
        history = input_data.get("history", [])
        message = input_data["message"]

        try:
            # Compose prompt with history
            user_prompt = f"History: {history[-6:]}\nUser ({user_locale}): {message}"
            reply_english = await chat_completion(SYSTEM, user_prompt, json_mode=False, temperature=0.5, max_tokens=512)

            # Translate to user's locale if not English
            reply_localized = reply_english
            if user_locale != "en":
                translated = await translate_batch([reply_english], "en", user_locale)
                reply_localized = translated[0]

            return AgentResult(success=True, data={
                "reply": reply_localized,
                "reply_english": reply_english,
                "timestamp": int(time.time()),
            }, latency_ms=int((time.monotonic()-t0)*1000))
        except Exception as e:
            return AgentResult(success=False, data={"reply": "Sorry, I couldn't process that.", "timestamp": int(time.time())}, latency_ms=int((time.monotonic()-t0)*1000), error=str(e))
