"""
Test the nearby-driver broadcast service — Week 3 of the WhatsApp↔Telegram bridge.

The broadcast service is the highest-ROI feature for the Indian trucking wedge:
when a broker broadcasts a load, we WhatsApp all AVAILABLE drivers within 50km
of the origin. Solves the broker's "call 10-20 drivers to find a truck" problem.

Tests mirror test_bridge_agent.py shape: each scenario gets its own test, all
external calls (BFF, WhatsApp bot client) are mocked, and the service's "fail
loud in logs, not silently" rule is verified (per-driver WhatsApp failures don't
stop the blast; broadcast failures return BroadcastResult, never raise).
"""
import json
from unittest.mock import AsyncMock, patch

import pytest

from app.ai.broadcast import (
    MAX_DRIVERS_PER_BLAST,
    BroadcastRequest,
    NearbyDriverBroadcastService,
)
from app.ai.broadcast.nearby_driver_broadcast import (
    _build_load_offer_text,
    _escape_wa,
    _valid_coord,
)


@pytest.fixture
def service():
    return NearbyDriverBroadcastService()


@pytest.fixture
def whatsapp_send_ok():
    """Patch the WhatsApp bot's proactive send so driver blasts don't hit Meta."""
    with patch(
        "app.ai.whatsapp.graph_client.send_with_sms_fallback",
        new_callable=AsyncMock,
        return_value={"channel": "whatsapp", "message_id": "wamid.TEST"},
    ) as m:
        yield m


@pytest.fixture(autouse=True)
def bff_configured():
    """Autouse: pretend the BFF is configured so the service actually calls the
    BFF client methods (individually patched per-test)."""
    with patch("app.ai.broadcast.nearby_driver_broadcast.bff_client._configured", return_value=True):
        yield


def _make_request(**overrides) -> BroadcastRequest:
    """Build a BroadcastRequest with sensible defaults; tests override fields."""
    defaults = dict(
        tyre_code="TYRE-0001",
        broker_code="BRK-PAT-001",
        origin_lat=25.5941,   # Patna
        origin_lng=85.1376,
        origin_label="Patna",
        radius_km=50,
        truck_type_filter=None,
        driver_locale="hi",
        initiated_by="broker_telegram",
    )
    defaults.update(overrides)
    return BroadcastRequest(**defaults)


def _nearby_response(drivers):
    """Build a fake BFF /drivers/nearby response."""
    return {
        "success": True,
        "data": {
            "origin": {"lat": 25.5941, "lng": 85.1376, "radius_km": 50},
            "drivers": drivers,
        },
    }


# ─────────────────────────────────────────────────────────────────
# Happy path — broadcast to N nearby drivers
# ─────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_broadcast_happy_path_3_drivers(service, whatsapp_send_ok):
    """Broadcast to 3 nearby drivers — all 3 should be notified."""
    drivers = [
        {"phone": "+919876543210", "name": "Ramesh", "distance_km": 12.5,
         "destination": "Delhi", "rate_inr": 45000, "advance_inr": 10000, "truck_type": "HXL (32ft)"},
        {"phone": "+919876543211", "name": "Suresh", "distance_km": 28.3,
         "destination": "Delhi", "rate_inr": 45000, "advance_inr": 10000, "truck_type": "HXL (32ft)"},
        {"phone": "+919876543212", "name": "Mahesh", "distance_km": 45.7,
         "destination": "Delhi", "rate_inr": 45000, "advance_inr": 10000, "truck_type": "HXL (32ft)"},
    ]
    with patch("app.ai.broadcast.nearby_driver_broadcast.bff_client.find_nearby_drivers",
               new_callable=AsyncMock, return_value=_nearby_response(drivers)), \
         patch("app.ai.broadcast.nearby_driver_broadcast.bff_client.persist_broadcast_log",
               new_callable=AsyncMock, return_value={"success": True, "data": {"id": "blog_1"}}):
        result = await service.broadcast(_make_request())

    assert result.success
    assert result.drivers_found == 3
    assert result.drivers_notified == 3
    assert result.drivers_failed == 0
    assert result.broadcast_log_id == "blog_1"
    assert len(result.outcomes) == 3
    assert all(o.status == "delivered" for o in result.outcomes)
    # All 3 WhatsApp sends fired
    assert whatsapp_send_ok.await_count == 3


