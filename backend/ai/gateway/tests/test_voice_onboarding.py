"""
Test the voice-first onboarding service.
Target: 2-minute onboarding from voice sample to verified driver.
"""
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.ai.onboarding.voice_onboarding import VoiceOnboardingService


@pytest.fixture
def service():
    return VoiceOnboardingService()


# Sample transcripts in different languages
BHJPURI_TRANSCRIPT = "Main Ramesh hoon, Patna ka truck BR01AB1234, 12-chakka hai"
HINDI_TRANSCRIPT = "Mera naam Mohan hai, Ranchi mein hoon, JH01EF9012, 16 chakka"
ENGLISH_TRANSCRIPT = "My name is Amit, I am in Delhi, truck number DL01AB5678, 10 wheeler"


# ─────────────────────────────────────────────────────────────────
# Transcript-based onboarding (no audio)
# ─────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_onboard_from_transcript_bhojpuri(service):
    """Driver speaks Bhojpuri — system extracts driver info."""
    # Mock the LLM extraction to return parsed driver info
    with patch.object(service, '_extract_entities', new_callable=AsyncMock) as mock_extract:
        mock_extract.return_value = {
            "driver_name": "Ramesh",
            "current_location": "Patna",
            "truck_number": "BR01AB1234",
            "truck_type": "12-wheeler",
            "truck_capacity_tons": 18.0,
        }
        # Mock TTS to avoid needing API keys
        with patch.object(service.tts, 'synthesize', new_callable=AsyncMock) as mock_tts:
            mock_tts_result = MagicMock()
            mock_tts_result.audio_base64 = "stub_audio_base64"
            mock_tts.synthesize.return_value = mock_tts_result

            result = await service.onboard_from_voice(
                transcript=BHJPURI_TRANSCRIPT,
                driver_phone="+919876543210",
                driver_locale_hint="bho",
            )

    assert result.success is True
    assert result.driver_name == "Ramesh"
    assert result.current_location == "Patna"
    assert result.truck_number == "BR01AB1234"
    assert result.truck_type == "12-wheeler"
    assert result.truck_capacity_tons == 18.0
    assert result.driver_phone == "+919876543210"
    assert result.onboarding_id.startswith("VON-")
    assert len(result.next_steps) == 6  # 6 KYC steps


@pytest.mark.asyncio
async def test_onboard_duration_under_2_minutes(service):
    """Target: onboarding completes in <2 minutes (120s)."""
    with patch.object(service, '_extract_entities', new_callable=AsyncMock) as mock_extract:
        mock_extract.return_value = {"driver_name": "Test"}
        with patch.object(service.tts, 'synthesize', new_callable=AsyncMock):
            mock_tts_result = MagicMock()
            mock_tts_result.audio_base64 = "stub"
            service.tts.synthesize.return_value = mock_tts_result

            result = await service.onboard_from_voice(
                transcript="test transcript",
                driver_phone="+919999999999",
            )

    # Should complete in well under 2 minutes for stub
    assert result.duration_seconds < 120, (
        f"Onboarding took {result.duration_seconds}s — target is <120s"
    )


# ─────────────────────────────────────────────────────────────────
# Rule-based fallback extraction
# ─────────────────────────────────────────────────────────────────

def test_rule_based_extract_truck_number(service):
    """Fallback regex should extract Indian truck plate numbers."""
    # Standard plate: 2 letters + 2 digits + 1-3 letters + 4 digits
    result = service._rule_based_extract("Main Ramesh, BR01AB1234, 12 chakka")
    assert result["truck_number"] == "BR01AB1234"


def test_rule_based_extract_truck_type_12_wheeler(service):
    """Fallback should detect 12-wheeler."""
    result = service._rule_based_extract("12 chakka truck BR01AB1234")
    assert result["truck_type"] == "12-wheeler"
    assert result["truck_capacity_tons"] == 18.0


def test_rule_based_extract_truck_type_16_wheeler(service):
    """Fallback should detect 16-wheeler."""
    result = service._rule_based_extract("16 chakka BR01AB1234")
    assert result["truck_type"] == "16-wheeler"
    assert result["truck_capacity_tons"] == 25.0


def test_rule_based_extract_truck_type_10_wheeler(service):
    """Fallback should detect 10-wheeler."""
    result = service._rule_based_extract("10 wheeler BR01AB1234")
    assert result["truck_type"] == "10-wheeler"
    assert result["truck_capacity_tons"] == 12.0


def test_rule_based_extract_no_plate(service):
    """If no plate found, truck_number should be empty."""
    result = service._rule_based_extract("Main Ramesh hoon, Patna mein hoon")
    assert result["truck_number"] == ""


# ─────────────────────────────────────────────────────────────────
# Confirmation message building
# ─────────────────────────────────────────────────────────────────

def test_confirmation_text_includes_all_fields(service):
    """English confirmation should include name, phone, truck, location."""
    extracted = {
        "driver_name": "Ramesh",
        "truck_number": "BR01AB1234",
        "truck_type": "12-wheeler",
        "truck_capacity_tons": 18.0,
        "current_location": "Patna",
    }
    text = service._build_confirmation_text_en(extracted, "+919876543210")

    assert "Ramesh" in text
    assert "+919876543210" in text
    assert "BR01AB1234" in text
    assert "12-wheeler" in text
    assert "Patna" in text
    assert "18" in text  # capacity
    # Should mention advance
    assert "₹10,000" in text or "10000" in text


def test_confirmation_text_handles_missing_fields(service):
    """Should not crash if some fields are missing."""
    extracted = {"driver_name": "Test"}
    text = service._build_confirmation_text_en(extracted, "+919999999999")
    assert "Test" in text
    assert "+919999999999" in text


# ─────────────────────────────────────────────────────────────────
# Next steps
# ─────────────────────────────────────────────────────────────────

def test_next_steps_include_all_kyc(service):
    """Onboarding should require all 6 KYC steps."""
    import asyncio
    expected_steps = [
        "Aadhaar",
        "PAN",
        "driving license",
        "RC book",
        "truck photos",
        "UPI",
    ]
    with patch.object(service, '_extract_entities', new_callable=AsyncMock) as mock_extract:
        mock_extract.return_value = {"driver_name": "Test"}
        with patch.object(service.tts, 'synthesize', new_callable=AsyncMock):
            mock_tts_result = MagicMock()
            mock_tts_result.audio_base64 = "stub"
            service.tts.synthesize.return_value = mock_tts_result

            # Use asyncio.run for proper async test execution
            r = asyncio.run(service.onboard_from_voice(
                transcript="test",
                driver_phone="+919999999999",
            ))

    steps_text = " ".join(r.next_steps).lower()
    for step in expected_steps:
        assert step.lower() in steps_text, f"Missing KYC step: {step}"
