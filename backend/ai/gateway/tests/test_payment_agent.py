"""
Test the Payment Agent — v3.2 wedge (UPI escrow only).

Phase 0 rewrote the Payment Agent from an LLM that *narrated* a fake transaction
into a deterministic router over `UpiEscrowService` — no LLM, no fabricated
transaction IDs. With no Razorpay credentials configured the escrow service runs
in SIMULATED mode, which these tests exercise. The driver-notification and
BFF-persistence side effects no-op gracefully when their integrations are unset,
so they are patched/ignored here to keep the assertions deterministic.
"""
from unittest.mock import AsyncMock, patch

import pytest

from app.agents.payment import PaymentAgent


@pytest.fixture
def agent():
    return PaymentAgent()


def test_agent_name():
    assert PaymentAgent.name == "Payment"


def test_payment_agent_does_no_llm_calls():
    """v3.2 / Phase 0: the money path must never depend on an LLM guess."""
    import app.agents.payment as payment_mod

    # The old LLM scaffolding (SYSTEM prompt + rule-based fabricator) must be gone.
    assert not hasattr(payment_mod, "SYSTEM")
    assert not hasattr(payment_mod, "_rule_based_payment")
    assert not hasattr(payment_mod, "chat_completion")


@pytest.mark.asyncio
async def test_advance_release_is_default_action(agent):
    """No `action` ⇒ advance release (the PMF-critical 60-second path)."""
    with patch(
        "app.ai.payments.upi_escrow.bff_client.persist_escrow_event",
        new_callable=AsyncMock,
    ):
        result = await agent.run(
            {
                "escrow_account_id": "acc_SIMULATED_test",
                "driver_phone": "+919876543210",
                "driver_upi_id": "driver@upi",
                "load_id": "TYRE-0001",
                "amount": 10000,
            }
        )

    assert result.success is True
    assert result.data["status"] == "ADVANCE_RELEASED"
    assert result.data["currency"] == "INR"
    assert result.data["simulated"] is True
    assert result.data["upi_transaction_ref"].startswith("upi_")


@pytest.mark.asyncio
async def test_fund_action_funds_escrow(agent):
    with patch(
        "app.ai.payments.upi_escrow.bff_client.persist_escrow_event",
        new_callable=AsyncMock,
    ):
        result = await agent.run(
            {
                "action": "fund",
                "broker_id": "BRK-001",
                "load_id": "TYRE-0001",
                "load_amount_inr": 55000,
                "advance_amount_inr": 10000,
            }
        )

    assert result.success is True
    assert result.data["status"] == "FUNDED"
    assert result.data["currency"] == "INR"
    assert result.data["simulated"] is True


@pytest.mark.asyncio
async def test_balance_release_action(agent):
    with patch(
        "app.ai.payments.upi_escrow.bff_client.persist_escrow_event",
        new_callable=AsyncMock,
    ):
        result = await agent.run(
            {
                "action": "balance",
                "escrow_account_id": "acc_SIMULATED_test",
                "driver_phone": "+919876543210",
                "driver_upi_id": "driver@upi",
                "trip_id": "trip_1",
                "load_id": "TYRE-0001",
                "amount": 45000,
                "trigger": "GPS_POD",
                "trigger_ref": "gps_1",
            }
        )

    assert result.data["currency"] == "INR"
    assert result.data["status"] == "COMPLETED"
    assert result.data["upi_transaction_ref"].startswith("upi_")


@pytest.mark.asyncio
async def test_missing_required_field_fails_cleanly(agent):
    """A missing required field must FAIL deterministically — never fabricate a payment."""
    result = await agent.run({"action": "fund"})  # missing broker_id / load_id / load_amount_inr
    assert result.success is False
    assert result.data["status"] == "FAILED"
    assert result.error is not None