@pytest.mark.asyncio
async def test_broadcast_zero_drivers_found(service, whatsapp_send_ok):
    """When 0 drivers are nearby, the broadcast should succeed with 0 notified
    but still persist a BroadcastLog row (so the broker sees '0 found' in history)."""
    with patch("app.ai.broadcast.nearby_driver_broadcast.bff_client.find_nearby_drivers",
               new_callable=AsyncMock, return_value=_nearby_response([])), \
         patch("app.ai.broadcast.nearby_driver_broadcast.bff_client.persist_broadcast_log",
               new_callable=AsyncMock, return_value={"success": True, "data": {"id": "blog_0"}}):
        result = await service.broadcast(_make_request())

    assert result.success
    assert result.drivers_found == 0
    assert result.drivers_notified == 0
    assert result.drivers_failed == 0
    assert result.broadcast_log_id == "blog_0"
    whatsapp_send_ok.assert_not_awaited()


# ─────────────────────────────────────────────────────────────────
# Per-driver failure isolation
# ─────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_broadcast_one_driver_failure_doesnt_stop_others(service, whatsapp_send_ok):
    """If one WhatsApp send fails, the others should still go through."""
    drivers = [
        {"phone": "+919876543210", "name": "Ramesh", "distance_km": 12.5},
        {"phone": "+919876543211", "name": "Suresh", "distance_km": 28.3},
        {"phone": "+919876543212", "name": "Mahesh", "distance_km": 45.7},
    ]
    # First send fails, second + third succeed
    whatsapp_send_ok.side_effect = [
        {"channel": "none", "message_id": None, "error": "meta_down"},  # Ramesh fails
        {"channel": "whatsapp", "message_id": "wamid.2"},
        {"channel": "whatsapp", "message_id": "wamid.3"},
    ]
    with patch("app.ai.broadcast.nearby_driver_broadcast.bff_client.find_nearby_drivers",
               new_callable=AsyncMock, return_value=_nearby_response(drivers)), \
         patch("app.ai.broadcast.nearby_driver_broadcast.bff_client.persist_broadcast_log",
               new_callable=AsyncMock, return_value={"success": True, "data": {"id": "blog_2"}}):
        result = await service.broadcast(_make_request())

    assert result.success
    assert result.drivers_found == 3
    assert result.drivers_notified == 2  # Suresh + Mahesh
    assert result.drivers_failed == 1    # Ramesh
    # The failed outcome should record the error
    failed = [o for o in result.outcomes if o.status == "failed"]
    assert len(failed) == 1
    assert failed[0].driver_phone == "+919876543210"


@pytest.mark.asyncio
async def test_broadcast_driver_with_missing_phone_is_skipped(service, whatsapp_send_ok):
    """A driver with no phone should be marked 'skipped', not 'failed'."""
    drivers = [
        {"phone": "", "name": "NoPhoneDriver", "distance_km": 10.0},
        {"phone": "+919876543210", "name": "Ramesh", "distance_km": 12.5},
    ]
    with patch("app.ai.broadcast.nearby_driver_broadcast.bff_client.find_nearby_drivers",
               new_callable=AsyncMock, return_value=_nearby_response(drivers)), \
         patch("app.ai.broadcast.nearby_driver_broadcast.bff_client.persist_broadcast_log",
               new_callable=AsyncMock, return_value={"success": True, "data": {"id": "blog_3"}}):
        result = await service.broadcast(_make_request())

    assert result.success
    assert result.drivers_found == 2
    assert result.drivers_notified == 1   # only Ramesh
    skipped = [o for o in result.outcomes if o.status == "skipped"]
    assert len(skipped) == 1
    assert skipped[0].error == "missing_phone"


