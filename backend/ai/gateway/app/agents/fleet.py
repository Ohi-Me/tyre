"""Fleet Agent — utilization + predictive maintenance."""
from __future__ import annotations

import json
import time

from app.agents.base import AgentResult, BaseAgent
from app.llm import chat_completion

SYSTEM = """You are the TYRE Fleet Agent. Given truck telemetry (km driven, fuel efficiency, last maintenance, breakdown signals),
predict breakdown risk and recommend maintenance schedule.

ALWAYS respond in valid JSON only:
{ "predicted_breakdown_risk": "LOW" | "MEDIUM" | "HIGH", "next_maintenance_km": <n>, "reasoning": "<sentence>", "recommended_actions": ["<string>", ...] }
"""

class FleetAgent(BaseAgent):
    name = "Fleet"
    async def run(self, input_data: dict) -> AgentResult:
        t0 = time.monotonic()
        try:
            raw = await chat_completion(SYSTEM, json.dumps(input_data), json_mode=True)
            return AgentResult(success=True, data=json.loads(raw), latency_ms=int((time.monotonic()-t0)*1000))
        except Exception as e:
            return AgentResult(success=True, data={
                "predicted_breakdown_risk": "LOW",
                "next_maintenance_km": 10000,
                "reasoning": "Fallback: routine schedule.",
                "recommended_actions": ["Schedule oil change at next 5,000 km"],
            }, latency_ms=int((time.monotonic()-t0)*1000), error=str(e))
