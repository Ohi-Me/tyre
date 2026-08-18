"""Orchestrator — v3.2 wedge.

Y1: only 4 agents loaded (Dispatch, Pricing, Fraud, Payment).
Y2+: all 10 agents activated by setting TYRE_AGENT_TIER=ALL.
"""
from __future__ import annotations

import os

import structlog

from app.agents import Y1_AGENTS, Y2PLUS_AGENTS

log = structlog.get_logger()


class Orchestrator:
    """Coordinates multi-agent execution."""

    def __init__(self):
        tier = os.getenv("TYRE_AGENT_TIER", "Y1").upper()
        if tier == "ALL":
            from app.agents import ALL_AGENTS
            agents_registry = ALL_AGENTS
            log.info("orchestrator.init", tier="ALL", agents=list(agents_registry.keys()))
        else:
            agents_registry = Y1_AGENTS
            log.info("orchestrator.init", tier="Y1", agents=list(agents_registry.keys()),
                     y2plus_available=list(Y2PLUS_AGENTS.keys()))

        self.agents = {name: cls() for name, cls in agents_registry.items()}

    def start(self):
        log.info("orchestrator.start", agents=list(self.agents.keys()))

    def stop(self):
        log.info("orchestrator.stop")

    async def run_agent(self, name: str, input_data: dict) -> dict:
        agent = self.agents.get(name)
        if not agent:
            available = list(self.agents.keys())
            raise ValueError(f"Unknown agent: {name}. Available: {available}")
        result = await agent.safe_run(input_data)
        return {
            "success": result.success,
            "data": result.data,
            "latency_ms": result.latency_ms,
            "error": result.error,
        }
