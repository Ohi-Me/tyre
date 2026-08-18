"""
Test the Telegram Broker Bot — broker side of the WhatsApp↔Telegram bridge.

Mirrors test_whatsapp_bot.py shape: intent/command detection, message
processing, proactive message sends. The bot is much simpler than the
driver bot (no voice notes, no POD photos, no multilingual NLU) because
brokers are tech-savvy and the bot is text-command driven.
"""
from unittest.mock import AsyncMock, patch

import pytest

from app.ai.telegram.broker_bot import (
    TelegramBrokerBot,
    TelegramUpdate,
)


@pytest.fixture
def bot():
    return TelegramBrokerBot()


@pytest.fixture
def sent_ok():
    """Simulate a successful Telegram delivery.

    The bot's proactive-send path calls `bot_client.send_message` — patching
    it lets the send tests deterministically verify message formatting + the
    success flag without live BotFather credentials."""
    with patch(
        "app.ai.telegram.bot_client.send_message",
        new_callable=AsyncMock,
        return_value={"success": True, "message_id": 42, "error": None},
    ) as m:
        yield m


@pytest.fixture
def answered_callback():
    """Patch answer_callback_query so callback tests don't try to hit Telegram."""
    with patch(
        "app.ai.telegram.bot_client.answer_callback_query",
        new_callable=AsyncMock,
        return_value={"success": True, "error": None},
    ) as m:
        yield m


def _msg(text: str, chat_id: int = 12345, user_id: int = 999) -> TelegramUpdate:
    """Build a minimal message-shaped Update for testing."""
    return TelegramUpdate(
        update_id=1,
        chat_id=chat_id,
        chat_type="private",
        from_user_id=user_id,
        from_first_name="Ramesh",
        message_id=10,
        text=text,
    )


# ─────────────────────────────────────────────────────────────────
# /start command
# ─────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_start_greets_and_invites_link(bot):
    """Plain /start with no deep-link payload should greet + explain /link."""
    update = _msg("/start")
    reply = await bot.process_update(update)
    assert reply is not None
    assert "Namaste" in reply.text
    assert "/link" in reply.text
    assert "BRK-CODE" in reply.text


@pytest.mark.asyncio
async def test_start_with_deep_link_attempts_link(bot):
    """/start BRK-PAT-001 should attempt to link to that broker code."""
    update = _msg("/start BRK-PAT-001")
    # Patch _link_broker to simulate a successful BFF call
    with patch.object(
        bot, "_link_broker", new_callable=AsyncMock,
        return_value={"success": True, "error": None, "data": {"broker_code": "BRK-PAT-001"}},
    ):
        reply = await bot.process_update(update)
    assert reply is not None
    assert "Linked" in reply.text or "linked" in reply.text
    assert "BRK-PAT-001" in reply.text


@pytest.mark.asyncio
async def test_start_with_deep_link_handles_failure(bot):
    """/start BAD-CODE should surface the link failure clearly."""
    update = _msg("/start BAD-CODE")
    with patch.object(
        bot, "_link_broker", new_callable=AsyncMock,
        return_value={"success": False, "error": "broker_not_found", "data": None},
    ):
        reply = await bot.process_update(update)
    assert reply is not None
    assert "Couldn't link" in reply.text or "⚠️" in reply.text
    assert "BAD-CODE" in reply.text


# ─────────────────────────────────────────────────────────────────
# /link command
# ─────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_link_without_args_shows_usage(bot):
    """/link alone should print usage."""
    update = _msg("/link")
    reply = await bot.process_update(update)
    assert reply is not None
    assert "Usage" in reply.text or "BRK-CODE" in reply.text


@pytest.mark.asyncio
async def test_link_with_code_and_phone_succeeds(bot):
    """/link BRK-PAT-001 +919876543210 should call _link_broker and confirm."""
    update = _msg("/link BRK-PAT-001 +919876543210")
    with patch.object(
        bot, "_link_broker", new_callable=AsyncMock,
        return_value={"success": True, "error": None, "data": {"broker_code": "BRK-PAT-001"}},
    ) as mock_link:
        reply = await bot.process_update(update)
    assert reply is not None
    assert "Linked" in reply.text or "linked" in reply.text
    mock_link.assert_awaited_once()
    # Verify it was called with the right args
    args, kwargs = mock_link.call_args
    assert kwargs.get("broker_code") == "BRK-PAT-001"
    assert kwargs.get("broker_phone") == "+919876543210"


