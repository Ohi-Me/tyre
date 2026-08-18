"""
Test the orchestrator.
v3.2: only 4 Y1 agents loaded by default.

Week 2 of the WhatsApp↔Telegram bridge added BridgeAgent to ALL_AGENTS (under
BRIDGE_AGENTS), bringing the total from 10 to 11. The orchestrator only loads
Y1_AGENTS by default (4), so Bridge is NOT loaded by the orchestrator — it's
used via direct `await BridgeAgent().run(...)` calls from the bots and payment
agent. These tests were updated to reflect the new count.
"""
import os
from unittest.mock import MagicMock, patch

import pytest

from app.agents import ALL_AGENTS, BRIDGE_AGENTS, Y1_AGENTS, Y2PLUS_AGENTS
from app.orchestrator import Orchestrator


def test_y1_agents_count():
    """Y1 should load exactly 4 agents."""
    assert len(Y1_AGENTS) == 4


def test_y2plus_agents_count():
    """Y2+ should have 6 agents (deferred)."""
    assert len(Y2PLUS_AGENTS) == 6


def test_bridge_agents_count():
    """Bridge agent (Week 2 of the WhatsApp↔Telegram bridge) is a single
    stateless event router, registered separately from Y1/Y2+."""
    assert len(BRIDGE_AGENTS) == 1
    assert "Bridge" in BRIDGE_AGENTS


def test_all_agents_count():
    """Total should be 11 agents (Y1 4 + Bridge 1 + Y2+ 6)."""
    assert len(ALL_AGENTS) == 11


def test_y1_agents_are_dispatch_pricing_fraud_payment():
    """Y1 agents should be Dispatch, Pricing, Fraud, Payment."""
    expected = {"Dispatch", "Pricing", "Fraud", "Payment"}
    assert set(Y1_AGENTS.keys()) == expected


def test_y2plus_agents_are_negotiation_compliance_contract_route_copilot_fleet():
    """Y2+ agents should be the other 6."""
    expected = {"Negotiation", "Compliance", "Contract", "Route", "Copilot", "Fleet"}
    assert set(Y2PLUS_AGENTS.keys()) == expected


def test_y1_and_y2plus_disjoint():
    """Y1 and Y2+ agent sets should be disjoint."""
    assert set(Y1_AGENTS.keys()).isdisjoint(set(Y2PLUS_AGENTS.keys()))


def test_orchestrator_default_loads_y1_only():
    """Default orchestrator should load only Y1 agents (NOT Bridge — Bridge is
    stateless and used via direct calls, not via the orchestrator)."""
    with patch.dict(os.environ, {}, clear=True):
        orch = Orchestrator()
        assert set(orch.agents.keys()) == set(Y1_AGENTS.keys())
        assert len(orch.agents) == 4


def test_orchestrator_all_tier_loads_all_agents():
    """When TYRE_AGENT_TIER=ALL, should load all 11 agents (including Bridge)."""
    with patch.dict(os.environ, {"TYRE_AGENT_TIER": "ALL"}):
        orch = Orchestrator()
        assert len(orch.agents) == 11
        assert "Negotiation" in orch.agents
        assert "Fleet" in orch.agents


@pytest.mark.asyncio
async def test_orchestrator_rejects_unknown_agent():
    """Should raise ValueError for unknown agent name."""
    with patch.dict(os.environ, {}, clear=True):
        orch = Orchestrator()
        with pytest.raises(ValueError, match="Unknown agent"):
            await orch.run_agent("NonExistentAgent", {})


@pytest.mark.asyncio
async def test_orchestrator_runs_y1_agent():
    """Should be able to run a Y1 agent."""
    with patch.dict(os.environ, {}, clear=True):
        orch = Orchestrator()
        # Mock the agent's safe_run to avoid needing LLM API keys
        mock_result = MagicMock()
        mock_result.success = True
        mock_result.data = {"test": "result"}
        mock_result.latency_ms = 50
        mock_result.error = None
        with patch.object(orch.agents["Dispatch"], 'safe_run', new_callable=MagicMock) as mock_safe:
            import asyncio
            mock_safe.return_value = asyncio.Future()
            mock_safe.return_value.set_result(mock_result)

            result = await orch.run_agent("Dispatch", {"test": "input"})

    assert result["success"] is True
    assert result["data"] == {"test": "result"}


@pytest.mark.asyncio
async def test_orchestrator_rejects_y2plus_agent_in_y1_mode():
    """Should not be able to run Y2+ agent in Y1 mode."""
    with patch.dict(os.environ, {}, clear=True):
        orch = Orchestrator()
        # Negotiation is Y2+, should not be available
        with pytest.raises(ValueError, match="Unknown agent"):
            await orch.run_agent("Negotiation", {})
