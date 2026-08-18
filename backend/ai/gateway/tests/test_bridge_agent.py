"""
Test the Bridge Agent — Week 2 of the WhatsApp↔Telegram bridge.

The bridge agent is the cross-channel router: driver WhatsApp events → broker
Telegram, and broker Telegram actions → driver WhatsApp + BFF mutations.

These tests mirror test_whatsapp_bot.py + test_telegram_broker_bot.py shape:
each event handler gets its own test, all external calls (BFF, Telegram bot
client, WhatsApp bot client) are mocked, and the agent's "fail loud in logs
not silently" rule is verified (bridge failures return AgentResult with
success=False, never raise).
"""
from unittest.mock import AsyncMock, patch

import pytest

from app.agents.bridge import BridgeAgent, _esc, _fmt_gps


@pytest.fixture
def agent():
    return BridgeAgent()


@pytest.fixture
def telegram_send_ok():
    """Patch the Telegram bot client send_message so broker pushes don't hit
    the real Bot API. The bridge agent calls
    `TelegramBrokerBot.send_proactive_message` / `send_load_request_to_broker`
    / `send_payment_confirmation_to_broker`, which all bottom out in
    `bot_client.send_message`."""
    with patch(
        "app.ai.telegram.bot_client.send_message",
        new_callable=AsyncMock,
        return_value={"success": True, "message_id": 42, "error": None},
    ) as m:
        yield m


@pytest.fixture
def whatsapp_send_ok():
    """Patch the WhatsApp bot's proactive send so driver pushes don't hit Meta."""
    with patch(
        "app.ai.whatsapp.graph_client.send_with_sms_fallback",
        new_callable=AsyncMock,
        return_value={"channel": "whatsapp", "message_id": "wamid.TEST"},
    ) as m:
        yield m


@pytest.fixture(autouse=True)
def bff_configured():
    """Autouse fixture: pretend the BFF is configured so the bridge agent's
    `_resolve_broker_chat_id_for_load_or_driver` actually calls the BFF client
    methods (which are individually patched per-test). Without this, the test
    env (no TYRE_WEB_BFF_URL / TYRE_INTERNAL_SERVICE_TOKEN) would short-circuit
    every lookup to None."""
    with patch("app.agents.bridge.bff_client._configured", return_value=True):
        yield


# ─────────────────────────────────────────────────────────────────
# Driver → Broker events
# ─────────────────────────────────────────────────────────────────

def _sent_text(mock_call):
    """Extract the text argument from a mocked send_message / send_with_sms_fallback call.
    Both are called positionally as (chat_id_or_phone, text), so text is args[1]."""
    return mock_call.call_args.args[1] if len(mock_call.call_args.args) >= 2 else mock_call.call_args.kwargs.get("text", "")


@pytest.mark.asyncio
async def test_driver_load_search_pushes_to_broker_telegram(agent, telegram_send_ok):
    """driver_load_search event → broker gets a Telegram push."""
    with patch.object(agent, "_resolve_broker_chat_id_for_load_or_driver",
                      new_callable=AsyncMock, return_value="12345"):
        result = await agent.run({
            "event": "driver_load_search",
            "driver_phone": "+919876543210",
            "driver_name": "Ramesh",
            "origin": "Patna",
            "destination": "Delhi",
        })
    assert result.success
    assert result.data["pushed"] is True
    assert result.data["channel"] == "telegram"
    telegram_send_ok.assert_awaited_once()
    # Verify the message content includes driver + route
    sent_text = _sent_text(telegram_send_ok)
    assert "Ramesh" in sent_text
    assert "Patna" in sent_text
    assert "Delhi" in sent_text


@pytest.mark.asyncio
async def test_driver_load_search_no_linked_broker_is_noop(agent, telegram_send_ok):
    """If no broker is linked, the event should be a no-op (not an error)."""
    with patch.object(agent, "_resolve_broker_chat_id_for_load_or_driver",
                      new_callable=AsyncMock, return_value=None):
        result = await agent.run({
            "event": "driver_load_search",
            "driver_phone": "+919876543210",
        })
    assert result.success  # the bridge event ran successfully, just no push
    assert result.data["pushed"] is False
    assert result.data["reason"] == "no_linked_broker"
    telegram_send_ok.assert_not_awaited()


