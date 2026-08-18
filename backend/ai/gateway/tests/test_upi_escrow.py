"""
Test the UPI escrow service — THE Y1 wedge flagship.

PMF signal: ₹10K advance released within 60 seconds of load acceptance.
If this test fails, the wedge is broken.
"""
from unittest.mock import AsyncMock, patch

import pytest

from app.ai.payments.upi_escrow import (
    ADVANCE_RELEASE_TARGET_MS,
    TAKE_RATE_PERCENT,
    AdvanceReleaseRequest,
    BalanceReleaseRequest,
    EscrowFundingRequest,
    UpiEscrowService,
)


@pytest.fixture
def service():
    """Fresh UpiEscrowService instance per test."""
    return UpiEscrowService()


@pytest.fixture
def funding_request():
    return EscrowFundingRequest(
        broker_id="brk_001",
        load_id="load_001",
        load_amount_inr=45000,
        advance_amount_inr=10000,
    )


@pytest.fixture
def advance_request():
    return AdvanceReleaseRequest(
        escrow_account_id="acc_123",
        driver_phone="+919876543210",
        driver_upi_id="ramesh@upi",
        load_id="load_001",
        advance_amount_inr=10000,
    )


@pytest.fixture
def balance_request():
    return BalanceReleaseRequest(
        escrow_account_id="acc_123",
        driver_phone="+919876543210",
        driver_upi_id="ramesh@upi",
        trip_id="trip_001",
        load_id="load_001",
        balance_amount_inr=45000,
        trigger="CONSIGNEE_CONFIRM",
        trigger_ref="confirm_abc",
    )


# ─────────────────────────────────────────────────────────────────
# Escrow Funding Tests
# ─────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_fund_escrow_success(service, funding_request):
    """Broker funds escrow — should succeed and return funded status."""
    result = await service.fund_escrow(funding_request)

    assert result.success is True
    assert result.status == "FUNDED"
    assert result.total_funded_inr == 55000  # 45000 + 10000
    assert result.advance_amount_inr == 10000
    assert result.balance_amount_inr == 45000
    # 1% take rate on 55000 = 550
    assert result.tyre_fee_inr == 550
    assert result.razorpay_account_id.startswith("acc_")
    assert result.funding_latency_ms >= 0


@pytest.mark.asyncio
async def test_fund_escrow_tyre_fee_calculation(service, funding_request):
    """TYRE take rate is 1% — verify on different amounts."""
    # 1% of 55000 = 550
    result = await service.fund_escrow(funding_request)
    assert result.tyre_fee_inr == 55000 * 0.01

    # Test with different amount
    funding_request.load_amount_inr = 100000
    funding_request.advance_amount_inr = 20000
    result = await service.fund_escrow(funding_request)
    assert result.tyre_fee_inr == 120000 * 0.01  # 1200


@pytest.mark.asyncio
async def test_fund_escrow_generates_unique_account_id(service):
    """Each funding should generate a unique Razorpay account ID."""
    req = EscrowFundingRequest(
        broker_id="brk_001",
        load_id="load_001",
        load_amount_inr=45000,
        advance_amount_inr=10000,
    )
    result1 = await service.fund_escrow(req)
    result2 = await service.fund_escrow(req)
    assert result1.razorpay_account_id != result2.razorpay_account_id


# ─────────────────────────────────────────────────────────────────
# Advance Release Tests — THE PMF SIGNAL
# ─────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_release_advance_success(service, advance_request):
    """₹10K advance must release successfully."""
    # The WhatsApp/SMS notifier is an optional integration that gracefully skips when
    # unconfigured; patch it so the test deterministically verifies notify wiring.
    with patch("app.ai.payments.upi_escrow.send_with_sms_fallback",
               new_callable=AsyncMock, return_value={"channel": "whatsapp"}):
        result = await service.release_advance(advance_request)

    assert result.success is True
    assert result.amount_released_inr == 10000
    assert result.razorpay_transfer_id.startswith("trf_")
    assert result.upi_transaction_ref.startswith("upi_")
    assert result.driver_notified is True


@pytest.mark.asyncio
async def test_release_advance_pmf_latency_target(service, advance_request):
    """
    PMF SIGNAL: Advance release must complete within 60 seconds.
    This is the wedge metric. If this fails, TYRE has no PMF.
    """
    result = await service.release_advance(advance_request)

    assert result.release_latency_ms < ADVANCE_RELEASE_TARGET_MS, (
        f"PMF FAILURE: advance release took {result.release_latency_ms}ms "
        f"(target <{ADVANCE_RELEASE_TARGET_MS}ms)"
    )