# ─────────────────────────────────────────────────────────────────
# Validation + edge cases
# ─────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_broadcast_missing_tyre_code_fails(service, whatsapp_send_ok):
    """BroadcastRequest without tyre_code should fail fast."""
    result = await service.broadcast(_make_request(tyre_code=""))
    assert not result.success
    assert "tyre_code" in result.error
    whatsapp_send_ok.assert_not_awaited()


@pytest.mark.asyncio
async def test_broadcast_invalid_coords_fails(service, whatsapp_send_ok):
    """NaN or out-of-range coords should fail fast."""
    result = await service.broadcast(_make_request(origin_lat=999, origin_lng=85))
    assert not result.success
    assert "invalid origin coords" in result.error
    result2 = await service.broadcast(_make_request(origin_lat=float("nan"), origin_lng=85))
    assert not result2.success


@pytest.mark.asyncio
async def test_broadcast_bff_nearby_query_failure(service, whatsapp_send_ok):
    """If the BFF nearby query fails, the broadcast should return failure with
    the BFF error — no WhatsApp sends should fire."""
    with patch("app.ai.broadcast.nearby_driver_broadcast.bff_client.find_nearby_drivers",
               new_callable=AsyncMock, return_value={"success": False, "error": "db_timeout"}):
        result = await service.broadcast(_make_request())

    assert not result.success
    assert "nearby query failed" in result.error
    assert "db_timeout" in result.error
    whatsapp_send_ok.assert_not_awaited()


@pytest.mark.asyncio
async def test_broadcast_radius_clamped_to_min(service, whatsapp_send_ok):
    """Radius below MIN_RADIUS_KM should be clamped up to 5km."""
    with patch("app.ai.broadcast.nearby_driver_broadcast.bff_client.find_nearby_drivers",
               new_callable=AsyncMock, return_value=_nearby_response([])) as mock_find, \
         patch("app.ai.broadcast.nearby_driver_broadcast.bff_client.persist_broadcast_log",
               new_callable=AsyncMock, return_value={"success": True, "data": {"id": "blog_min"}}):
        await service.broadcast(_make_request(radius_km=1))
    # The BFF should have been called with radius_km=5 (clamped), not 1
    _, kwargs = mock_find.call_args
    assert kwargs.get("radius_km") == 5


@pytest.mark.asyncio
async def test_broadcast_radius_clamped_to_max(service, whatsapp_send_ok):
    """Radius above MAX_RADIUS_KM should be clamped down to 200km."""
    with patch("app.ai.broadcast.nearby_driver_broadcast.bff_client.find_nearby_drivers",
               new_callable=AsyncMock, return_value=_nearby_response([])) as mock_find, \
         patch("app.ai.broadcast.nearby_driver_broadcast.bff_client.persist_broadcast_log",
               new_callable=AsyncMock, return_value={"success": True, "data": {"id": "blog_max"}}):
        await service.broadcast(_make_request(radius_km=999))
    _, kwargs = mock_find.call_args
    assert kwargs.get("radius_km") == 200


@pytest.mark.asyncio
async def test_broadcast_caps_at_max_drivers(service, whatsapp_send_ok):
    """More than MAX_DRIVERS_PER_BLAST drivers should be capped."""
    # Build 60 drivers — only 50 should be blasted
    drivers = [
        {"phone": f"+9198765432{i:02d}", "name": f"Driver{i}", "distance_km": float(i)}
        for i in range(60)
    ]
    with patch("app.ai.broadcast.nearby_driver_broadcast.bff_client.find_nearby_drivers",
               new_callable=AsyncMock, return_value=_nearby_response(drivers)), \
         patch("app.ai.broadcast.nearby_driver_broadcast.bff_client.persist_broadcast_log",
               new_callable=AsyncMock, return_value={"success": True, "data": {"id": "blog_cap"}}):
        result = await service.broadcast(_make_request())

    assert result.drivers_found == MAX_DRIVERS_PER_BLAST  # 50, not 60
    assert whatsapp_send_ok.await_count == MAX_DRIVERS_PER_BLAST