@pytest.mark.asyncio
async def test_driver_load_accept_pushes_to_broker(agent, telegram_send_ok):
    """driver_load_accept event → broker gets 'Load accepted' Telegram push."""
    with patch.object(agent, "_resolve_broker_chat_id_for_load_or_driver",
                      new_callable=AsyncMock, return_value="12345"):
        result = await agent.run({
            "event": "driver_load_accept",
            "driver_phone": "+919876543210",
            "driver_name": "Ramesh",
            "tyre_code": "TYRE-0001",
            "advance_inr": 10000,
        })
    assert result.success
    assert result.data["pushed"] is True
    sent_text = _sent_text(telegram_send_ok)
    assert "TYRE-0001" in sent_text
    assert "Ramesh" in sent_text
    assert "10,000" in sent_text


@pytest.mark.asyncio
async def test_driver_status_loaded_pushes_to_broker(agent, telegram_send_ok):
    """driver_status_loaded event → broker gets 'Cargo loaded' Telegram push."""
    with patch.object(agent, "_resolve_broker_chat_id_for_load_or_driver",
                      new_callable=AsyncMock, return_value="12345"):
        result = await agent.run({
            "event": "driver_status_loaded",
            "driver_phone": "+919876543210",
            "tyre_code": "TYRE-0001",
            "truck_number": "BR01GA1234",
        })
    assert result.success
    sent_text = _sent_text(telegram_send_ok)
    assert "Cargo loaded" in sent_text
    assert "TYRE-0001" in sent_text
    assert "BR01GA1234" in sent_text


@pytest.mark.asyncio
async def test_driver_status_reached_pushes_to_broker(agent, telegram_send_ok):
    """driver_status_reached event → broker gets 'Reached destination' push."""
    with patch.object(agent, "_resolve_broker_chat_id_for_load_or_driver",
                      new_callable=AsyncMock, return_value="12345"):
        result = await agent.run({
            "event": "driver_status_reached",
            "driver_phone": "+919876543210",
            "tyre_code": "TYRE-0001",
            "destination": "Delhi",
            "gps_lat": 28.6139,
            "gps_lng": 77.2090,
        })
    assert result.success
    sent_text = _sent_text(telegram_send_ok)
    assert "Reached destination" in sent_text
    assert "Delhi" in sent_text
    assert "28.6139" in sent_text  # GPS formatted to 4 decimals


@pytest.mark.asyncio
async def test_driver_pod_uploaded_pushes_to_broker(agent, telegram_send_ok):
    """driver_pod_uploaded event → broker gets 'POD uploaded' push."""
    with patch.object(agent, "_resolve_broker_chat_id_for_load_or_driver",
                      new_callable=AsyncMock, return_value="12345"):
        result = await agent.run({
            "event": "driver_pod_uploaded",
            "driver_phone": "+919876543210",
            "tyre_code": "TYRE-0001",
            "photo_url": "https://s3.example.com/pod.jpg",
            "gps_lat": 28.6139,
            "gps_lng": 77.2090,
        })
    assert result.success
    sent_text = _sent_text(telegram_send_ok)
    assert "POD uploaded" in sent_text
    assert "TYRE-0001" in sent_text
    assert "pod.jpg" in sent_text


@pytest.mark.asyncio
async def test_driver_emergency_pushes_alert_to_broker(agent, telegram_send_ok):
    """driver_emergency event → broker gets a DRIVER EMERGENCY alert."""
    with patch.object(agent, "_resolve_broker_chat_id_for_load_or_driver",
                      new_callable=AsyncMock, return_value="12345"):
        result = await agent.run({
            "event": "driver_emergency",
            "driver_phone": "+919876543210",
            "driver_name": "Ramesh",
            "tyre_code": "TYRE-0001",
            "description": "truck kharab NH48",
        })
    assert result.success
    sent_text = _sent_text(telegram_send_ok)
    assert "EMERGENCY" in sent_text
    assert "Ramesh" in sent_text
    assert "+919876543210" in sent_text
    assert "truck kharab NH48" in sent_text


# ─────────────────────────────────────────────────────────────────
# Broker → Driver events
# ─────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_broker_cancel_load_calls_bff_and_notifies_driver(agent, whatsapp_send_ok):
    """broker_cancel_load event → BFF /loads/cancel + driver WhatsApp push."""
    with patch("app.agents.bridge.bff_client.cancel_load",
               new_callable=AsyncMock,
               return_value={"success": True, "data": {"tyre_code": "TYRE-0001"}}):
        result = await agent.run({
            "event": "broker_cancel_load",
            "tyre_code": "TYRE-0001",
            "driver_phone": "+919876543210",
            "reason": "broker changed mind",
        })
    assert result.success
    assert result.data["cancelled_in_db"] is True
    assert result.data["driver_notified"] is True
    whatsapp_send_ok.assert_awaited_once()
    sent_text = whatsapp_send_ok.call_args.args[1]  # (phone, text)
    assert "TYRE-0001" in sent_text
    assert "cancelled" in sent_text.lower()


