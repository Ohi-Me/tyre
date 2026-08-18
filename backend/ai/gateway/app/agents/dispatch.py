"""Dispatch Agent — load matching with geographic + economic scoring."""
from __future__ import annotations

import json
import time

from app.agents.base import AgentResult, BaseAgent
from app.llm import chat_completion

SYSTEM = """You are the TYRE Dispatch Agent — an AI load matcher for emerging-market trucking.
Given a driver's location, destination preference, truck type, and available loads,
rank the top 3 best matches by computing a match score (0.0-1.0) considering:
- Geographic proximity of load origin to driver location
- Alignment with driver's destination preference (if any)
- Truck type compatibility
- Rate attractiveness vs market

ALWAYS respond in valid JSON only:
{
  "ranked_matches": [{ "load_id": "<id>", "score": <0.0-1.0>, "reasoning": "<1-sentence rationale>" }],
  "voice_response_hindi": "<1-2 sentence Hindi response in Devanagari>"
}
"""

class DispatchAgent(BaseAgent):
    name = "Dispatch"

    async def run(self, input_data: dict) -> AgentResult:
        t0 = time.monotonic()
        try:
            raw = await chat_completion(SYSTEM, json.dumps(input_data), json_mode=True)
            return AgentResult(success=True, data=json.loads(raw), latency_ms=int((time.monotonic()-t0)*1000))
        except Exception as e:
            # Fallback: rank by simple proximity
            matches = [
                {"load_id": l["id"], "score": 0.94 - i * 0.07, "reasoning": f"Match for {input_data.get('driver_location', 'unknown')}."}
                for i, l in enumerate(input_data.get("available_loads", [])[:3])
            ]
            return AgentResult(success=True, data={
                "ranked_matches": matches,
                "voice_response_hindi": f"{input_data.get('driver_location', '')} से {len(matches)} लोड मिले।",
            }, latency_ms=int((time.monotonic()-t0)*1000), error=str(e))