@pytest.mark.asyncio
async def test_broadcast_sorts_by_distance(service, whatsapp_send_ok):
    """Drivers should be blasted in distance order (closest first) — even if the
    BFF returns them out of order, the service re-sorts defensively."""
    drivers = [
        {"phone": "+919876543220", "name": "Far", "distance_km": 45.0},
        {"phone": "+919876543210", "name": "Near", "distance_km": 5.0},
        {"phone": "+919876543215", "name": "Mid", "distance_km": 25.0},
    ]
    with patch("app.ai.broadcast.nearby_driver_broadcast.bff_client.find_nearby_drivers",
               new_callable=AsyncMock, return_value=_nearby_response(drivers)), \
         patch("app.ai.broadcast.nearby_driver_broadcast.bff_client.persist_broadcast_log",
               new_callable=AsyncMock, return_value={"success": True, "data": {"id": "blog_sort"}}):
        result = await service.broadcast(_make_request())

    # outcomes should be sorted by distance_km ascending
    distances = [o.distance_km for o in result.outcomes]
    assert distances == sorted(distances)
    assert distances[0] == 5.0


# ─────────────────────────────────────────────────────────────────
# BroadcastLog persistence
# ─────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_broadcast_persists_log_with_outcomes(service, whatsapp_send_ok):
    """The BroadcastLog row should include the per-driver outcomes as JSON."""
    drivers = [
        {"phone": "+919876543210", "name": "Ramesh", "distance_km": 12.5},
    ]
    with patch("app.ai.broadcast.nearby_driver_broadcast.bff_client.find_nearby_drivers",
               new_callable=AsyncMock, return_value=_nearby_response(drivers)), \
         patch("app.ai.broadcast.nearby_driver_broadcast.bff_client.persist_broadcast_log",
               new_callable=AsyncMock, return_value={"success": True, "data": {"id": "blog_x"}}) as mock_persist:
        result = await service.broadcast(_make_request())

    assert result.broadcast_log_id == "blog_x"
    mock_persist.assert_awaited_once()
    persisted = mock_persist.call_args.args[0]
    assert persisted["tyre_code"] == "TYRE-0001"
    assert persisted["broker_code"] == "BRK-PAT-001"
    assert persisted["drivers_found"] == 1
    assert persisted["drivers_notified"] == 1
    # outcomes should be valid JSON with the driver's record
    outcomes = json.loads(persisted["outcomes"])
    assert len(outcomes) == 1
    assert outcomes[0]["phone"] == "+919876543210"
    assert outcomes[0]["status"] == "delivered"
    assert outcomes[0]["distance_km"] == 12.5


@pytest.mark.asyncio
async def test_broadcast_log_failure_doesnt_crash(service, whatsapp_send_ok):
    """If the BroadcastLog persist call fails, the broadcast still ran — we
    just lose the audit trail (logged, not crashed)."""
    drivers = [{"phone": "+919876543210", "name": "Ramesh", "distance_km": 12.5}]
    with patch("app.ai.broadcast.nearby_driver_broadcast.bff_client.find_nearby_drivers",
               new_callable=AsyncMock, return_value=_nearby_response(drivers)), \
         patch("app.ai.broadcast.nearby_driver_broadcast.bff_client.persist_broadcast_log",
               new_callable=AsyncMock, return_value=None):
        result = await service.broadcast(_make_request())

    assert result.success  # broadcast itself succeeded
    assert result.drivers_notified == 1
    assert result.broadcast_log_id is None  # but log wasn't persisted