@pytest.mark.asyncio
async def test_link_with_bff_failure_returns_error(bot):
    """/link should surface BFF errors honestly."""
    update = _msg("/link BRK-PAT-001 +919876543210")
    with patch.object(
        bot, "_link_broker", new_callable=AsyncMock,
        return_value={"success": False, "error": "phone_mismatch", "data": None},
    ):
        reply = await bot.process_update(update)
    assert reply is not None
    assert "Link failed" in reply.text or "⚠️" in reply.text
    assert "phone_mismatch" in reply.text


# ─────────────────────────────────────────────────────────────────
# /help command
# ─────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_help_lists_all_commands(bot):
    """/help should mention /start, /link, /loads, /status, /unlink."""
    update = _msg("/help")
    reply = await bot.process_update(update)
    assert reply is not None
    for cmd in ("/start", "/link", "/loads", "/status", "/unlink", "/help"):
        assert cmd in reply.text


# ─────────────────────────────────────────────────────────────────
# /status command
# ─────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_status_when_not_linked(bot):
    """/status should say 'not linked' when no broker is linked to this chat."""
    update = _msg("/status")
    with patch.object(
        bot, "_lookup_broker", new_callable=AsyncMock, return_value=None,
    ):
        reply = await bot.process_update(update)
    assert reply is not None
    assert "not linked" in reply.text.lower() or "Not linked" in reply.text


@pytest.mark.asyncio
async def test_status_when_linked_shows_broker_info(bot):
    """/status should show broker code + name when linked."""
    update = _msg("/status")
    broker_payload = {
        "success": True,
        "data": {"broker_code": "BRK-PAT-001", "name": "Ramesh Brokers", "phone": "+919876543210", "region": "IN"},
    }
    with patch.object(
        bot, "_lookup_broker", new_callable=AsyncMock, return_value=broker_payload,
    ):
        reply = await bot.process_update(update)
    assert reply is not None
    assert "BRK-PAT-001" in reply.text
    assert "Ramesh Brokers" in reply.text
    assert "linked" in reply.text.lower() or "Linked" in reply.text


# ─────────────────────────────────────────────────────────────────
# /loads command
# ─────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_loads_when_not_linked(bot):
    """/loads should prompt to /link when no broker is linked."""
    update = _msg("/loads")
    with patch.object(bot, "_lookup_broker", new_callable=AsyncMock, return_value=None):
        reply = await bot.process_update(update)
    assert reply is not None
    assert "/link" in reply.text


@pytest.mark.asyncio
async def test_loads_returns_open_loads_with_buttons(bot):
    """/loads should list open loads + inline keyboard."""
    update = _msg("/loads")
    broker_payload = {"success": True, "data": {"broker_code": "BRK-PAT-001"}}
    loads_payload = {
        "success": True,
        "data": {
            "broker_code": "BRK-PAT-001",
            "loads": [
                {"tyre_code": "TYRE-0001", "origin": "Patna", "destination": "Delhi",
                 "offered_rate": 45000, "advance_offered": 10000, "status": "OPEN"},
                {"tyre_code": "TYRE-0002", "origin": "Patna", "destination": "Kolkata",
                 "offered_rate": 26000, "advance_offered": 6000, "status": "OPEN"},
            ],
        },
    }
    with patch.object(bot, "_lookup_broker", new_callable=AsyncMock, return_value=broker_payload), \
         patch("app.ai.telegram.broker_bot.bff_client.list_broker_loads",
               new_callable=AsyncMock, return_value=loads_payload):
        reply = await bot.process_update(update)
    assert reply is not None
    assert "TYRE-0001" in reply.text
    assert "TYRE-0002" in reply.text
    assert "Patna" in reply.text and "Delhi" in reply.text
    assert reply.inline_keyboard is not None
    assert len(reply.inline_keyboard) == 2  # one row per load


@pytest.mark.asyncio
async def test_loads_with_no_open_loads(bot):
    """/loads should report no active loads when all are delivered/cancelled.

    Week 2 changed the empty-state copy from "No open loads" to "No active
    loads" because /loads now shows ASSIGNED + IN_TRANSIT loads too (broker
    needs to act on those — release balance, cancel, track)."""
    update = _msg("/loads")
    broker_payload = {"success": True, "data": {"broker_code": "BRK-PAT-001"}}
    loads_payload = {
        "success": True,
        "data": {
            "broker_code": "BRK-PAT-001",
            "loads": [
                {"tyre_code": "TYRE-0001", "origin": "Patna", "destination": "Delhi",
                 "offered_rate": 45000, "advance_offered": 10000, "status": "DELIVERED"},
            ],
        },
    }
    with patch.object(bot, "_lookup_broker", new_callable=AsyncMock, return_value=broker_payload), \
         patch("app.ai.telegram.broker_bot.bff_client.list_broker_loads",
               new_callable=AsyncMock, return_value=loads_payload):
        reply = await bot.process_update(update)
    assert reply is not None
    assert "No active loads" in reply.text or "no active" in reply.text.lower()