@pytest.mark.asyncio
async def test_broker_cancel_load_without_driver_phone_only_cancels_in_db(agent, whatsapp_send_ok):
    """If the broker cancels a load with no assigned truck, only the DB row is
    cancelled — no driver to notify."""
    with patch("app.agents.bridge.bff_client.cancel_load",
               new_callable=AsyncMock,
               return_value={"success": True, "data": {"tyre_code": "TYRE-0001"}}):
        result = await agent.run({
            "event": "broker_cancel_load",
            "tyre_code": "TYRE-0001",
            "driver_phone": "",
        })
    assert result.success
    assert result.data["cancelled_in_db"] is True
    assert result.data["driver_notified"] is False
    whatsapp_send_ok.assert_not_awaited()


@pytest.mark.asyncio
async def test_broker_release_balance_success_path(agent, whatsapp_send_ok, telegram_send_ok):
    """broker_release_balance event → BFF release + driver WhatsApp + broker ack."""
    with patch("app.agents.bridge.bff_client.release_balance_manually",
               new_callable=AsyncMock,
               return_value={
                   "success": True,
                   "data": {"amount_inr": 35000, "upi_ref": "upi_xyz_789"},
               }):
        result = await agent.run({
            "event": "broker_release_balance",
            "tyre_code": "TYRE-0001",
            "driver_phone": "+919876543210",
            "broker_chat_id": "12345",
        })
    assert result.success
    assert result.data["released"] is True
    assert result.data["amount_inr"] == 35000
    assert result.data["upi_ref"] == "upi_xyz_789"
    assert result.data["driver_notified"] is True
    assert result.data["broker_acked"] is True
    # Driver got a WhatsApp with amount + ref
    driver_text = whatsapp_send_ok.call_args.args[1]
    assert "35,000" in driver_text
    assert "upi_xyz_789" in driver_text
    # Broker got a Telegram ack with amount + ref
    broker_text = _sent_text(telegram_send_ok)
    assert "35,000" in broker_text
    assert "upi_xyz_789" in broker_text


@pytest.mark.asyncio
async def test_broker_release_balance_failure_acks_broker(agent, whatsapp_send_ok, telegram_send_ok):
    """If the BFF release fails, the broker should get a failure ack and the
    driver should NOT get a WhatsApp push."""
    with patch("app.agents.bridge.bff_client.release_balance_manually",
               new_callable=AsyncMock,
               return_value={"success": False, "error": "escrow_unavailable"}):
        result = await agent.run({
            "event": "broker_release_balance",
            "tyre_code": "TYRE-0001",
            "driver_phone": "+919876543210",
            "broker_chat_id": "12345",
        })
    assert result.success  # the bridge event itself ran, just the release failed
    assert result.data["released"] is False
    assert result.data["driver_notified"] is False
    assert result.data["broker_acked"] is True
    whatsapp_send_ok.assert_not_awaited()
    # Broker ack says "failed"
    broker_text = _sent_text(telegram_send_ok)
    assert "failed" in broker_text.lower()


@pytest.mark.asyncio
async def test_broker_broadcast_load_not_found(agent):
    """broker_broadcast for a non-existent load should fail gracefully with
    load_not_found (not the old Week 2 'week3_stub' reason).

    Week 3 wired _on_broker_broadcast to the real broadcast service, which
    first resolves the load via the BFF. When the load can't be found (or the
    BFF is unconfigured, as in tests), the handler returns load_not_found and
    acks the broker with a failure message."""
    # BFF is unconfigured in the test env, so _resolve_load_for_broadcast returns None
    result = await agent.run({
        "event": "broker_broadcast",
        "tyre_code": "TYRE-NONEXISTENT",
        "broker_chat_id": "12345",
    })
    assert result.success  # the bridge event ran, just the broadcast was denied
    assert result.data["pushed"] is False
    assert result.data["reason"] == "load_not_found"
    assert result.data["tyre_code"] == "TYRE-NONEXISTENT"


# ─────────────────────────────────────────────────────────────────
# Payment events → broker Telegram
# ─────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_payment_advance_notifies_broker(agent, telegram_send_ok):
    """payment_advance event → broker gets advance confirmation on Telegram."""
    with patch.object(agent, "_resolve_broker_chat_id_for_load_or_driver",
                      new_callable=AsyncMock, return_value="12345"):
        result = await agent.run({
            "event": "payment_advance",
            "tyre_code": "TYRE-0001",
            "amount_inr": 10000,
            "upi_ref": "upi_abc_123",
        })
    assert result.success
    assert result.data["pushed"] is True
    sent_text = _sent_text(telegram_send_ok)
    assert "10,000" in sent_text
    assert "advance" in sent_text.lower()
    assert "upi_abc_123" in sent_text


