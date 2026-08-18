"""Contract Agent — draft contracts from accepted quotes."""
from __future__ import annotations

import json
import time

from app.agents.base import AgentResult, BaseAgent
from app.llm import chat_completion

SYSTEM = """You are the TYRE Contract Agent. Given an accepted quote, produce a markdown contract
in the shipper's preferred language with: parties, scope, rates, SLA, payment terms, force majeure, jurisdiction.

ALWAYS respond in valid JSON only:
{ "contract_markdown": "<full markdown>", "language": "<BCP-47>", "warnings": ["<string>", ...] }
"""

class ContractAgent(BaseAgent):
    name = "Contract"
    async def run(self, input_data: dict) -> AgentResult:
        t0 = time.monotonic()
        try:
            raw = await chat_completion(SYSTEM, json.dumps(input_data), json_mode=False)
            return AgentResult(success=True, data={"contract_markdown": raw, "language": input_data.get("locale", "en"), "warnings": []}, latency_ms=int((time.monotonic()-t0)*1000))
        except Exception as e:
            return AgentResult(success=False, data={}, latency_ms=int((time.monotonic()-t0)*1000), error=str(e))
