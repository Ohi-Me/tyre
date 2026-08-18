"""
Test the last-mile routing AI.
Solves driver's city-navigation pain.
"""
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.ai.routing.last_mile import LastMileRouter, LastMileRouteRequest


@pytest.fixture
def router():
    return LastMileRouter()


@pytest.fixture
def route_request():
    return LastMileRouteRequest(
        trip_id="trip_001",
        driver_id="driver_001",
        driver_locale="hi",
        consignee_address="Okhla Phase II, New Delhi",
        consignee_lat=28.5309,
        consignee_lng=77.2676,
        truck_type="12-wheeler",
        truck_height_m=4.0,
        truck_weight_tons=18.0,
    )


# ─────────────────────────────────────────────────────────────────
# Generate route
# ─────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_generate_route_success(router, route_request):
    """Should generate route with voice navigation in driver's locale."""
    with patch.object(router, '_reverse_geocode_city', new_callable=AsyncMock) as mock_city, \
         patch.object(router, '_get_google_maps_route', new_callable=AsyncMock) as mock_gmaps, \
         patch.object(router, '_predict_dock_wait', new_callable=AsyncMock) as mock_dock, \
         patch.object(router, '_generate_voice_navigation', new_callable=AsyncMock) as mock_voice, \
         patch.object(router, '_notify_consignee_eta', new_callable=AsyncMock):

        mock_city.return_value = "Delhi"
        mock_gmaps.return_value = {
            "polyline": "encoded_polyline",
            "distance_km": 12.5,
            "estimated_minutes": 45,
            "steps": [
                {"instruction": "Turn right onto NH48", "distance_m": 2000, "duration_s": 120},
                {"instruction": "Continue for 5 km", "distance_m": 5000, "duration_s": 360},
            ],
        }
        mock_dock.return_value = 35  # minutes
        mock_voice.return_value = "https://s3.example.com/voice_hi.mp3"

        result = await router.generate_route(route_request)

    assert result["success"] is True
    assert result["city"] == "Delhi"
    assert result["total_distance_km"] == 12.5
    assert result["estimated_driving_minutes"] == 45
    assert result["predicted_dock_wait_minutes"] == 35
    assert result["total_eta_minutes"] == 80  # 45 + 35
    assert result["voice_nav_url"] == "https://s3.example.com/voice_hi.mp3"
    assert result["voice_nav_locale"] == "hi"
    assert "latency_ms" in result


@pytest.mark.asyncio
async def test_generate_route_truck_restrictions(router, route_request):
    """Should avoid truck-restricted zones."""
    with patch.object(router, '_reverse_geocode_city', new_callable=AsyncMock) as mock_city, \
         patch.object(router, '_get_google_maps_route', new_callable=AsyncMock) as mock_gmaps, \
         patch.object(router, '_predict_dock_wait', new_callable=AsyncMock), \
         patch.object(router, '_generate_voice_navigation', new_callable=AsyncMock), \
         patch.object(router, '_notify_consignee_eta', new_callable=AsyncMock):

        mock_city.return_value = "Delhi"
        mock_gmaps.return_value = {
            "polyline": "stub", "distance_km": 10, "estimated_minutes": 30, "steps": [],
        }

        result = await router.generate_route(route_request)

    # Delhi has restricted zones in our TRUCK_RESTRICTIONS dict
    assert "Lodhi Road" in result["avoided_roads"]
    assert "Connaught Place inner circle" in result["avoided_roads"]


# ─────────────────────────────────────────────────────────────────
# Truck restrictions per city
# ─────────────────────────────────────────────────────────────────

def test_truck_restrictions_delhi(router):
    """Delhi should have truck restrictions defined."""
    assert "Delhi" in router.TRUCK_RESTRICTIONS
    delhi = router.TRUCK_RESTRICTIONS["Delhi"]
    assert "restricted_zones" in delhi
    assert "time_restrictions" in delhi
    assert "low_bridges" in delhi
    assert len(delhi["restricted_zones"]) > 0


def test_truck_restrictions_mumbai(router):
    """Mumbai should have truck restrictions."""
    assert "Mumbai" in router.TRUCK_RESTRICTIONS


def test_truck_restrictions_patna(router):
    """Patna should have truck restrictions (wedge city)."""
    assert "Patna" in router.TRUCK_RESTRICTIONS


# ─────────────────────────────────────────────────────────────────
# Voice navigation generation
# ─────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_generate_voice_navigation_english(router):
    """Should generate voice nav URL for English-speaking driver."""
    steps = [
        {"instruction": "Turn right", "distance_m": 500, "duration_s": 60},
        {"instruction": "Continue straight", "distance_m": 1000, "duration_s": 120},
    ]
    with patch('app.ai.routing.last_mile.time') as mock_time:
        mock_time.time.return_value = 12345
        url = await router._generate_voice_navigation(steps, "en")

    assert url.startswith("https://")
    assert "en" in url
    assert ".mp3" in url


@pytest.mark.asyncio
async def test_generate_voice_navigation_translates_for_bhojpuri(router):
    """Should translate instructions to Bhojpuri (via Hindi fallback) for Bhojpuri driver."""
    steps = [
        {"instruction": "Turn right onto NH48", "distance_m": 2000, "duration_s": 120},
    ]
    # Mock translation service
    with patch.object(router._translator, 'translate', new_callable=AsyncMock) as mock_translate:
        mock_result = MagicMock()
        mock_result.translations = ["NH48 पर दाएं मुड़ें"]
        mock_translate.return_value = mock_result

        with patch('app.ai.routing.last_mile.time') as mock_time:
            mock_time.time.return_value = 12345
            url = await router._generate_voice_navigation(steps, "bho")

    # Translator should have been called
    assert mock_translate.called
    # Step should have localized instruction
    assert steps[0]["instruction_localized"] == "NH48 पर दाएं मुड़ें"


@pytest.mark.asyncio
async def test_generate_voice_navigation_empty_steps(router):
    """Should handle empty steps gracefully."""
    url = await router._generate_voice_navigation([], "hi")
    assert url == ""
