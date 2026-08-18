"""
Test the WhatsApp Driver Bot — 80% of drivers use WhatsApp.
"""
from unittest.mock import AsyncMock, patch

import pytest

from app.ai.whatsapp.driver_bot import WhatsAppDriverBot, WhatsAppMessage


@pytest.fixture
def bot():
    return WhatsAppDriverBot()


@pytest.fixture
def sent_ok():
    """Simulate a successful WhatsApp delivery.

    The bot's proactive-send path imports `send_with_sms_fallback` from
    app.ai.whatsapp.graph_client at call time; that integration gracefully skips
    (channel="none") when TYRE_WHATSAPP_* / TYRE_SMS_* are unset. Patching it lets
    the send tests deterministically verify message formatting + the success flag
    without live credentials.
    """
    with patch(
        "app.ai.whatsapp.graph_client.send_with_sms_fallback",
        new_callable=AsyncMock,
        return_value={"channel": "whatsapp", "message_id": "wamid.TEST"},
    ) as m:
        yield m


# ─────────────────────────────────────────────────────────────────
# Intent Detection Tests
# ─────────────────────────────────────────────────────────────────

def test_detect_load_search_hindi(bot):
    """Hindi 'लोड ढूंढ' = LOAD_SEARCH."""
    assert bot._detect_intent("लोड ढूंढ") == "LOAD_SEARCH"


def test_detect_load_search_english(bot):
    """English 'find load' = LOAD_SEARCH."""
    assert bot._detect_intent("find load") == "LOAD_SEARCH"


def test_detect_load_search_mixed(bot):
    """Mixed 'Patna se Delhi jana hai' = LOAD_SEARCH."""
    assert bot._detect_intent("Patna se Delhi jana hai") == "LOAD_SEARCH"


def test_detect_accept(bot):
    """'accept' = LOAD_ACCEPT."""
    assert bot._detect_intent("accept 1") == "LOAD_ACCEPT"


def test_detect_accept_number(bot):
    """'1' = LOAD_ACCEPT."""
    assert bot._detect_intent("1") == "LOAD_ACCEPT"


def test_detect_status_loaded(bot):
    """'loaded' = STATUS_UPDATE."""
    assert bot._detect_intent("loaded") == "STATUS_UPDATE"


def test_detect_status_reached(bot):
    """'reached Delhi' = STATUS_UPDATE."""
    assert bot._detect_intent("reached Delhi") == "STATUS_UPDATE"


def test_detect_market_rate(bot):
    """'rate' = MARKET_RATE."""
    assert bot._detect_intent("Patna Delhi rate?") == "MARKET_RATE"


def test_detect_emergency(bot):
    """'help' = EMERGENCY."""
    assert bot._detect_intent("help") == "EMERGENCY"


def test_detect_emergency_breakdown(bot):
    """'truck kharab' = EMERGENCY."""
    assert bot._detect_intent("truck kharab ho gaya") == "EMERGENCY"


def test_detect_onboarding(bot):
    """'main Ramesh hoon' = ONBOARDING."""
    assert bot._detect_intent("main Ramesh hoon") == "ONBOARDING"


def test_detect_unknown(bot):
    """Random text = UNKNOWN."""
    assert bot._detect_intent("xyz random text") == "UNKNOWN"


# ─────────────────────────────────────────────────────────────────
# Message Processing Tests
# ─────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_process_load_search_returns_3_loads(bot):
    """Load search should return 3 loads with accept buttons."""
    msg = WhatsAppMessage(
        from_phone="+919876543210",
        message_type="text",
        text_body="Patna se Delhi load chahiye",
    )
    # Load search calls the BFF /loads/match route (Dispatch agent). Mock it to return
    # three ranked matches so the bot formats a 3-load reply with accept buttons.
    match_payload = {"data": {"matches": [
        {"tyre_code": f"TYRE-000{i}", "origin": "Patna", "destination": "Delhi",
         "rate": 45000, "advance": 10000, "truck_type_req": "HXL (32ft)",
         "goods_type": "General", "broker_name": "ABC Logistics"}
        for i in range(1, 4)
    ]}}
    with patch("app.ai.whatsapp.driver_bot.bff_client.match_loads",
               new_callable=AsyncMock, return_value=match_payload):
        reply = await bot.process_incoming_message(msg)
    assert "3 loads" in reply.text or "3" in reply.text
    assert reply.interactive_buttons is not None
    assert len(reply.interactive_buttons) == 3


@pytest.mark.asyncio
async def test_process_accept_load_1(bot):
    """Accept '1' should confirm load accepted + mention advance.

    Patches bff_client.assign_load to return a successful assignment so the
    bot success path is exercised. Also patches the bridge agent hook so the
    Week 2 bridge call doesn't try to hit Telegram / the BFF."""
    msg = WhatsAppMessage(
        from_phone="+919876543210",
        message_type="text",
        text_body="1",
    )
    assign_payload = {
        "advance_amount_inr": 10000,
        "trip_id": "trip_test_1",
        "pickup_address": "Patna Goods Yard, Phulwari",
        "shipper_phone": "+919812345678",
        "loading_slot": "2026-07-04 09:00",
    }
    with patch("app.ai.whatsapp.driver_bot.bff_client.assign_load",
               new_callable=AsyncMock, return_value=assign_payload), \
         patch("app.ai.whatsapp.driver_bot._fire_bridge_event",
               new_callable=AsyncMock):
        reply = await bot.process_incoming_message(msg)
    assert "accepted" in reply.text.lower() or "स्वीकार" in reply.text
    assert "advance" in reply.text.lower() or "अग्रिम" in reply.text or "₹10,000" in reply.text