@pytest.mark.asyncio
async def test_payment_balance_notifies_broker(agent, telegram_send_ok):
    """payment_balance event → broker gets balance confirmation on Telegram."""
    with patch.object(agent, "_resolve_broker_chat_id_for_load_or_driver",
                      new_callable=AsyncMock, return_value="12345"):
        result = await agent.run({
            "event": "payment_balance",
            "tyre_code": "TYRE-0001",
            "amount_inr": 35000,
            "upi_ref": "upi_xyz_789",
        })
    assert result.success
    sent_text = _sent_text(telegram_send_ok)
    assert "35,000" in sent_text
    assert "balance" in sent_text.lower()


# ─────────────────────────────────────────────────────────────────
# Unknown event handling
# ─────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_unknown_event_returns_failure(agent):
    """Unknown event names should return AgentResult with success=False + unknown_event."""
    result = await agent.run({"event": "frobnicate_something", "tyre_code": "TYRE-0001"})
    assert result.success is False
    assert result.data["event"] == "frobnicate_something"
    assert result.data["error"] == "unknown_event"


@pytest.mark.asyncio
async def test_missing_event_field_returns_failure(agent):
    """Missing event field should return AgentResult with success=False."""
    result = await agent.run({"tyre_code": "TYRE-0001"})
    assert result.success is False
    assert "unknown_event" in result.data["error"]


# ─────────────────────────────────────────────────────────────────
# Broker chat_id resolution
# ─────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_resolve_chat_id_explicit_field(agent):
    """Explicit broker_chat_id should win over BFF lookups."""
    chat_id = await agent._resolve_broker_chat_id_for_load_or_driver({
        "broker_chat_id": "99999",
        "tyre_code": "TYRE-0001",  # would trigger BFF lookup if explicit field absent
    })
    assert chat_id == "99999"


@pytest.mark.asyncio
async def test_resolve_chat_id_via_tyre_code(agent):
    """When broker_chat_id is absent, fall back to tyre_code → load → broker."""
    with patch("app.agents.bridge.bff_client.get_load_by_tyre_code",
               new_callable=AsyncMock,
               return_value={"success": True, "data": {"broker_telegram_chat_id": "88888"}}):
        chat_id = await agent._resolve_broker_chat_id_for_load_or_driver({
            "tyre_code": "TYRE-0001",
        })
    assert chat_id == "88888"


@pytest.mark.asyncio
async def test_resolve_chat_id_via_driver_phone(agent):
    """When broker_chat_id + tyre_code are both absent, fall back to
    driver_phone → active trip → load → broker."""
    with patch("app.agents.bridge.bff_client.get_driver_active_trip",
               new_callable=AsyncMock,
               return_value={"success": True, "data": {"broker_telegram_chat_id": "77777"}}):
        chat_id = await agent._resolve_broker_chat_id_for_load_or_driver({
            "driver_phone": "+919876543210",
        })
    assert chat_id == "77777"


@pytest.mark.asyncio
async def test_resolve_chat_id_returns_none_when_bff_unconfigured(agent):
    """When BFF isn't configured, returns None (no-op rather than error).

    This test explicitly overrides the autouse `bff_configured` fixture by
    re-patching `_configured` to False."""
    with patch("app.agents.bridge.bff_client._configured", return_value=False):
        chat_id = await agent._resolve_broker_chat_id_for_load_or_driver({
            "tyre_code": "TYRE-0001",
            "driver_phone": "+919876543210",
        })
    assert chat_id is None


# ─────────────────────────────────────────────────────────────────
# HTML escape helper (defense against injection via driver name etc.)
# ─────────────────────────────────────────────────────────────────

def test_esc_html_escape():
    """HTML special chars must be escaped for Telegram's HTML parse_mode."""
    assert _esc("<script>alert(1)</script>") == "&lt;script&gt;alert(1)&lt;/script&gt;"
    assert _esc("a & b") == "a &amp; b"
    assert _esc(None) == ""
    assert _esc(123) == "123"


def test_fmt_gps_valid():
    """GPS coordinates should be formatted to 4 decimal places."""
    assert _fmt_gps(28.6139, 77.2090) == "28.6139, 77.2090"
    assert _fmt_gps(0, 0) == "0.0000, 0.0000"


