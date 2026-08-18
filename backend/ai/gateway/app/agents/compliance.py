"""Compliance Agent — region-specific regulatory automation."""
from __future__ import annotations

from app.agents.base import AgentResult, BaseAgent

SYSTEM = """You are the TYRE Compliance Agent — automate regulatory docs for emerging-market freight.
Region-specific actions:
- India: e-way bill auto-gen via NIC API, GSTIN verification, FASTag reconciliation
- Brazil: CT-e generation, CNPJ validation
- Mexico: CFDI digital invoice, RFC validation
- UAE/Gulf: VAT return integration
- Africa: TIN verification per country

ALWAYS respond in valid JSON only:
{ "status": "GENERATED" | "VERIFIED" | "REJECTED", "doc_number": "<id>", "doc_url": "<url or empty>", "next_steps": ["<step>", ...], "reasoning": "<sentence>" }
"""

class ComplianceAgent(BaseAgent):
    name = "Compliance"

    async def run(self, input_data: dict) -> AgentResult:
        # TYRE v1.1 item #11 — gated OFF for Y1.
        #
        # An e-way bill number is issued by NIC's e-way bill portal API
        # (https://ewaybillgst.gov.in/apirequest/), NOT by a language model. The previous
        # implementation asked an LLM to generate one and, on error, fabricated
        # `EWB-<timestamp>` — a number that looks real but is legally worthless and could
        # put a driver at a checkpost with an invalid document.
        #
        # This agent is Y2 scope per ARCHITECTURE.md §5.1 and must not be reachable from
        # the Y1 UI. Until the real NIC integration lands, every call returns NOT_AVAILABLE
        # instead of a hallucinated document.
        return AgentResult(
            success=False,
            data={
                "status": "NOT_AVAILABLE",
                "reason": "Compliance agent is Y2 scope — NIC e-way bill API integration pending.",
            },
            latency_ms=0,
            error="Y2_SCOPE",
        )
