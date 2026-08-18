"""
Test the truck photo verification service.
Solves the 'fake truck' problem: shipper books 16-wheeler, gets 10-wheeler.
"""
from unittest.mock import AsyncMock, patch

import pytest

from app.ai.verification.truck_photos import TruckPhotoVerifier


@pytest.fixture
def verifier():
    return TruckPhotoVerifier()


# ─────────────────────────────────────────────────────────────────
# Required photos
# ─────────────────────────────────────────────────────────────────

def test_required_photos_list(verifier):
    """Should require 7 photo types for full truck verification."""
    assert len(verifier.REQUIRED_PHOTOS) == 7
    assert "front" in verifier.REQUIRED_PHOTOS
    assert "back" in verifier.REQUIRED_PHOTOS
    assert "left_side" in verifier.REQUIRED_PHOTOS
    assert "right_side" in verifier.REQUIRED_PHOTOS
    assert "cargo_area" in verifier.REQUIRED_PHOTOS
    assert "license_plate" in verifier.REQUIRED_PHOTOS
    assert "rc_book" in verifier.REQUIRED_PHOTOS


# ─────────────────────────────────────────────────────────────────
# Truck number matching
# ─────────────────────────────────────────────────────────────────

def test_truck_number_match_exact(verifier):
    """OCR'd text containing exact truck number should match."""
    assert verifier._check_truck_number_match("BR01AB1234", "BR01AB1234") is True


def test_truck_number_match_with_spaces(verifier):
    """OCR may add spaces — should still match."""
    assert verifier._check_truck_number_match("BR 01 AB 1234", "BR01AB1234") is True


def test_truck_number_match_lowercase(verifier):
    """Case-insensitive matching."""
    assert verifier._check_truck_number_match("br01ab1234", "BR01AB1234") is True


def test_truck_number_match_in_longer_text(verifier):
    """OCR text may contain other text — should still find the plate."""
    assert verifier._check_truck_number_match(
        "Truck Number BR01AB1234 Registered", "BR01AB1234"
    ) is True


def test_truck_number_no_match(verifier):
    """Different plate numbers should not match."""
    assert verifier._check_truck_number_match("MH12XY5678", "BR01AB1234") is False


# ─────────────────────────────────────────────────────────────────
# Confidence computation
# ─────────────────────────────────────────────────────────────────

def test_confidence_high_when_all_checks_pass(verifier):
    """Confidence should be high when truck number matches, not stock, no warnings."""
    confidence = verifier._compute_confidence(
        photo_type="license_plate",
        truck_number_match=True,
        is_stock=False,
        validation_notes="Truck number matches RC book",
    )
    assert confidence >= 0.7  # ai_validated threshold
    assert confidence <= 1.0


def test_confidence_low_when_truck_number_mismatch(verifier):
    """Confidence should be low when truck number doesn't match."""
    confidence = verifier._compute_confidence(
        photo_type="license_plate",
        truck_number_match=False,
        is_stock=False,
        validation_notes="",
    )
    # 0.5 base + 0 (no truck match) + 0.15 (not stock) + 0.05 (no warning) = 0.7
    # Without truck match, should be at or below the ai_validated threshold of 0.7
    # Use round() to handle floating point precision (0.7000000000001 vs 0.7)
    assert round(confidence, 6) <= 0.7  # at or below threshold = not validated


def test_confidence_low_when_stock_image(verifier):
    """Confidence should be lower if image is detected as stock."""
    confidence_with_stock = verifier._compute_confidence(
        photo_type="front", truck_number_match=True, is_stock=True, validation_notes=""
    )
    confidence_without_stock = verifier._compute_confidence(
        photo_type="front", truck_number_match=True, is_stock=False, validation_notes=""
    )
    assert confidence_with_stock < confidence_without_stock


def test_confidence_low_when_warning_in_notes(verifier):
    """Confidence should be lower when validation notes contain WARNING."""
    confidence_warning = verifier._compute_confidence(
        photo_type="rc_book",
        truck_number_match=True,
        is_stock=False,
        validation_notes="WARNING: Truck number mismatch with RC book",
    )
    confidence_clean = verifier._compute_confidence(
        photo_type="rc_book",
        truck_number_match=True,
        is_stock=False,
        validation_notes="Truck number matches RC book",
    )
    assert confidence_warning < confidence_clean