@pytest.mark.asyncio
async def test_process_status_loaded(bot):
    """'loaded' should update status + ask for 'reached'."""
    msg = WhatsAppMessage(
        from_phone="+919876543210",
        message_type="text",
        text_body="loaded",
    )
    reply = await bot.process_incoming_message(msg)
    assert "loaded" in reply.text.lower() or "लोड" in reply.text
    assert "reached" in reply.text.lower() or "पहुंच" in reply.text


@pytest.mark.asyncio
async def test_process_status_reached(bot):
    """'reached' should ask for POD photo."""
    msg = WhatsAppMessage(
        from_phone="+919876543210",
        message_type="text",
        text_body="reached Delhi",
    )
    reply = await bot.process_incoming_message(msg)
    assert "POD" in reply.text or "photo" in reply.text.lower() or "फोटो" in reply.text


@pytest.mark.asyncio
async def test_process_market_rate(bot):
    """'rate' should return market rate."""
    msg = WhatsAppMessage(
        from_phone="+919876543210",
        message_type="text",
        text_body="Patna Delhi rate?",
    )
    reply = await bot.process_incoming_message(msg)
    assert "₹" in reply.text
    assert "Patna" in reply.text and "Delhi" in reply.text


@pytest.mark.asyncio
async def test_process_emergency(bot):
    """Emergency should dispatch mechanic."""
    msg = WhatsAppMessage(
        from_phone="+919876543210",
        message_type="text",
        text_body="truck kharab ho gaya NH48",
    )
    reply = await bot.process_incoming_message(msg)
    assert "mechanic" in reply.text.lower() or "मैकेनिक" in reply.text
    assert "112" in reply.text  # emergency number


@pytest.mark.asyncio
async def test_process_unknown_returns_help(bot):
    """Unknown message should return help text."""
    msg = WhatsAppMessage(
        from_phone="+919876543210",
        message_type="text",
        text_body="xyz random text",
    )
    reply = await bot.process_incoming_message(msg)
    assert "TYRE commands" in reply.text or "commands" in reply.text.lower()


@pytest.mark.asyncio
async def test_process_image_as_pod_upload(bot):
    """Image message = POD upload."""
    msg = WhatsAppMessage(
        from_phone="+919876543210",
        message_type="image",
        image_base64="base64_stub",
    )
    reply = await bot.process_incoming_message(msg)
    assert "POD" in reply.text or "photo" in reply.text.lower()


@pytest.mark.asyncio
async def test_process_location_share_updates_gps(bot):
    """Week 3 broadcast: a WhatsApp location pin should call
    bff_client.update_driver_location and reply with a success message."""
    msg = WhatsAppMessage(
        from_phone="+919876543210",
        message_type="location",
        location_lat=25.5941,
        location_lng=85.1376,
        location_label="Patna, Bihar",
    )
    with patch("app.ai.whatsapp.driver_bot.bff_client.update_driver_location",
               new_callable=AsyncMock,
               return_value={"success": True, "data": {"id": "drv_1"}}):
        reply = await bot.process_incoming_message(msg)
    assert "Location updated" in reply.text or "location" in reply.text.lower()


@pytest.mark.asyncio
async def test_process_location_share_bff_failure_is_graceful(bot):
    """Week 3 broadcast: if the BFF location update fails, the driver should
    still get a friendly reply (not a crash)."""
    msg = WhatsAppMessage(
        from_phone="+919876543210",
        message_type="location",
        location_lat=25.5941,
        location_lng=85.1376,
    )
    with patch("app.ai.whatsapp.driver_bot.bff_client.update_driver_location",
               new_callable=AsyncMock, side_effect=RuntimeError("bff down")):
        reply = await bot.process_incoming_message(msg)
    assert "couldn't save" in reply.text.lower() or "try again" in reply.text.lower()


# ─────────────────────────────────────────────────────────────────
# Proactive Message Tests
# ─────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_send_payment_confirmation(bot, sent_ok):
    """Payment confirmation push should include amount + ref."""
    result = await bot.send_payment_confirmation(
        phone="+919876543210",
        amount_inr=10000,
        upi_ref="upi_123_3210",
        payment_type="advance",
    )
    assert result["success"] is True
    assert "10,000" in result["text"]
    assert "upi_123_3210" in result["text"]


@pytest.mark.asyncio
async def test_send_return_load_suggestion_hindi(bot, sent_ok):
    """Return load suggestion in Hindi."""
    result = await bot.send_return_load_suggestion(
        phone="+919876543210",
        return_load_tyre_code="TYRE-9876",
        origin="Delhi",
        destination="Patna",
        rate_inr=28000,
        driver_locale="hi",
    )
    assert result["success"] is True
    assert "TYRE-9876" in result["text"]
    assert "28,000" in result["text"]
    # Should contain Devanagari (Hindi)
    assert any("\u0900" <= c <= "\u097F" for c in result["text"])


@pytest.mark.asyncio
async def test_send_return_load_suggestion_bhojpuri(bot, sent_ok):
    """Return load suggestion in Bhojpuri."""
    result = await bot.send_return_load_suggestion(
        phone="+919876543210",
        return_load_tyre_code="TYRE-9876",
        origin="Delhi",
        destination="Patna",
        rate_inr=28000,
        driver_locale="bho",
    )
    assert result["success"] is True
    assert any("\u0900" <= c <= "\u097F" for c in result["text"])


@pytest.mark.asyncio
async def test_send_return_load_suggestion_english(bot, sent_ok):
    """Return load suggestion in English."""
    result = await bot.send_return_load_suggestion(
        phone="+919876543210",
        return_load_tyre_code="TYRE-9876",
        origin="Delhi",
        destination="Patna",
        rate_inr=28000,
        driver_locale="en",
    )
    assert result["success"] is True
    assert "Return load" in result["text"]
    assert "TYRE-9876" in result["text"]