def test_fmt_gps_missing():
    """Missing GPS should return 'unavailable'."""
    assert _fmt_gps(None, 77.2090) == "unavailable"
    assert _fmt_gps(28.6139, None) == "unavailable"
    assert _fmt_gps(None, None) == "unavailable"


# ─────────────────────────────────────────────────────────────────
# Failure-mode: bridge never crashes the caller
# ─────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_bridge_handler_exception_returns_agentresult_not_raises(agent):
    """If a handler raises, the agent should catch it and return AgentResult
    with success=False, never propagate the exception."""
    with patch.object(agent, "_on_driver_emergency", side_effect=RuntimeError("boom")):
        result = await agent.run({"event": "driver_emergency", "driver_phone": "+919876543210"})
    assert result.success is False
    assert "boom" in result.error
    assert result.data["event"] == "driver_emergency"


# ─────────────────────────────────────────────────────────────────
# End-to-end: driver bot → bridge → broker Telegram
# ─────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_end_to_end_driver_load_search_to_broker_telegram(telegram_send_ok):
    """The WhatsApp driver bot's _fire_bridge_event helper should reach the
    bridge agent and push to broker Telegram. This is the real end-to-end
    flow that ships in Week 2."""
    from app.ai.whatsapp.driver_bot import _fire_bridge_event
    with patch("app.agents.bridge.BridgeAgent._resolve_broker_chat_id_for_load_or_driver",
               new_callable=AsyncMock, return_value="12345"):
        await _fire_bridge_event({
            "event": "driver_load_search",
            "driver_phone": "+919876543210",
            "origin": "Patna",
            "destination": "Delhi",
        })
    telegram_send_ok.assert_awaited_once()
    sent_text = _sent_text(telegram_send_ok)
    assert "Patna" in sent_text
    assert "Delhi" in sent_text


@pytest.mark.asyncio
async def test_fire_bridge_event_swallows_exceptions(telegram_send_ok):
    """If the bridge agent raises, _fire_bridge_event must swallow it —
    a Telegram outage must never crash a driver WhatsApp flow."""
    from app.ai.whatsapp.driver_bot import _fire_bridge_event
    with patch("app.agents.bridge.BridgeAgent.run",
               new_callable=AsyncMock, side_effect=RuntimeError("telegram is down")):
        # Should NOT raise
        await _fire_bridge_event({"event": "driver_load_search", "driver_phone": "+919876543210"})
    telegram_send_ok.assert_not_awaited()


# ─────────────────────────────────────────────────────────────────
# End-to-end: broker Telegram button → bridge → BFF + driver WhatsApp
# ─────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_end_to_end_broker_cancel_button_to_driver_whatsapp(whatsapp_send_ok):
    """The broker bot's cancel callback should reach the bridge agent and push
    a cancel notification to the driver's WhatsApp."""
    from app.ai.telegram.broker_bot import TelegramBrokerBot, TelegramUpdate
    bot = TelegramBrokerBot()
    update = TelegramUpdate(
        update_id=1,
        chat_id=12345,
        chat_type="private",
        from_user_id=999,
        callback_query_id="cq_cancel",
        callback_data="cancel:TYRE-0001",
    )
    with patch("app.ai.telegram.bot_client.answer_callback_query",
               new_callable=AsyncMock, return_value={"success": True}), \
         patch("app.agents.bridge.bff_client.cancel_load",
               new_callable=AsyncMock,
               return_value={"success": True, "data": {"tyre_code": "TYRE-0001"}}), \
         patch("app.agents.bridge.BridgeAgent._resolve_broker_chat_id_for_load_or_driver",
               new_callable=AsyncMock, return_value="12345"):
        # The bridge's _on_broker_cancel_load uses driver_phone from the event payload.
        # In a real flow the BFF /loads/cancel returns the driver_phone; for the test
        # we patch the bridge to inject it.
        original_run = BridgeAgent.run

        async def patched_run(self, payload):
            # Inject driver_phone so the WhatsApp push fires
            if payload.get("event") == "broker_cancel_load":
                payload.setdefault("driver_phone", "+919876543210")
            return await original_run(self, payload)

        with patch.object(BridgeAgent, "run", patched_run):
            reply = await bot.process_update(update)
    assert reply is not None
    assert "Cancelled" in reply.text or "cancelled" in reply.text.lower()
    whatsapp_send_ok.assert_awaited()
    sent_text = whatsapp_send_ok.call_args.args[1]
    assert "TYRE-0001" in sent_text
