"""
Test the FASTag wallet service.
Saves driver ₹500-2000/trip in cash toll premium.
"""
from unittest.mock import AsyncMock, patch

import pytest

from app.ai.fastag.service import FastagService, TollEvent


@pytest.fixture
def service():
    return FastagService()


# ─────────────────────────────────────────────────────────────────
# Link FASTag
# ─────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_link_fastag_supported_issuer(service):
    """Should link FASTag from a supported issuer."""
    # link_fastag persists through the BFF (added in Phase 0). Mock both the NETC
    # format check and the BFF write so the test exercises the link logic offline.
    with patch.object(service, '_verify_fastag', new_callable=AsyncMock) as mock_verify, \
         patch('app.ai.fastag.service.bff_client.record_fastag_event', new_callable=AsyncMock) as mock_bff:
        mock_verify.return_value = {"valid": True, "vehicle_match": True}
        mock_bff.return_value = {"success": True, "data": {"wallet_id": "wallet_SIM_001"}}

        result = await service.link_fastag(
            driver_id="driver_001",
            driver_phone="+919876543210",
            fastag_id="FASTAG123456",
            issuer="ICICI",
            vehicle_number="BR01AB1234",
        )

    assert result["success"] is True
    assert result["fastag_id"] == "FASTAG123456"
    assert result["issuer"] == "ICICI"
    assert result["vehicle_number"] == "BR01AB1234"
    assert result["escrow_linked"] is True
    assert result["auto_recharge_threshold_inr"] == 500
    assert result["auto_recharge_amount_inr"] == 2000


@pytest.mark.asyncio
async def test_link_fastag_unsupported_issuer(service):
    """Should reject unsupported FASTag issuer."""
    result = await service.link_fastag(
        driver_id="driver_001",
        driver_phone="+919876543210",
        fastag_id="FASTAG123",
        issuer="UNKNOWN_BANK",
        vehicle_number="BR01AB1234",
    )

    assert result["success"] is False
    assert "Unsupported FASTag issuer" in result["error"]


@pytest.mark.asyncio
async def test_link_fastag_verification_failed(service):
    """Should fail if FASTag verification fails."""
    with patch.object(service, '_verify_fastag', new_callable=AsyncMock) as mock_verify:
        mock_verify.return_value = {"valid": False, "error": "FASTag not found"}

        result = await service.link_fastag(
            driver_id="driver_001",
            driver_phone="+919876543210",
            fastag_id="INVALID123",
            issuer="HDFC",
            vehicle_number="BR01AB1234",
        )

    assert result["success"] is False


def test_supported_issuers_list(service):
    """Should support all major Indian FASTag issuers."""
    expected = ["ICICI", "HDFC", "SBI", "AXIS", "KOTAK", "YES"]
    for issuer in expected:
        assert issuer in service.SUPPORTED_ISSUERS


# ─────────────────────────────────────────────────────────────────
# Process toll event
# ─────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_process_toll_event_success(service):
    """Toll event should deduct from wallet and notify driver."""
    event = TollEvent(
        fastag_id="FASTAG123",
        toll_plaza="Patna-Gaya Toll Plaza",
        toll_plaza_id="TP001234",
        highway="NH19",
        amount=240.0,
        timestamp="2026-01-15T10:30:00Z",
        transaction_ref="NETC123456789",
    )

    # The wallet deduction is persisted via the BFF (Phase 0); mock it + the notify.
    with patch.object(service, '_notify_driver', new_callable=AsyncMock), \
         patch('app.ai.fastag.service.bff_client.record_fastag_event', new_callable=AsyncMock) as mock_bff:
        mock_bff.return_value = {
            "success": True,
            "data": {"auto_recharge_triggered": False, "remaining_balance_inr": 1260.0},
        }
        result = await service.process_toll_event(event)

    assert result["success"] is True
    assert result["toll_amount_inr"] == 240.0
    assert "processing_latency_ms" in result


# ─────────────────────────────────────────────────────────────────
# Toll estimate
# ─────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_toll_estimate(service):
    """Should return toll estimate for a route."""
    result = await service.get_toll_estimate(
        origin="Patna",
        destination="Delhi",
        vehicle_class="HMV",
    )

    assert result["origin"] == "Patna"
    assert result["destination"] == "Delhi"
    assert result["vehicle_class"] == "HMV"
    assert result["currency"] == "INR"
    # Honest gap: the NHAI/NETC toll-calculator partner API is Y1 H2 scope. The service
    # deliberately returns NOT_INTEGRATED rather than fabricating a number that would be
    # indistinguishable from a real estimate (same standard as the escrow/payment fixes).
    assert result["status"] == "NOT_INTEGRATED"
    assert result["estimated_toll_inr"] is None


# ─────────────────────────────────────────────────────────────────
# File dispute
# ─────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_file_dispute(service):
    """Honest gap: NETC dispute-resolution API needs the NHAI partner agreement (Y1 H2),
    so file_dispute returns NOT_INTEGRATED instead of a fabricated dispute id."""
    result = await service.file_dispute(
        transaction_ref="NETC123456789",
        dispute_reason="double_charge",
    )

    assert result["success"] is False
    assert result["transaction_ref"] == "NETC123456789"
    assert result["reason"] == "double_charge"
    assert result["status"] == "NOT_INTEGRATED"


@pytest.mark.asyncio
async def test_file_dispute_all_reasons(service):
    """All valid reasons are echoed back, each labelled NOT_INTEGRATED (no fabrication)."""
    valid_reasons = ["double_charge", "wrong_amount", "vehicle_mismatch", "unauthorized"]
    for reason in valid_reasons:
        result = await service.file_dispute(
            transaction_ref=f"NETC_{reason}",
            dispute_reason=reason,
        )
        assert result["reason"] == reason
        assert result["status"] == "NOT_INTEGRATED"
