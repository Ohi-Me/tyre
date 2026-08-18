"""
Test the return-load matching service.
Solves #1 fleet problem: 30% empty returns.
Worth ₹4-6L/year per truck in saved diesel + opportunity cost.
"""
from unittest.mock import AsyncMock, patch

import pytest

from app.ai.returns.return_load_matcher import (
    ReturnLoadMatcher,
)


@pytest.fixture
def matcher():
    return ReturnLoadMatcher()


@pytest.fixture
def find_request_kwargs():
    return dict(
        original_load_id="load_001",
        original_load_tyre_code="TYRE-0001",
        original_origin="Patna",
        original_destination="Delhi",
        original_rate=45000,
        driver_id="driver_001",
        driver_phone="+919876543210",
        driver_locale="hi",
        truck_type="12-wheeler",
        expected_delivery_time="2026-01-15T14:00:00Z",
    )


# ─────────────────────────────────────────────────────────────────
# Find return loads
# ─────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_find_return_loads_success(matcher, find_request_kwargs):
    """Should find return loads and generate driver message."""
    with patch.object(matcher, '_query_return_candidates', new_callable=AsyncMock) as mock_query, \
         patch.object(matcher, '_rank_with_ai', new_callable=AsyncMock) as mock_rank:

        mock_query.return_value = [
            {
                "id": "load_002",
                "tyre_code": "TYRE-0002",
                "origin": "Delhi",
                "destination": "Patna",
                "rate": 28000,
                "truck_type_req": "12-wheeler",
                "goods_type": "Electronics",
                "weight_tons": 16,
            }
        ]
        mock_rank.return_value = mock_query.return_value  # passthrough

        result = await matcher.find_return_loads(**find_request_kwargs)

    assert result["success"] is True
    assert len(result["proposals"]) == 1
    proposal = result["proposals"][0]
    assert proposal["original_load_tyre_code"] == "TYRE-0001"
    assert proposal["return_load_tyre_code"] == "TYRE-0002"
    # Total = 45000 + 28000 = 73000
    assert proposal["total_revenue"] == 73000
    # TYRE take = 1% of 73000 = 730
    assert proposal["tyre_take_rate"] == 730
    assert "driver_message_localized" in result


@pytest.mark.asyncio
async def test_find_return_loads_no_candidates(matcher, find_request_kwargs):
    """When no return loads available, should return empty list + estimated loss."""
    with patch.object(matcher, '_query_return_candidates', new_callable=AsyncMock) as mock_query:
        mock_query.return_value = []  # no return loads

        result = await matcher.find_return_loads(**find_request_kwargs)

    assert result["success"] is True
    assert len(result["proposals"]) == 0
    assert "estimated_empty_loss_inr" in result
    # 30% of head-haul rate is the empty loss
    assert result["estimated_empty_loss_inr"] == 45000 * 0.3


@pytest.mark.asyncio
async def test_find_return_loads_localized_message_bhojpuri(matcher, find_request_kwargs):
    """Driver message should be in Bhojpuri when driver_locale=bho."""
    find_request_kwargs["driver_locale"] = "bho"
    with patch.object(matcher, '_query_return_candidates', new_callable=AsyncMock) as mock_query, \
         patch.object(matcher, '_rank_with_ai', new_callable=AsyncMock) as mock_rank:
        mock_query.return_value = [{
            "id": "load_002", "tyre_code": "TYRE-0002",
            "origin": "Delhi", "destination": "Patna",
            "rate": 28000, "truck_type_req": "12-wheeler",
            "goods_type": "Electronics", "weight_tons": 16,
        }]
        mock_rank.return_value = mock_query.return_value

        result = await matcher.find_return_loads(**find_request_kwargs)

    # Bhojpuri uses Devanagari script
    msg = result["driver_message_localized"]
    assert any("\u0900" <= c <= "\u097F" for c in msg), "Should contain Devanagari (Bhojpuri)"


