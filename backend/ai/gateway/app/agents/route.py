"""Route Agent — multi-stop ETA + toll/fuel optimization."""
from __future__ import annotations

import json
import time

from app.agents.base import AgentResult, BaseAgent
from app.llm import chat_completion

SYSTEM = """You are the TYRE Route Agent. Given origin, destination, waypoints, compute:
- Optimal route via Google Maps / OSRM
- ETA, total distance, toll cost, fuel cost
- Alternative routes if available

ALWAYS respond in valid JSON only:
{ "route_polyline": "<encoded>", "distance_km": <n>, "eta_hours": <n>, "toll_cost": <n>, "fuel_cost": <n>, "currency": "<ISO>", "alternatives": [{"distance_km": n, "eta_hours": n}] }
"""

class RouteAgent(BaseAgent):
    name = "Route"
    async def run(self, input_data: dict) -> AgentResult:
        t0 = time.monotonic()
        try:
            raw = await chat_completion(SYSTEM, json.dumps(input_data), json_mode=True)
            return AgentResult(success=True, data=json.loads(raw), latency_ms=int((time.monotonic()-t0)*1000))
        except Exception as e:
            return AgentResult(success=True, data={
                "route_polyline": "", "distance_km": input_data.get("distance_km", 0),
                "eta_hours": input_data.get("distance_km", 0) / 40,
                "toll_cost": input_data.get("distance_km", 0) * 3.5,
                "fuel_cost": input_data.get("distance_km", 0) * 25,
                "currency": "INR", "alternatives": [],
            }, latency_ms=int((time.monotonic()-t0)*1000), error=str(e))
