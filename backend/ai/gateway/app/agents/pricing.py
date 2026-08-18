"""Pricing Agent — region-aware rate calculation."""
from __future__ import annotations

import json
import time

from app.agents.base import AgentResult, BaseAgent
from app.llm import chat_completion
from app.regions import REGIONS

SYSTEM = """You are the TYRE Pricing Agent — an expert freight rate calculator for emerging markets.
Given trip details + region, compute a realistic rate range using local economics:
- Diesel price, mileage, toll, driver allowance, maintenance, misc — all region-specific.

min_safe_rate = total_cost * 1.08 (8% margin)
expected_rate = total_cost * 1.18 (18% margin)
premium_rate = total_cost * 1.30 (30% margin)

Round all rates to nearest 500 (or local equivalent).

ALWAYS respond in valid JSON only:
{
  "min_safe_rate": <number>,
  "expected_rate": <number>,
  "premium_rate": <number>,
  "cost_breakdown": { "fuel": <n>, "tolls": <n>, "driver_allowance": <n>, "maintenance": <n>, "misc": <n>, "total_cost": <n> },
  "reasoning": "<1-sentence summary>"
}
"""

class PricingAgent(BaseAgent):
    name = "Pricing"

    async def run(self, input_data: dict) -> AgentResult:
        t0 = time.monotonic()
        try:
            raw = await chat_completion(SYSTEM, json.dumps(input_data), json_mode=True)
            return AgentResult(success=True, data=json.loads(raw), latency_ms=int((time.monotonic()-t0)*1000))
        except Exception as e:
            return AgentResult(success=True, data=_rule_based(input_data), latency_ms=int((time.monotonic()-t0)*1000), error=str(e))


def _rule_based(input_data: dict) -> dict:
    region = REGIONS.get(input_data.get("region", "IN"), REGIONS["IN"])
    mileage = 3.5 if "HXL" in input_data["truck_type"] else 5.0 if "LCV" in input_data["truck_type"] else 4.0
    fuel = round((input_data["distance_km"] / mileage) * region["diesel_price_per_liter"])
    tolls = round(input_data["distance_km"] * region["toll_per_km"])
    driver = round((input_data["distance_km"] / 500) * region["driver_allowance_per_day"])
    maintenance = input_data["distance_km"] * 2
    misc = round((fuel + tolls + driver) * 0.05)
    total = fuel + tolls + driver + maintenance + misc
    return {
        "min_safe_rate": round(total * 1.08 / 500) * 500,
        "expected_rate": round(total * 1.18 / 500) * 500,
        "premium_rate": round(total * 1.30 / 500) * 500,
        "cost_breakdown": {"fuel": fuel, "tolls": tolls, "driver_allowance": driver, "maintenance": maintenance, "misc": misc, "total_cost": total},
        "reasoning": f"Fallback: diesel ₹{region['diesel_price_per_liter']}/L, mileage {mileage}km/L, toll ₹{region['toll_per_km']}/km.",
    }
