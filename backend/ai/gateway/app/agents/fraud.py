"""Fraud Agent — broker risk scoring."""
from __future__ import annotations

import json
import time

from app.agents.base import AgentResult, BaseAgent
from app.llm import chat_completion

SYSTEM = """You are the TYRE Fraud Agent — a risk assessment AI for emerging-market freight brokers.
Score 0-100 and recommend action:
- Unverified broker + tax ID issues: +30
- Each payment default: +15
- High volume with low history: +10
- Recent tax cancellation: +25

ALWAYS respond in valid JSON only:
{ "risk_score": <0-100>, "flags": ["<string>", ...], "recommendation": "APPROVE" | "MONITOR" | "INVESTIGATE" | "BLOCK", "reasoning": "<1-2 sentence explanation>" }
"""

class FraudAgent(BaseAgent):
    name = "Fraud"

    async def run(self, input_data: dict) -> AgentResult:
        t0 = time.monotonic()
        try:
            raw = await chat_completion(SYSTEM, json.dumps(input_data), json_mode=True)
            return AgentResult(success=True, data=json.loads(raw), latency_ms=int((time.monotonic()-t0)*1000))
        except Exception as e:
            risk = input_data.get("risk_score", 0)
            return AgentResult(success=True, data={
                "risk_score": risk,
                "flags": input_data.get("existing_flags", []),
                "recommendation": "BLOCK" if risk > 70 else "INVESTIGATE" if risk > 50 else "APPROVE",
                "reasoning": "Fallback: based on existing risk score.",
            }, latency_ms=int((time.monotonic()-t0)*1000), error=str(e))