# ─────────────────────────────────────────────────────────────────
# Localization
# ─────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_broadcast_hindi_template(service, whatsapp_send_ok):
    """Hindi broadcast should use Devanagari script in the WhatsApp message."""
    drivers = [{"phone": "+919876543210", "name": "Ramesh", "distance_km": 12.5,
                "destination": "Delhi", "rate_inr": 45000, "advance_inr": 10000}]
    with patch("app.ai.broadcast.nearby_driver_broadcast.bff_client.find_nearby_drivers",
               new_callable=AsyncMock, return_value=_nearby_response(drivers)), \
         patch("app.ai.broadcast.nearby_driver_broadcast.bff_client.persist_broadcast_log",
               new_callable=AsyncMock, return_value={"success": True, "data": {"id": "blog_hi"}}):
        await service.broadcast(_make_request(driver_locale="hi"))

    sent_text = whatsapp_send_ok.call_args.args[1]
    assert "लोड" in sent_text  # Hindi for "load"
    assert "TYRE-0001" in sent_text
    assert "Patna" in sent_text
    assert "12 km" in sent_text
    assert "45,000" in sent_text
    # Should contain Devanagari
    assert any("\u0900" <= c <= "\u097F" for c in sent_text)


@pytest.mark.asyncio
async def test_broadcast_bhojpuri_template(service, whatsapp_send_ok):
    """Bhojpuri broadcast should use Devanagari + Bhojpuri phrasing."""
    drivers = [{"phone": "+919876543210", "name": "Ramesh", "distance_km": 12.5}]
    with patch("app.ai.broadcast.nearby_driver_broadcast.bff_client.find_nearby_drivers",
               new_callable=AsyncMock, return_value=_nearby_response(drivers)), \
         patch("app.ai.broadcast.nearby_driver_broadcast.bff_client.persist_broadcast_log",
               new_callable=AsyncMock, return_value={"success": True, "data": {"id": "blog_bho"}}):
        await service.broadcast(_make_request(driver_locale="bho"))

    sent_text = whatsapp_send_ok.call_args.args[1]
    # Bhojpuri uses "मिलल" (got) instead of Hindi "मिला"
    assert "मिलल" in sent_text
    assert any("\u0900" <= c <= "\u097F" for c in sent_text)


@pytest.mark.asyncio
async def test_broadcast_english_template(service, whatsapp_send_ok):
    """English broadcast fallback."""
    drivers = [{"phone": "+919876543210", "name": "Ramesh", "distance_km": 12.5}]
    with patch("app.ai.broadcast.nearby_driver_broadcast.bff_client.find_nearby_drivers",
               new_callable=AsyncMock, return_value=_nearby_response(drivers)), \
         patch("app.ai.broadcast.nearby_driver_broadcast.bff_client.persist_broadcast_log",
               new_callable=AsyncMock, return_value={"success": True, "data": {"id": "blog_en"}}):
        await service.broadcast(_make_request(driver_locale="en"))

    sent_text = whatsapp_send_ok.call_args.args[1]
    assert "New load available" in sent_text
    assert "TYRE-0001" in sent_text
    assert "Patna" in sent_text


@pytest.mark.asyncio
async def test_broadcast_unknown_locale_falls_back_to_english(service, whatsapp_send_ok):
    """Unknown locale should fall back to English template."""
    drivers = [{"phone": "+919876543210", "name": "Ramesh", "distance_km": 12.5}]
    with patch("app.ai.broadcast.nearby_driver_broadcast.bff_client.find_nearby_drivers",
               new_callable=AsyncMock, return_value=_nearby_response(drivers)), \
         patch("app.ai.broadcast.nearby_driver_broadcast.bff_client.persist_broadcast_log",
               new_callable=AsyncMock, return_value={"success": True, "data": {"id": "blog_zh"}}):
        await service.broadcast(_make_request(driver_locale="zh-Hans"))

    sent_text = whatsapp_send_ok.call_args.args[1]
    assert "New load available" in sent_text  # English fallback


# ─────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────

def test_valid_coord_happy():
    assert _valid_coord(25.5941, 85.1376)  # Patna
    assert _valid_coord(0, 0)
    assert _valid_coord(-90, -180)
    assert _valid_coord(90, 180)


