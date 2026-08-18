"""
Test the consignee WhatsApp confirmation service.
Solves the 'never received' dispute (5-10% of loads).
"""
from unittest.mock import AsyncMock, patch

import pytest

from app.ai.verification.consignee_confirm import (
    ConsigneeConfirmationRequest,
    ConsigneeConfirmationService,
)


@pytest.fixture
def service():
    return ConsigneeConfirmationService()


@pytest.fixture
def confirm_request():
    return ConsigneeConfirmationRequest(
        trip_id="trip_001",
        load_id="TYRE-0001",
        consignee_name="Shipper Co Pvt Ltd",
        consignee_phone="+919876543220",
        consignee_locale="hi",
        driver_phone="+919876543210",
        driver_photo_url="https://s3.example.com/pod.jpg",
        driver_gps_lat=28.6139,
        driver_gps_lng=77.2090,
    )


# ─────────────────────────────────────────────────────────────────
# Send confirmation request
# ─────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_send_confirmation_request_success(service, confirm_request):
    """Should send WhatsApp message and return confirmation ID + link."""
    with patch.object(service, '_send_whatsapp_message', new_callable=AsyncMock) as mock_wa:
        mock_wa.return_value = "wamid.HKhMOGFhkJKQ"

        result = await service.send_confirmation_request(confirm_request)

    assert result.confirmation_id  # non-empty
    assert result.confirmation_link.endswith(result.confirmation_id)
    assert result.whatsapp_message_id == "wamid.HKhMOGFhkJKQ"
    assert result.status == "PENDING"
    assert result.expires_at  # non-empty


@pytest.mark.asyncio
async def test_confirmation_link_is_unique(service, confirm_request):
    """Each confirmation should have a unique link."""
    with patch.object(service, '_send_whatsapp_message', new_callable=AsyncMock):
        r1 = await service.send_confirmation_request(confirm_request)
        r2 = await service.send_confirmation_request(confirm_request)
    assert r1.confirmation_id != r2.confirmation_id
    assert r1.confirmation_link != r2.confirmation_link


# ─────────────────────────────────────────────────────────────────
# Message localization — all 5 Y1 locales
# ─────────────────────────────────────────────────────────────────

def test_message_localized_hindi(service, confirm_request):
    """Hindi message should contain load ID + driver phone."""
    msg = service._build_message(confirm_request, "https://tyre.example.com/c/abc")
    assert "TYRE-0001" in msg
    assert "+919876543210" in msg
    assert "tyre.example.com" in msg
    # Should contain Hindi text (Devanagari Unicode range)
    assert any("\u0900" <= c <= "\u097F" for c in msg)


def test_message_localized_bhojpuri(service, confirm_request):
    """Bhojpuri message should contain load ID + driver phone."""
    confirm_request.consignee_locale = "bho"
    msg = service._build_message(confirm_request, "https://tyre.example.com/c/abc")
    assert "TYRE-0001" in msg
    assert "+919876543210" in msg
    # Should contain Devanagari (Bhojpuri uses Devanagari script)
    assert any("\u0900" <= c <= "\u097F" for c in msg)


def test_message_localized_english(service, confirm_request):
    """English message fallback."""
    confirm_request.consignee_locale = "en"
    msg = service._build_message(confirm_request, "https://tyre.example.com/c/abc")
    assert "TYRE-0001" in msg
    assert "+919876543210" in msg
    assert "Confirm receipt" in msg


def test_message_localized_bengali(service, confirm_request):
    """Bengali message."""
    confirm_request.consignee_locale = "bn"
    msg = service._build_message(confirm_request, "https://tyre.example.com/c/abc")
    assert "TYRE-0001" in msg
    # Bengali Unicode range: U+0980–U+09FF
    assert any("\u0980" <= c <= "\u09FF" for c in msg)


def test_message_localized_marathi(service, confirm_request):
    """Marathi message (Devanagari script)."""
    confirm_request.consignee_locale = "mr"
    msg = service._build_message(confirm_request, "https://tyre.example.com/c/abc")
    assert "TYRE-0001" in msg
    assert any("\u0900" <= c <= "\u097F" for c in msg)


def test_message_unknown_locale_falls_back_to_english(service, confirm_request):
    """Unknown locale should fall back to English template."""
    confirm_request.consignee_locale = "zh-Hans"  # not supported in Y1
    msg = service._build_message(confirm_request, "https://tyre.example.com/c/abc")
    assert "TYRE-0001" in msg
    assert "Confirm receipt" in msg


# ─────────────────────────────────────────────────────────────────
# Process confirmation (CONFIRM action)
# ─────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_process_confirmation_confirm(service):
    """When consignee confirms, the persisted record is loaded and the escrow balance
    release is triggered. The BFF record lookup and the escrow release are external
    integrations, so they are mocked to exercise the confirmation flow offline."""
    record = {"data": {"trip_id": "trip_1", "load_id": "TYRE-0001"}}  # no "id" → trigger_ref falls back to confirmation_id
    with patch.object(service, '_notify_parties', new_callable=AsyncMock), \
         patch.object(service, '_release_balance_for', new_callable=AsyncMock, return_value=True), \
         patch('app.ai.verification.consignee_confirm.bff_client.get_consignee_confirmation',
               new_callable=AsyncMock, return_value=record), \
         patch('app.ai.verification.consignee_confirm.bff_client.update_consignee_confirmation',
               new_callable=AsyncMock):
        result = await service.process_confirmation(
            confirmation_id="abc123",
            action="CONFIRM",
        )

    assert result["status"] == "CONFIRMED"
    assert result["payment_released"] is True
    assert result["confirmation_id"] == "abc123"


@pytest.mark.asyncio
async def test_process_confirmation_reject(service):
    """When consignee rejects, payment should NOT be released."""
    with patch.object(service, '_notify_parties', new_callable=AsyncMock):
        result = await service.process_confirmation(
            confirmation_id="abc123",
            action="REJECT",
        )

    assert result["status"] == "REJECTED"
    assert result["payment_released"] is False


# ─────────────────────────────────────────────────────────────────
# Auto-confirm expired
# ─────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_auto_confirm_expired_returns_int(service):
    """Auto-confirm cron should return count of auto-confirmed."""
    count = await service.auto_confirm_expired()
    assert isinstance(count, int)
    assert count >= 0