@pytest.mark.asyncio
async def test_release_advance_ref_is_deterministic(service, advance_request):
    """Transfer/UPI refs are derived from a stable idempotency key (escrow account +
    load id), so a re-run yields the same refs — the basis for idempotent payouts."""
    result1 = await service.release_advance(advance_request)
    result2 = await service.release_advance(advance_request)
    assert result1.upi_transaction_ref.startswith("upi_")
    assert result1.razorpay_transfer_id.startswith("trf_")
    # Same (escrow_account_id, load_id) ⇒ identical, idempotent references.
    assert result1.upi_transaction_ref == result2.upi_transaction_ref
    assert result1.razorpay_transfer_id == result2.razorpay_transfer_id


# ─────────────────────────────────────────────────────────────────
# Balance Release Tests
# ─────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_release_balance_success(service, balance_request):
    """Balance release after consignee confirmation."""
    # Driver is notified via WhatsApp/SMS; broker via the BFF notification path. Mock
    # both optional integrations so the notify flags are deterministic offline.
    with patch("app.ai.payments.upi_escrow.send_with_sms_fallback",
               new_callable=AsyncMock, return_value={"channel": "whatsapp"}), \
         patch("app.ai.payments.upi_escrow.bff_client._safe_post",
               new_callable=AsyncMock, return_value={"success": True}):
        result = await service.release_balance(balance_request)

    assert result.success is True
    # 1% fee on 45000 = 450
    assert result.tyre_fee_inr == 450
    # Driver receives 45000 - 450 = 44550
    assert result.amount_released_inr == 44550
    assert result.driver_notified is True
    assert result.broker_notified is True


@pytest.mark.asyncio
async def test_release_balance_triggers(service):
    """Balance release should accept all valid trigger types."""
    for trigger in ["GPS_POD", "CONSIGNEE_CONFIRM", "MANUAL"]:
        req = BalanceReleaseRequest(
            escrow_account_id="acc_123",
            driver_phone="+919876543210",
            driver_upi_id="ramesh@upi",
            trip_id="trip_001",
            load_id="load_001",
            balance_amount_inr=45000,
            trigger=trigger,
            trigger_ref="ref_123",
        )
        service_local = UpiEscrowService()
        result = await service_local.release_balance(req)
        assert result.success is True, f"Failed for trigger: {trigger}"


# ─────────────────────────────────────────────────────────────────
# Refund Tests
# ─────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_refund_to_broker(service):
    """If load cancelled, escrow should refund to broker."""
    result = await service.refund_to_broker(
        escrow_account_id="acc_123",
        refund_amount_inr=55000,
        reason="LOAD_CANCELLED_BY_SHIPPER",
    )
    assert result["success"] is True
    assert result["status"] == "REFUNDED"
    assert result["refund_amount_inr"] == 55000


# ─────────────────────────────────────────────────────────────────
# Escrow Status Tests
# ─────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_escrow_status(service):
    """Should return current escrow status (read back through the BFF)."""
    # get_escrow_status reads the persisted row via the BFF; mock that read.
    bff_status = {
        "escrow_account_id": "acc_123",
        "status": "FUNDED",
        "total_funded_inr": 55000,
        "advance_released_inr": 10000,
        "balance_pending_inr": 45000,
        "tyre_fee_inr": 450,
    }
    with patch("app.ai.payments.upi_escrow._bff_get",
               new_callable=AsyncMock, return_value=bff_status):
        status = await service.get_escrow_status("acc_123")
    assert "escrow_account_id" in status
    assert "status" in status
    assert "total_funded_inr" in status
    assert "advance_released_inr" in status
    assert "balance_pending_inr" in status
    assert "tyre_fee_inr" in status


# ─────────────────────────────────────────────────────────────────
# Constants Tests
# ─────────────────────────────────────────────────────────────────

def test_take_rate_is_one_percent():
    """v3.2 wedge: 1% take rate on every load."""
    assert TAKE_RATE_PERCENT == 1.0


def test_advance_release_target_is_60_seconds():
    """PMF signal: 60-second advance release."""
    assert ADVANCE_RELEASE_TARGET_MS == 60_000


def test_default_advance_is_18_percent():
    """Default advance is ~18% of load value (₹10K on ₹55K total)."""
    from app.ai.payments.upi_escrow import DEFAULT_ADVANCE_PERCENT
    assert DEFAULT_ADVANCE_PERCENT == 18.0