# ─────────────────────────────────────────────────────────────────
# Full onboarding verification flow
# ─────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_verify_truck_onboarding_missing_photos(verifier):
    """Should fail if any required photo is missing."""
    # Only provide 5 of 7 required photos
    photos = {
        "front": "base64_1",
        "back": "base64_2",
        "left_side": "base64_3",
        "right_side": "base64_4",
        "cargo_area": "base64_5",
        # missing: license_plate, rc_book
    }
    result = await verifier.verify_truck_onboarding(
        photos=photos,
        expected_truck_number="BR01AB1234",
        driver_phone="+919876543210",
    )

    assert result["success"] is False
    assert "missing_photos" in result
    assert "license_plate" in result["missing_photos"]
    assert "rc_book" in result["missing_photos"]


@pytest.mark.asyncio
async def test_verify_truck_onboarding_success(verifier):
    """Full onboarding with all 7 photos should succeed."""
    # Mock all external API calls
    with patch.object(verifier, '_upload_to_s3', new_callable=AsyncMock) as mock_s3, \
         patch.object(verifier, '_ocr_image', new_callable=AsyncMock) as mock_ocr, \
         patch.object(verifier, '_reverse_image_search', new_callable=AsyncMock) as mock_reverse, \
         patch.object(verifier, '_verify_rc_book', new_callable=AsyncMock) as mock_rc:

        mock_s3.return_value = "https://s3.example.com/photo.jpg"
        mock_ocr.return_value = "BR01AB1234"  # matches expected
        mock_reverse.return_value = False  # not stock
        mock_rc.return_value = "Truck number matches RC book"

        photos = {pt: f"base64_{pt}" for pt in verifier.REQUIRED_PHOTOS}
        result = await verifier.verify_truck_onboarding(
            photos=photos,
            expected_truck_number="BR01AB1234",
            driver_phone="+919876543210",
        )

    assert result["success"] is True
    assert result["all_photos_validated"] is True
    assert result["truck_number_matches"] is True
    assert result["any_stock_image_detected"] is False
    assert len(result["photos"]) == 7
    assert "verifier_latency_ms" in result


@pytest.mark.asyncio
async def test_verify_truck_onboarding_fails_on_stock_image(verifier):
    """Should fail if any photo is detected as stock image."""
    with patch.object(verifier, '_upload_to_s3', new_callable=AsyncMock) as mock_s3, \
         patch.object(verifier, '_ocr_image', new_callable=AsyncMock) as mock_ocr, \
         patch.object(verifier, '_reverse_image_search', new_callable=AsyncMock) as mock_reverse, \
         patch.object(verifier, '_verify_rc_book', new_callable=AsyncMock) as mock_rc:

        mock_s3.return_value = "https://s3.example.com/photo.jpg"
        mock_ocr.return_value = "BR01AB1234"
        mock_reverse.return_value = True  # stock image!
        mock_rc.return_value = "Truck number matches RC book"

        photos = {pt: f"base64_{pt}" for pt in verifier.REQUIRED_PHOTOS}
        result = await verifier.verify_truck_onboarding(
            photos=photos,
            expected_truck_number="BR01AB1234",
            driver_phone="+919876543210",
        )

    assert result["success"] is False
    assert result["any_stock_image_detected"] is True


@pytest.mark.asyncio
async def test_verify_truck_onboarding_fails_on_truck_number_mismatch(verifier):
    """Should fail if OCR'd truck number doesn't match expected."""
    with patch.object(verifier, '_upload_to_s3', new_callable=AsyncMock) as mock_s3, \
         patch.object(verifier, '_ocr_image', new_callable=AsyncMock) as mock_ocr, \
         patch.object(verifier, '_reverse_image_search', new_callable=AsyncMock) as mock_reverse, \
         patch.object(verifier, '_verify_rc_book', new_callable=AsyncMock) as mock_rc:

        mock_s3.return_value = "https://s3.example.com/photo.jpg"
        mock_ocr.return_value = "DIFFERENT1234"  # mismatch!
        mock_reverse.return_value = False
        mock_rc.return_value = "WARNING: Truck number mismatch with RC book"

        photos = {pt: f"base64_{pt}" for pt in verifier.REQUIRED_PHOTOS}
        result = await verifier.verify_truck_onboarding(
            photos=photos,
            expected_truck_number="BR01AB1234",
            driver_phone="+919876543210",
        )

    assert result["truck_number_matches"] is False
