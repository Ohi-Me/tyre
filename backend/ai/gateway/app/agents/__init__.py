"""11 TYRE agents — each with deterministic fallback.

v3.2 wedge — only 4 agents are loaded in Y1 (Dispatch, Pricing, Fraud, Payment).
Other agents are kept on disk for Y2+ activation but not loaded by the orchestrator.

The Bridge agent (Week 2 of the WhatsApp↔Telegram bridge epic) is registered in
BRIDGE_AGENTS and used via direct `await BridgeAgent().run(...)` calls from the
WhatsApp driver bot, Telegram broker bot, and Payment agent — not via the
orchestrator, because it's a stateless event router, not an LLM-driven workflow.
"""
from .bridge import BridgeAgent  # Week 2 of WhatsApp↔Telegram bridge
from .compliance import ComplianceAgent  # Y2+
from .contract import ContractAgent  # Y2+
from .copilot import CopilotAgent  # Y2+
from .dispatch import DispatchAgent  # Y1
from .fleet import FleetAgent  # Y2+
from .fraud import FraudAgent  # Y1
from .negotiation import NegotiationAgent  # Y2+
from .payment import PaymentAgent  # Y1
from .pricing import PricingAgent  # Y1
from .route import RouteAgent  # Y2+

# v3.2 wedge — Y1 active agents only
Y1_AGENTS = {
    "Dispatch": DispatchAgent,
    "Pricing": PricingAgent,
    "Fraud": FraudAgent,
    "Payment": PaymentAgent,
}

# Bridge agent — used directly by bots + payment agent, not via orchestrator
BRIDGE_AGENTS = {
    "Bridge": BridgeAgent,
}

# Y2+ agents — kept for activation in Year 2+
Y2PLUS_AGENTS = {
    "Negotiation": NegotiationAgent,
    "Compliance": ComplianceAgent,
    "Contract": ContractAgent,
    "Route": RouteAgent,
    "Copilot": CopilotAgent,
    "Fleet": FleetAgent,
}

# Full registry — for Y2+ when all agents are needed
ALL_AGENTS = {**Y1_AGENTS, **BRIDGE_AGENTS, **Y2PLUS_AGENTS}
