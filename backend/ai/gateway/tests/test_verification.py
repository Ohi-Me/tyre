"""
Test the Verification Service — 9 verifications.
"""
import pytest

from app.ai.trust.verification import VERIFICATION_WEIGHTS, VerificationService, VerificationType


@pytest.fixture
def service():
    return VerificationService()


# ─────────────────────────────────────────────────────────────────
# Verification Weights
# ─────────────────────────────────────────────────────────────────

def test_verification_weights_sum_to_300():
    """All verification weights should sum to 300 (30% of 1000)."""
    total = sum(VERIFICATION_WEIGHTS.values())
    assert total == 300


def test_aadhaar_weight_is_45():
    """Aadhaar = 45 points (highest weight)."""
    assert VERIFICATION_WEIGHTS[VerificationType.AADHAAR] == 45


def test_gst_status_weight_is_30():
    """GST status = 30 points."""
    assert VERIFICATION_WEIGHTS[VerificationType.GST_STATUS] == 30


def test_pan_weight_is_15():
    """PAN = 15 points."""
    assert VERIFICATION_WEIGHTS[VerificationType.PAN] == 15


# ─────────────────────────────────────────────────────────────────
# Aadhaar Verification
# ─────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_verify_aadhaar_success(service):
    """Valid Aadhaar = 45 points."""
    result = await service.verify_aadhaar("123456789012", "+919876543210", "Ramesh Kumar")
    assert result.success is True
    assert result.score_points == 45
    assert result.reference_id.startswith("uidai_")


@pytest.mark.asyncio
async def test_verify_aadhaar_invalid_format(service):
    """Invalid Aadhaar format = failure."""
    result = await service.verify_aadhaar("12345", "+919876543210", "Ramesh")
    assert result.success is False
    assert result.score_points == 0
    assert "Invalid Aadhaar format" in result.failure_reason


@pytest.mark.asyncio
async def test_verify_aadhaar_non_digit(service):
    """Non-digit Aadhaar = failure."""
    result = await service.verify_aadhaar("ABCDEFGHIJKL", "+919876543210", "Ramesh")
    assert result.success is False


@pytest.mark.asyncio
async def test_verify_aadhaar_pii_not_stored_raw(service):
    """Aadhaar number should NOT appear in raw_data — only hash in reference_id."""
    result = await service.verify_aadhaar("123456789012", "+919876543210", "Ramesh")
    # Reference ID should be a hash, not the raw Aadhaar
    assert "123456789012" not in result.reference_id
    # Raw data should not contain the Aadhaar number
    if result.raw_data:
        assert "123456789012" not in str(result.raw_data)


# ─────────────────────────────────────────────────────────────────
# GSTIN Verification
# ─────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_verify_gstin_success(service):
    """Valid GSTIN = 30 points."""
    result = await service.verify_gstin("27ABCDE1234F1Z5")
    assert result.success is True
    assert result.score_points == 30


@pytest.mark.asyncio
async def test_verify_gstin_invalid_format(service):
    """Invalid GSTIN = failure."""
    result = await service.verify_gstin("INVALID")
    assert result.success is False
    assert "Invalid GSTIN format" in result.failure_reason


@pytest.mark.asyncio
async def test_verify_gstin_masked_in_raw_data(service):
    """GSTIN should be masked in raw_data."""
    result = await service.verify_gstin("27ABCDE1234F1Z5")
    if result.raw_data:
        gstin_display = result.raw_data.get("gstin", "")
        assert "27ABCDE1234" not in gstin_display  # not fully exposed
        assert "*****" in gstin_display or gstin_display.endswith("1Z5")


# ─────────────────────────────────────────────────────────────────
# PAN Verification
# ─────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_verify_pan_success(service):
    """Valid PAN = 15 points."""
    result = await service.verify_pan("ABCDE1234F", "Ramesh Kumar", "1990-01-01")
    assert result.success is True
    assert result.score_points == 15


@pytest.mark.asyncio
async def test_verify_pan_invalid_format(service):
    """Invalid PAN = failure."""
    result = await service.verify_pan("INVALID", "Ramesh", "1990-01-01")
    assert result.success is False


# ─────────────────────────────────────────────────────────────────
# Bank (UPI) Verification
# ─────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_verify_bank_success(service):
    """Valid UPI ID = 30 points."""
    result = await service.verify_bank("ramesh@upi", "+919876543210")
    assert result.success is True
    assert result.score_points == 30


@pytest.mark.asyncio
async def test_verify_bank_invalid_upi(service):
    """Invalid UPI ID = failure."""
    result = await service.verify_bank("invalid", "+919876543210")
    assert result.success is False
    assert "Invalid UPI ID" in result.failure_reason


# ─────────────────────────────────────────────────────────────────
# Vehicle Verification
# ─────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_verify_vehicle_success(service):
    """Valid vehicle number = 30 points."""
    result = await service.verify_vehicle("BR01AB1234", {"owner_match": True})
    assert result.success is True
    assert result.score_points == 30


@pytest.mark.asyncio
async def test_verify_vehicle_invalid_format(service):
    """Invalid vehicle = failure."""
    result = await service.verify_vehicle("XYZ", {})
    assert result.success is False


# ─────────────────────────────────────────────────────────────────
# Phone Verification
# ─────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_verify_phone_success(service):
    """Valid Indian phone = 15 points."""
    result = await service.verify_phone("+919876543210", whatsapp_verified=True)
    assert result.success is True
    assert result.score_points == 15


@pytest.mark.asyncio
async def test_verify_phone_invalid_format(service):
    """Non-Indian phone = failure."""
    result = await service.verify_phone("+1234567890", False)
    assert result.success is False


# ─────────────────────────────────────────────────────────────────
# Expiry Tests
# ─────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_gstin_verification_expires_in_30_days(service):
    """GSTIN verification should expire in 30 days (status can change)."""
    result = await service.verify_gstin("27ABCDE1234F1Z5")
    assert result.expires_at is not None
    # Expiry should be roughly 30 days from now
    import time
    now = int(time.time())
    expiry_sec = int(result.expires_at)
    days_until_expiry = (expiry_sec - now) / 86400
    assert 29 <= days_until_expiry <= 31


@pytest.mark.asyncio
async def test_aadhaar_verification_expires_in_365_days(service):
    """Aadhaar verification should expire in 365 days (identity doesn't change)."""
    result = await service.verify_aadhaar("123456789012", "+919876543210", "Ramesh")
    import time
    now = int(time.time())
    expiry_sec = int(result.expires_at)
    days_until_expiry = (expiry_sec - now) / 86400
    assert 364 <= days_until_expiry <= 366