# ─────────────────────────────────────────────────────────────────
# Callback query handling (inline button press)
# ─────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_callback_broadcast_queued(bot, answered_callback):
    """Pressing the Broadcast button should ack + say broadcast queued.

    Week 2 routes broadcast through the bridge agent (broker_broadcast event,
    which is a Week 3 stub — returns week3_stub reason). The broker bot formats
    that into the 'Broadcast queued' reply."""
    update = TelegramUpdate(
        update_id=2,
        chat_id=12345,
        chat_type="private",
        from_user_id=999,
        callback_query_id="cq_1",
        callback_data="broadcast:TYRE-0001",
    )
    from app.agents.base import AgentResult
    fake_result = AgentResult(
        success=True,
        data={"pushed": False, "reason": "week3_stub", "message": "Nearby-driver fan-out ships in Week 3."},
        latency_ms=5,
    )
    with patch("app.agents.bridge.BridgeAgent.run",
               new_callable=AsyncMock, return_value=fake_result):
        reply = await bot.process_update(update)
    assert reply is not None
    assert "Broadcast queued" in reply.text
    assert "TYRE-0001" in reply.text
    answered_callback.assert_awaited_once_with("cq_1")


@pytest.mark.asyncio
async def test_callback_cancel_requested(bot, answered_callback):
    """Pressing the Cancel button should ack + call the bridge agent to cancel
    the load via the BFF.

    Week 2 wired the cancel callback to the real bridge agent
    (broker_cancel_load event → BFF /loads/cancel + driver WhatsApp push).
    The bridge call is mocked here so the test exercises only the broker bot's
    callback routing + reply formatting."""
    update = TelegramUpdate(
        update_id=3,
        chat_id=12345,
        chat_type="private",
        from_user_id=999,
        callback_query_id="cq_2",
        callback_data="cancel:TYRE-0001",
    )
    from app.agents.base import AgentResult
    fake_result = AgentResult(
        success=True,
        data={"cancelled_in_db": True, "driver_notified": False},
        latency_ms=10,
    )
    with patch("app.agents.bridge.BridgeAgent.run",
               new_callable=AsyncMock, return_value=fake_result):
        reply = await bot.process_update(update)
    assert reply is not None
    assert "Cancelled" in reply.text or "cancelled" in reply.text.lower()
    assert "TYRE-0001" in reply.text
    answered_callback.assert_awaited_once_with("cq_2")


@pytest.mark.asyncio
async def test_callback_unknown_action(bot, answered_callback):
    """Unknown callback action should return an error message."""
    update = TelegramUpdate(
        update_id=4,
        chat_id=12345,
        chat_type="private",
        from_user_id=999,
        callback_query_id="cq_3",
        callback_data="frobnicate:TYRE-0001",
    )
    reply = await bot.process_update(update)
    assert reply is not None
    assert "Unknown callback action" in reply.text
    assert "frobnicate" in reply.text


# ─────────────────────────────────────────────────────────────────
# Unknown / free-text handling
# ─────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_unknown_text_returns_hint(bot):
    """Free text that isn't a command should suggest /help."""
    update = _msg("hello there")
    reply = await bot.process_update(update)
    assert reply is not None
    assert "/help" in reply.text


@pytest.mark.asyncio
async def test_non_text_message_returns_hint(bot):
    """Stickers / photos / voice should be gently rejected for Week 1."""
    update = TelegramUpdate(
        update_id=5,
        chat_id=12345,
        chat_type="private",
        from_user_id=999,
    )  # no text, no callback
    reply = await bot.process_update(update)
    assert reply is not None
    assert "/help" in reply.text


# ─────────────────────────────────────────────────────────────────
# Proactive message sends
# ─────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_send_proactive_message(bot, sent_ok):
    """Proactive send should return success + channel=telegram."""
    result = await bot.send_proactive_message(chat_id="12345", text="hello broker")
    assert result["success"] is True
    assert result["channel"] == "telegram"
    assert result["to"] == "12345"
    assert result["text"] == "hello broker"
    sent_ok.assert_awaited_once()


@pytest.mark.asyncio
async def test_send_load_request_includes_driver_and_route(bot, sent_ok):
    """Load request push should include driver name, phone, origin, destination."""
    result = await bot.send_load_request_to_broker(
        chat_id="12345",
        driver_name="Ramesh",
        driver_phone="+919876543210",
        origin="Patna",
        destination="Delhi",
        truck_type="HXL (32ft)",
        tyre_code="TYRE-0001",
    )
    assert result["success"] is True
    text = result["text"]
    assert "Ramesh" in text
    assert "+919876543210" in text
    assert "Patna" in text
    assert "Delhi" in text
    assert "TYRE-0001" in text
    assert "HXL (32ft)" in text