def test_valid_coord_invalid():
    assert not _valid_coord(999, 85)          # lat out of range
    assert not _valid_coord(25, 999)          # lng out of range
    assert not _valid_coord(float("nan"), 85)
    assert not _valid_coord("abc", 85)        # type error
    assert not _valid_coord(None, 85)


def test_escape_wa_strips_control_chars_and_newlines():
    """The WhatsApp escape helper should strip control chars + newlines so the
    offer stays on a single screen."""
    assert _escape_wa("Patna\nBihar") == "Patna Bihar"
    assert _escape_wa("Patna\r\nBihar") == "Patna Bihar"
    assert _escape_wa("Patna\x00Bihar") == "PatnaBihar"
    assert _escape_wa(None) == ""
    assert _escape_wa(123) == "123"


def test_escape_wa_truncates_long_strings():
    """Long origin labels should be capped at 80 chars."""
    long_label = "A" * 200
    assert len(_escape_wa(long_label)) == 80


def test_build_load_offer_text_includes_all_fields():
    """The WhatsApp offer should include tyre_code, origin, distance, rate, advance."""
    request = _make_request()
    driver = {
        "phone": "+919876543210",
        "name": "Ramesh",
        "distance_km": 12.5,
        "destination": "Delhi",
        "rate_inr": 45000,
        "advance_inr": 10000,
        "truck_type": "HXL (32ft)",
    }
    text = _build_load_offer_text(request, driver)
    assert "TYRE-0001" in text
    assert "Patna" in text
    assert "Delhi" in text
    assert "12 km" in text or "12" in text
    assert "45,000" in text
    assert "10,000" in text
    assert "HXL (32ft)" in text
    assert "accept TYRE-0001" in text


# ─────────────────────────────────────────────────────────────────
# Failure-mode: service never raises
# ─────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_broadcast_exception_returns_result_not_raises(service):
    """If the service raises internally, it should catch + return BroadcastResult
    with success=False, never propagate the exception."""
    with patch("app.ai.broadcast.nearby_driver_broadcast.bff_client.find_nearby_drivers",
               new_callable=AsyncMock, side_effect=RuntimeError("boom")):
        result = await service.broadcast(_make_request())
    assert not result.success
    assert "boom" in (result.error or "")


# ─────────────────────────────────────────────────────────────────
# End-to-end: bridge agent → broadcast service → BFF + WhatsApp
# ─────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_bridge_broker_broadcast_calls_broadcast_service(whatsapp_send_ok):
    """The bridge agent's _on_broker_broadcast should call the real broadcast
    service (no longer the Week 2 stub)."""
    from app.agents.bridge import BridgeAgent

    agent = BridgeAgent()
    # Mock the load lookup to return origin GPS
    with patch.object(agent, "_resolve_load_for_broadcast",
                      new_callable=AsyncMock,
                      return_value={
                          "broker_code": "BRK-PAT-001",
                          "origin_lat": 25.5941,
                          "origin_lng": 85.1376,
                          "origin_label": "Patna",
                          "origin": "Patna",
                          "truck_type_req": "HXL (32ft)",
                      }), \
         patch("app.agents.bridge.bff_client.check_broadcast_allowed",
               new_callable=AsyncMock,
               return_value={"success": True, "data": {"allowed": True, "reason": "ok"}}), \
         patch("app.ai.broadcast.nearby_driver_broadcast.bff_client.find_nearby_drivers",
               new_callable=AsyncMock,
               return_value=_nearby_response([
                   {"phone": "+919876543210", "name": "Ramesh", "distance_km": 12.5,
                    "destination": "Delhi", "rate_inr": 45000, "advance_inr": 10000},
               ])), \
         patch("app.ai.broadcast.nearby_driver_broadcast.bff_client.persist_broadcast_log",
               new_callable=AsyncMock,
               return_value={"success": True, "data": {"id": "blog_e2e"}}), \
         patch("app.ai.telegram.bot_client.send_message",
               new_callable=AsyncMock,
               return_value={"success": True, "message_id": 42, "error": None}) as telegram_send:
        result = await agent.run({
            "event": "broker_broadcast",
            "tyre_code": "TYRE-0001",
            "broker_chat_id": "12345",
        })

    assert result.success
    assert result.data["drivers_notified"] == 1
    assert result.data["drivers_found"] == 1
    assert result.data["broadcast_log_id"] == "blog_e2e"
    # WhatsApp blast fired
    whatsapp_send_ok.assert_awaited()
    # Broker got a Telegram ack
    telegram_send.assert_awaited()
    ack_text = telegram_send.call_args.args[1]
    assert "Broadcast complete" in ack_text
    assert "TYRE-0001" in ack_text
    assert "Ramesh" in ack_text  # top notified driver shown


