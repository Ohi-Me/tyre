"""Negotiation Agent — game-theory counter-offers."""
from __future__ import annotations

import json

from app.agents.base import AgentResult, BaseAgent
from app.i18n.translation import translate_batch
from app.llm import chat_completion

SYSTEM_PROMPT = """You are the TYRE Negotiation Agent — an AI freight broker operating in emerging markets.
You negotiate on behalf of truck drivers, countering broker offers using game theory and local freight economics.

Rules:
- Always factor in diesel price, toll, driver allowance, maintenance for the region.
- Minimum acceptable = ai_min_safe_rate (covers fuel + toll + driver + 8% margin).
- Expected market rate = ai_expected_rate.
- If broker_offer >= ai_min_safe_rate AND round >= 2: ACCEPT.
- If broker_offer < 80% of ai_min_safe_rate AND round >= 3: REJECT.
- Otherwise: COUNTER at a rate between broker_offer and ai_expected_rate, escalating down each round.
- Round 1 counter margin: ~10% above broker offer. Round 2: ~6%. Round 3: ~3%.

ALWAYS respond in valid JSON only:
{
  "decision": "ACCEPTED" | "COUNTER" | "REJECTED",
  "counter_offer": <number, rounded to nearest 500, 0 if accepted/rejected>,
  "message_hindi": "<message in Devanagari Hindi, conversational truck-driver tone, 1-2 sentences>",
  "reasoning": "<English 1-sentence reasoning>",
  "confidence": <0.0-1.0>
}
"""


class NegotiationAgent(BaseAgent):
    name = "Negotiation"

    async def run(self, input_data: dict) -> AgentResult:
        import time
        t0 = time.monotonic()

        try:
            raw = await chat_completion(SYSTEM_PROMPT, json.dumps(input_data), json_mode=True)
            parsed = json.loads(raw)
            result = {
                "decision": parsed["decision"],
                "counter_offer": parsed["counter_offer"],
                "message_hindi": parsed["message_hindi"],
                "reasoning": parsed.get("reasoning", ""),
                "confidence": float(parsed.get("confidence", 0.85)),
            }

            # Translate message to driver's preferred locale
            driver_locale = input_data.get("driver_locale", "hi")
            if driver_locale not in ("hi", "en"):
                translated = await translate_batch([result["message_hindi"]], "hi", driver_locale)
                result["message_translated"] = translated[0]

            return AgentResult(success=True, data=result, latency_ms=int((time.monotonic() - t0) * 1000))
        except Exception as e:
            return AgentResult(
                success=True,  # graceful degradation
                data=_rule_based(input_data),
                latency_ms=int((time.monotonic() - t0) * 1000),
                error=str(e),
            )


def _rule_based(input_data: dict) -> dict:
    broker_offer = input_data["broker_offer"]
    ai_min_safe = input_data["ai_min_safe_rate"]
    round_num = input_data["round"]
    if broker_offer >= ai_min_safe and round_num >= 2:
        return {
            "decision": "ACCEPTED",
            "counter_offer": broker_offer,
            "message_hindi": f"ठीक है भाई, ₹{int(broker_offer):,} में मंज़ूर है।",
            "reasoning": "Broker offer meets min safe rate.",
            "confidence": 0.88,
        }
    if broker_offer < ai_min_safe * 0.8 and round_num >= 3:
        return {
            "decision": "REJECTED", "counter_offer": 0,
            "message_hindi": "भाई, आपका रेट बहुत कम है।",
            "reasoning": "Below 80% of min after 3 rounds.",
            "confidence": 0.82,
        }
    margin = 0.1 if round_num == 1 else 0.06 if round_num == 2 else 0.03
    counter = round(broker_offer * (1 + margin) / 500) * 500
    return {
        "decision": "COUNTER", "counter_offer": counter,
        "message_hindi": f"भाई, ₹{counter:,} से कम में नहीं होगा।",
        "reasoning": f"Countering at {margin*100}% above offer (round {round_num}).",
        "confidence": 0.85,
    }