@pytest.mark.asyncio
async def test_send_payment_confirmation_advance(bot, sent_ok):
    """Advance confirmation should mention amount + ref."""
    result = await bot.send_payment_confirmation_to_broker(
        chat_id="12345",
        tyre_code="TYRE-0001",
        amount_inr=10000,
        payment_type="advance",
        upi_ref="upi_abc_123",
    )
    assert result["success"] is True
    text = result["text"]
    assert "10,000" in text
    assert "advance" in text.lower()
    assert "upi_abc_123" in text
    assert "TYRE-0001" in text


@pytest.mark.asyncio
async def test_send_payment_confirmation_balance(bot, sent_ok):
    """Balance confirmation should mention amount + settled to broker."""
    result = await bot.send_payment_confirmation_to_broker(
        chat_id="12345",
        tyre_code="TYRE-0001",
        amount_inr=35000,
        payment_type="balance",
        upi_ref="upi_xyz_789",
    )
    assert result["success"] is True
    text = result["text"]
    assert "35,000" in text
    assert "balance" in text.lower()
    assert "broker" in text.lower()


# ─────────────────────────────────────────────────────────────────
# TelegramUpdate.from_payload — flattening
# ─────────────────────────────────────────────────────────────────

def test_from_payload_message_text():
    """Flatten a /start message Update."""
    payload = {
        "update_id": 100,
        "message": {
            "message_id": 1,
            "text": "/start",
            "chat": {"id": 12345, "type": "private"},
            "from": {"id": 999, "username": "ramesh", "first_name": "Ramesh"},
        },
    }
    u = TelegramUpdate.from_payload(payload)
    assert u.update_id == 100
    assert u.chat_id == 12345
    assert u.chat_type == "private"
    assert u.text == "/start"
    assert u.from_first_name == "Ramesh"
    assert u.callback_query_id is None


def test_from_payload_callback_query():
    """Flatten a callback_query Update (inline button press)."""
    payload = {
        "update_id": 200,
        "callback_query": {
            "id": "cq_abc",
            "data": "broadcast:TYRE-0001",
            "message": {"message_id": 5, "chat": {"id": 12345, "type": "private"}},
            "from": {"id": 999, "first_name": "Ramesh"},
        },
    }
    u = TelegramUpdate.from_payload(payload)
    assert u.update_id == 200
    assert u.callback_query_id == "cq_abc"
    assert u.callback_data == "broadcast:TYRE-0001"
    assert u.chat_id == 12345
    assert u.text is None


def test_from_payload_empty():
    """Empty Update should still produce a TelegramUpdate object."""
    u = TelegramUpdate.from_payload({"update_id": 1})
    assert u.update_id == 1
    assert u.chat_id is None
    assert u.text is None


# ─────────────────────────────────────────────────────────────────
# HTML escaping
# ─────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_html_escape_prevents_injection_in_load_request(bot, sent_ok):
    """A driver name with HTML chars shouldn't break the Telegram message."""
    result = await bot.send_load_request_to_broker(
        chat_id="12345",
        driver_name="<script>alert(1)</script>",
        driver_phone="+919876543210",
        origin="Patna",
        destination="Delhi",
    )
    text = result["text"]
    # The raw <script> tag must NOT appear — it must be escaped to &lt;script&gt;
    assert "<script>" not in text
    assert "&lt;script&gt;" in text


# ─────────────────────────────────────────────────────────────────
# Deep-link payload extraction
# ─────────────────────────────────────────────────────────────────

def test_extract_start_payload_plain_start():
    """Plain /start → no payload."""
    from app.ai.telegram.broker_bot import _extract_start_payload
    assert _extract_start_payload("/start") is None


def test_extract_start_payload_with_broker_code():
    """/start BRK-PAT-001 → BRK-PAT-001."""
    from app.ai.telegram.broker_bot import _extract_start_payload
    assert _extract_start_payload("/start BRK-PAT-001") == "BRK-PAT-001"


def test_extract_start_payload_rejects_too_long():
    """Payload longer than 32 chars → None (injection guard)."""
    from app.ai.telegram.broker_bot import _extract_start_payload
    long_payload = "A" * 40
    assert _extract_start_payload(f"/start {long_payload}") is None


def test_extract_start_payload_rejects_special_chars():
    """Payload with HTML/space chars → None."""
    from app.ai.telegram.broker_bot import _extract_start_payload
    assert _extract_start_payload("/start <html>") is None
    assert _extract_start_payload("/start with space") is None  # space not allowed