@pytest.mark.asyncio
async def test_find_return_loads_localized_message_english(matcher, find_request_kwargs):
    """Driver message should be in English when driver_locale=en."""
    find_request_kwargs["driver_locale"] = "en"
    with patch.object(matcher, '_query_return_candidates', new_callable=AsyncMock) as mock_query, \
         patch.object(matcher, '_rank_with_ai', new_callable=AsyncMock) as mock_rank:
        mock_query.return_value = [{
            "id": "load_002", "tyre_code": "TYRE-0002",
            "origin": "Delhi", "destination": "Patna",
            "rate": 28000, "truck_type_req": "12-wheeler",
            "goods_type": "Electronics", "weight_tons": 16,
        }]
        mock_rank.return_value = mock_query.return_value

        result = await matcher.find_return_loads(**find_request_kwargs)

    assert "Return load found" in result["driver_message_localized"]


@pytest.mark.asyncio
async def test_find_return_loads_returns_top_3_only(matcher, find_request_kwargs):
    """Should return max 3 proposals even if more candidates exist."""
    # Generate 5 candidates
    candidates = [
        {
            "id": f"load_{i}",
            "tyre_code": f"TYRE-{i:04d}",
            "origin": "Delhi", "destination": "Patna",
            "rate": 28000 - i * 1000,
            "truck_type_req": "12-wheeler",
            "goods_type": "General", "weight_tons": 16,
        }
        for i in range(5)
    ]
    with patch.object(matcher, '_query_return_candidates', new_callable=AsyncMock) as mock_query, \
         patch.object(matcher, '_rank_with_ai', new_callable=AsyncMock) as mock_rank:
        mock_query.return_value = candidates
        mock_rank.return_value = candidates

        result = await matcher.find_return_loads(**find_request_kwargs)

    assert len(result["proposals"]) == 3


# ─────────────────────────────────────────────────────────────────
# Accept return load
# ─────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_accept_return_load(matcher):
    """Driver accepts a return-load proposal."""
    result = await matcher.accept_return_load(
        proposal_id="proposal_001",
        driver_id="driver_001",
    )
    assert result["success"] is True
    assert result["status"] == "ACCEPTED"


# ─────────────────────────────────────────────────────────────────
# Driver message — no proposals
# ─────────────────────────────────────────────────────────────────

def test_driver_message_no_proposals_bhojpuri(matcher):
    """Should generate 'no return load' message in Bhojpuri."""
    msg = matcher._build_driver_message([], "bho", "Delhi")
    assert "Delhi" in msg
    assert any("\u0900" <= c <= "\u097F" for c in msg)


def test_driver_message_no_proposals_hindi(matcher):
    """Should generate 'no return load' message in Hindi."""
    msg = matcher._build_driver_message([], "hi", "Delhi")
    assert "Delhi" in msg
    assert any("\u0900" <= c <= "\u097F" for c in msg)


def test_driver_message_no_proposals_english(matcher):
    """Should generate 'no return load' message in English."""
    msg = matcher._build_driver_message([], "en", "Delhi")
    assert "Delhi" in msg
    assert "No return load" in msg


# ─────────────────────────────────────────────────────────────────
# Rule-based ranking fallback (when AI fails)
# ─────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_rank_with_ai_fallback_on_exception(matcher):
    """If LLM fails, should fall back to rule-based ranking."""
    candidates = [
        {"id": "load_1", "origin": "Delhi", "destination": "Patna", "rate": 28000,
         "truck_type_req": "12-wheeler", "goods_type": "General", "weight_tons": 16},
    ]
    with patch('app.ai.returns.return_load_matcher.chat_completion',
               new_callable=AsyncMock, side_effect=Exception("LLM down")):
        result = await matcher._rank_with_ai(
            original_destination="Delhi",
            original_rate=45000,
            candidates=candidates,
            truck_type="12-wheeler",
        )

    assert len(result) == 1
    assert result[0]["score"] == 0.85  # fallback score
    assert "Delhi" in result[0]["reasoning"]