@pytest.mark.asyncio
async def test_bridge_broker_broadcast_rate_limited():
    """When the anti-spam check denies the broadcast, the bridge should NOT
    call the broadcast service — just ack the broker with the rate limit reason."""
    from app.agents.bridge import BridgeAgent

    agent = BridgeAgent()
    with patch.object(agent, "_resolve_load_for_broadcast",
                      new_callable=AsyncMock,
                      return_value={
                          "broker_code": "BRK-PAT-001",
                          "origin_lat": 25.5941,
                          "origin_lng": 85.1376,
                          "origin_label": "Patna",
                          "truck_type_req": None,
                      }), \
         patch("app.agents.bridge.bff_client.check_broadcast_allowed",
               new_callable=AsyncMock,
               return_value={"success": True, "data": {
                   "allowed": False,
                   "reason": "rate_limited: 3 broadcasts in the last 10 min (max 3)",
                   "recent_count": 3,
               }}), \
         patch("app.ai.broadcast.nearby_driver_broadcast.bff_client.find_nearby_drivers",
               new_callable=AsyncMock) as mock_find, \
         patch("app.ai.telegram.bot_client.send_message",
               new_callable=AsyncMock,
               return_value={"success": True, "message_id": 42}) as telegram_send:
        result = await agent.run({
            "event": "broker_broadcast",
            "tyre_code": "TYRE-0001",
            "broker_chat_id": "12345",
        })

    assert result.success  # the bridge event ran, just the broadcast was denied
    assert result.data["pushed"] is False
    assert result.data["reason"] == "rate_limited"
    # Broadcast service should NOT have been called
    mock_find.assert_not_awaited()
    # Broker got a rate-limit ack
    ack_text = telegram_send.call_args.args[1]
    assert "rate-limited" in ack_text.lower() or "rate_limited" in ack_text.lower()


@pytest.mark.asyncio
async def test_bridge_broker_broadcast_no_origin_gps():
    """When the load has no origin GPS, the bridge should ack the broker with
    a clear 'set origin GPS' message — no broadcast."""
    from app.agents.bridge import BridgeAgent

    agent = BridgeAgent()
    with patch.object(agent, "_resolve_load_for_broadcast",
                      new_callable=AsyncMock,
                      return_value={
                          "broker_code": "BRK-PAT-001",
                          "origin_lat": None,  # no GPS
                          "origin_lng": None,
                          "origin_label": "Patna",
                          "truck_type_req": None,
                      }), \
         patch("app.ai.broadcast.nearby_driver_broadcast.bff_client.find_nearby_drivers",
               new_callable=AsyncMock) as mock_find, \
         patch("app.ai.telegram.bot_client.send_message",
               new_callable=AsyncMock,
               return_value={"success": True, "message_id": 42}) as telegram_send:
        result = await agent.run({
            "event": "broker_broadcast",
            "tyre_code": "TYRE-0001",
            "broker_chat_id": "12345",
        })

    assert result.success
    assert result.data["pushed"] is False
    assert result.data["reason"] == "no_origin_gps"
    mock_find.assert_not_awaited()
    ack_text = telegram_send.call_args.args[1]
    assert "no origin GPS" in ack_text.lower() or "origin GPS" in ack_text
