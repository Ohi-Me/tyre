"""Telegram Broker Bot — the broker / fleet-manager side of the bridge.

Mirrors `app/ai/whatsapp/driver_bot.py` shape: a single class that takes an
incoming Telegram Update, routes it to the right workflow based on intent
(command vs. callback_query vs. free-text), and produces a reply that the
gateway webhook handler actually sends via the bot client.

Why a *broker* bot (not a driver bot) on Telegram:
  - 80% of Indian truck drivers use WhatsApp daily and don't want a second
    app. Brokers / fleet managers are more tech-savvy, are okay with Telegram,
    and Telegram is free for business messaging (unlike WhatsApp Business API
    which charges ₹0.85–₹1.5 per conversation).
  - Telegram's inline keyboards (up to 100 buttons/message) fit broker
    workflows like "see 10 nearby drivers" / "broadcast load to top 5
    acceptors" far better than WhatsApp's 3-button limit.

Week 1 scope (this file): onboarding (`/start`, `/link`), basic commands
(`/help`, `/loads`, `/status`), and callback-query dispatch for accept/reject
buttons. The actual cross-channel routing (driver WhatsApp → broker Telegram
and back) lives in the bridge agent (`app/agents/bridge.py` — Week 2).
"""
from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field
from typing import Any

from app.ai.telegram import bot_client
from app.clients import bff_client

logger = logging.getLogger("tyre.telegram.broker_bot")


@dataclass
class TelegramUpdate:
    """Minimal shape of a Telegram `Update` object — only the fields this bot
    actually inspects. Telegram's full Update has ~30 fields; we intentionally
    accept the raw dict at the webhook boundary and project it down to this
    small typed shape so the broker bot is easy to test in isolation."""

    update_id: int
    chat_id: str | int | None = None
    chat_type: str | None = None         # private | group | supergroup | channel
    chat_title: str | None = None
    from_user_id: str | int | None = None
    from_username: str | None = None
    from_first_name: str | None = None
    # Message fields
    message_id: int | None = None
    text: str | None = None
    # Callback query fields (inline button press)
    callback_query_id: str | None = None
    callback_data: str | None = None
    # Raw payload, kept for audit logging and future fields
    raw: dict[str, Any] = field(default_factory=dict)

    @classmethod
    def from_payload(cls, payload: dict[str, Any]) -> TelegramUpdate:
        """Flatten Telegram's nested Update into the fields we care about.

        Telegram's Update shape (abridged):
            {
              "update_id": 123,
              "message": {"message_id": 1, "text": "/start", "chat": {...}, "from": {...}},
              "callback_query": {"id": "aq1", "data": "accept:TYRE-0001",
                                  "message": {"chat": {...}}, "from": {...}}
            }
        Either `message` or `callback_query` will be present; rarely both.
        """
        update_id = int(payload.get("update_id") or 0)
        msg = payload.get("message") or {}
        cb = payload.get("callback_query") or {}
        chat = (msg.get("chat") or cb.get("message", {}).get("chat") or {})
        from_user = msg.get("from") or cb.get("from") or {}
        return cls(
            update_id=update_id,
            chat_id=chat.get("id"),
            chat_type=chat.get("type"),
            chat_title=chat.get("title"),
            from_user_id=from_user.get("id"),
            from_username=from_user.get("username"),
            from_first_name=from_user.get("first_name"),
            message_id=msg.get("message_id"),
            text=msg.get("text"),
            callback_query_id=cb.get("id"),
            callback_data=cb.get("data"),
            raw=payload,
        )


@dataclass
class TelegramReply:
    """Reply from the broker bot. The webhook handler turns this into a real
    `sendMessage` call via the bot client. Mirrors `WhatsAppReply` shape so a
    future cross-channel bridge agent can produce one reply object and let the
    transport layer pick the channel."""

    chat_id: str | int
    text: str
    inline_keyboard: list[list[dict[str, str]]] | None = None
    parse_mode: str | None = "HTML"


class TelegramBrokerBot:
    """Routes inbound Telegram Updates to broker workflows.

    Stateless on its own — broker↔chat_id linkage lives in Postgres via the
    BFF (`POST /api/v1/brokers/link-telegram`, `GET /api/v1/brokers/by-telegram`).
    """

    # ── Main entry point ───────────────────────────────────────────────
    async def process_update(self, update: TelegramUpdate) -> TelegramReply | None:
        """Process one Telegram Update. Returns the reply to send back, or
        `None` if the update was a no-op (e.g. a callback query that was
        already answered)."""
        # 1. Inline button press → callback router
        if update.callback_query_id and update.callback_data:
            return await self._route_callback(update)
        # 2. Text message → command router
        if update.text and update.chat_id is not None:
            return await self._route_command(update)
        # 3. Anything else (stickers, voice, photos) — broker bot is text-only
        # for Week 1; we still ack so the broker sees we received it.
        if update.chat_id is not None:
            return TelegramReply(
                chat_id=update.chat_id,
                text=(
                    "👋 TYRE broker bot currently understands text commands only.\n\n"
                    "Type /help to see what I can do."
                ),
            )
        return None

    # ── Command routing ────────────────────────────────────────────────
    async def _route_command(self, update: TelegramUpdate) -> TelegramReply:
        text = (update.text or "").strip()
        # Telegram commands are case-insensitive; handle "/START", "/Start", "/start"
        # all the same. Optional bot-suffix (/start@tyrebrokerbot) is stripped.
        first_token = text.split(maxsplit=1)[0] if text else ""
        command = first_token.lower().split("@", 1)[0]

        if command == "/start":
            return await self._handle_start(update)
        if command == "/link":
            return await self._handle_link(update, args=text.split(maxsplit=1)[1] if " " in text else "")
        if command == "/loads":
            return await self._handle_list_loads(update)
        if command == "/status":
            return await self._handle_status(update)
        if command == "/help":
            return self._build_help_reply(update)
        if command == "/unlink":
            return await self._handle_unlink(update)
        # Free text — echo back a hint
        return TelegramReply(
            chat_id=update.chat_id,  # type: ignore[arg-type]
            text=(
                f"🤖 I didn't recognize <code>{_escape(text[:80])}</code>.\n\n"
                "Type /help to see available commands."
            ),
        )

    # ── /start — greet + invite broker to link ─────────────────────────
    async def _handle_start(self, update: TelegramUpdate) -> TelegramReply:
        """`/start` is what Telegram sends when a broker first opens the bot
        (or clicks a t.me/<bot>?start=<payload> link). We greet them by name
        and tell them how to link their broker account. If they came in via
        a deep link with a broker code (`?start=BRK-PAT-001`), we attempt the
        link immediately and skip the manual step."""
        name = update.from_first_name or "broker"
        deep_link_payload = _extract_start_payload(update.text or "")

        if deep_link_payload:
            # Deep-link path: t.me/<bot>?start=BRK-PAT-001 → attempt link
            link_result = await self._link_broker(
                chat_id=update.chat_id,  # type: ignore[arg-type]
                broker_code=deep_link_payload,
                broker_phone=None,
            )
            if link_result["success"]:
                return TelegramReply(
                    chat_id=update.chat_id,  # type: ignore[arg-type]
                    text=(
                        f"🙏 Namaste <b>{_escape(name)}</b>!\n\n"
                        f"✅ Linked to broker <code>{_escape(deep_link_payload)}</code>.\n\n"
                        "You'll now get real-time alerts here:\n"
                        "• 📦 Driver load requests\n"
                        "• 📍 GPS arrival confirmations\n"
                        "• 💰 Balance release confirmations\n\n"
                        "Type /help to see all commands."
                    ),
                )
            return TelegramReply(
                chat_id=update.chat_id,  # type: ignore[arg-type]
                text=(
                    f"🙏 Namaste <b>{_escape(name)}</b>!\n\n"
                    f"⚠️ Couldn't link to broker <code>{_escape(deep_link_payload)}</code>: "
                    f"{_escape(link_result.get('error', 'unknown error'))}\n\n"
                    "Try /link &lt;BRK-CODE&gt; &lt;your-registered-phone&gt; to link manually."
                ),
            )

        return TelegramReply(
            chat_id=update.chat_id,  # type: ignore[arg-type]
            text=(
                f"🙏 Namaste <b>{_escape(name)}</b>! Welcome to <b>TYRE</b>.\n\n"
                "I'm your broker assistant. To start receiving load alerts and "
                "driver updates here on Telegram, link your broker account:\n\n"
                "<b>/link BRK-CODE +91XXXXXXXXXX</b>\n"
                "<i>Example:</i> <code>/link BRK-PAT-001 +919876543210</code>\n\n"
                "Once linked, you'll receive:\n"
                "• 📦 New load requests from drivers (broadcast within 50km)\n"
                "• 📍 GPS arrival confirmations at delivery\n"
                "• 💰 Balance release confirmations\n"
                "• 🚨 Driver emergency alerts\n\n"
                "Type /help any time to see all commands."
            ),
        )

    # ── /link BRK-CODE +91XXXXXXXXXX ───────────────────────────────────
    async def _handle_link(self, update: TelegramUpdate, args: str) -> TelegramReply:
        """Link this Telegram chat_id to a broker account.

        Requires the broker's registered phone number as a weak second factor —
        we don't ship OTP in Week 1 (the BFF route verifies phone format only);
        Week 2 will add an OTP challenge via the WhatsApp driver bot (the same
        driver phone that's already on file gets a 6-digit code to type back
        here)."""
        parts = args.split()
        if len(parts) < 2:
            return TelegramReply(
                chat_id=update.chat_id,  # type: ignore[arg-type]
                text=(
                    "📋 <b>/link</b> — link your broker account\n\n"
                    "Usage: <code>/link BRK-CODE +91XXXXXXXXXX</code>\n"
                    "Example: <code>/link BRK-PAT-001 +919876543210</code>\n\n"
                    "Use the phone number registered with TYRE. Need your broker code? "
                    "Contact your TYRE operator."
                ),
            )
        broker_code, broker_phone = parts[0], parts[1]
        link_result = await self._link_broker(
            chat_id=update.chat_id,  # type: ignore[arg-type]
            broker_code=broker_code,
            broker_phone=broker_phone,
        )
        if link_result["success"]:
            return TelegramReply(
                chat_id=update.chat_id,  # type: ignore[arg-type]
                text=(
                    f"✅ <b>Linked!</b>\n\n"
                    f"Broker <code>{_escape(broker_code)}</code> → this chat.\n\n"
                    "You'll now receive load requests, GPS arrivals, and payment "
                    "confirmations here. Type /loads to see your open loads."
                ),
            )
        return TelegramReply(
            chat_id=update.chat_id,  # type: ignore[arg-type]
            text=(
                f"⚠️ <b>Link failed</b>\n\n"
                f"{_escape(link_result.get('error', 'unknown error'))}\n\n"
                "Check that the BRK-CODE and phone number match what's on file. "
                "Type /link alone for usage."
            ),
        )

    # ── /unlink — unlink this chat_id ──────────────────────────────────
    async def _handle_unlink(self, update: TelegramUpdate) -> TelegramReply:
        """Remove the Telegram chat_id from the broker record. The broker
        stays in the DB; only the Telegram channel is detached. Used when a
        broker switches phones or wants to stop notifications."""
        result = await self._unlink_broker(update.chat_id)  # type: ignore[arg-type]
        if result["success"]:
            return TelegramReply(
                chat_id=update.chat_id,  # type: ignore[arg-type]
                text="👋 Unlinked. You won't receive TYRE alerts here anymore. Type /link to re-link any time.",
            )
        return TelegramReply(
            chat_id=update.chat_id,  # type: ignore[arg-type]
            text=f"⚠️ Couldn't unlink: {_escape(result.get('error', 'unknown error'))}",
        )

    # ── /loads — list this broker's open loads ─────────────────────────
    async def _handle_list_loads(self, update: TelegramUpdate) -> TelegramReply:
        """List the broker's open loads with inline Accept buttons for the
        top 5. Calls the BFF's broker loads route. If the broker isn't linked
        to this chat_id yet, returns the link prompt."""
        broker = await self._lookup_broker(update.chat_id)  # type: ignore[arg-type]
        if not broker or not broker.get("success") or not broker.get("data"):
            return TelegramReply(
                chat_id=update.chat_id,  # type: ignore[arg-type]
                text=(
                    "🔗 You haven't linked a broker account yet.\n\n"
                    "Type <code>/link BRK-CODE +91XXXXXXXXXX</code> first."
                ),
            )

        broker_code = (broker.get("data") or {}).get("broker_code", "")
        loads_resp = await bff_client.list_broker_loads(broker_code)
        if not loads_resp or not loads_resp.get("success"):
            return TelegramReply(
                chat_id=update.chat_id,  # type: ignore[arg-type]
                text=(
                    "⚠️ Couldn't fetch your loads right now (BFF unavailable).\n"
                    "Try again in a minute."
                ),
            )

        loads = (loads_resp.get("data") or {}).get("loads") or []
        # Week 2: show all non-delivered, non-cancelled loads — broker needs to
        # act on assigned / in-transit loads too (release balance, broadcast, cancel).
        active_loads = [
            l for l in loads
            if l.get("status") in ("OPEN", "NEGOTIATING", "ASSIGNED", "IN_TRANSIT")
        ]
        if not active_loads:
            return TelegramReply(
                chat_id=update.chat_id,  # type: ignore[arg-type]
                text=(
                    f"📦 No active loads for <code>{_escape(broker_code)}</code>.\n\n"
                    "Post a new load from the TYRE dashboard and it'll appear here."
                ),
            )

        lines = [f"📦 <b>{len(active_loads)} active load(s)</b> for <code>{_escape(broker_code)}</code>:\n"]
        keyboard: list[list[dict[str, str]]] = []
        for i, l in enumerate(active_loads[:8], start=1):
            tyre_code = l.get("tyre_code", "—")
            origin = l.get("origin", "—")
            destination = l.get("destination", "—")
            rate = int(l.get("offered_rate") or 0)
            advance = int(l.get("advance_offered") or 0)
            status = l.get("status", "OPEN")
            assigned_truck = l.get("assigned_truck_number") or ""
            lines.append(
                f"{i}. <code>{_escape(tyre_code)}</code>  {_escape(origin)} → {_escape(destination)}\n"
                f"   ₹{rate:,} (adv ₹{advance:,}) · {status}"
                + (f" · 🚛 {_escape(assigned_truck)}" if assigned_truck else "")
            )
            # Buttons depend on load status — broker gets the right actions for
            # each phase of the load lifecycle.
            row: list[dict[str, str]] = []
            if status in ("OPEN", "NEGOTIATING"):
                row.append({"text": f"📢 Broadcast #{i}", "callback_data": f"broadcast:{tyre_code}"})
                row.append({"text": "❌ Cancel", "callback_data": f"cancel:{tyre_code}"})
            elif status in ("ASSIGNED", "IN_TRANSIT"):
                row.append({"text": "📍 Track", "callback_data": f"track:{tyre_code}"})
                row.append({"text": "❌ Cancel", "callback_data": f"cancel:{tyre_code}"})
            keyboard.append(row)
        lines.append("\nTap a button below to act on a load.")
        return TelegramReply(
            chat_id=update.chat_id,  # type: ignore[arg-type]
            text="\n".join(lines),
            inline_keyboard=keyboard,
        )

    # ── /status — quick broker status ──────────────────────────────────
    async def _handle_status(self, update: TelegramUpdate) -> TelegramReply:
        """Quick health check: shows whether this chat is linked, and if so,
        the broker code + a 1-line summary (open loads count, linked since)."""
        broker = await self._lookup_broker(update.chat_id)  # type: ignore[arg-type]
        if not broker or not broker.get("success") or not broker.get("data"):
            return TelegramReply(
                chat_id=update.chat_id,  # type: ignore[arg-type]
                text=(
                    "📊 <b>Status: not linked</b>\n\n"
                    "Type <code>/link BRK-CODE +91XXXXXXXXXX</code> to link your broker account."
                ),
            )
        data = broker.get("data") or {}
        return TelegramReply(
            chat_id=update.chat_id,  # type: ignore[arg-type]
            text=(
                f"📊 <b>Status: linked</b>\n\n"
                f"Broker: <code>{_escape(data.get('broker_code', '—'))}</code>\n"
                f"Name: {_escape(data.get('name', '—'))}\n"
                f"Phone: {_escape(data.get('phone', '—'))}\n"
                f"Region: {_escape(data.get('region', 'IN'))}\n"
                f"Linked chat: <code>{update.chat_id}</code>\n\n"
                "Type /loads to see your open loads."
            ),
        )

    # ── Callback query router (inline button presses) ──────────────────
    async def _route_callback(self, update: TelegramUpdate) -> TelegramReply | None:
        """Route a callback_query (inline button press) to the right action.

        Week 2 wires the broker's inline buttons to the real bridge agent:
          - `broadcast:TYRE-0001`  → bridge._on_broker_broadcast (Week 3 fan-out stub)
          - `cancel:TYRE-0001`     → bridge._on_broker_cancel_load → BFF /loads/cancel
                                     + driver WhatsApp notification
          - `release:TYRE-0001`    → bridge._on_broker_release_balance → BFF
                                     /trips/release-balance + driver WhatsApp
          - `track:TYRE-0001`      → fetch the load's last GPS ping + ETA
                                     (Week 3 — for now acks with a dashboard link)
        Anything else is logged and acknowledged with an error toast."""
        # Always answer the callback first so the broker's button stops spinning
        if update.callback_query_id:
            await bot_client.answer_callback_query(update.callback_query_id)

        if not update.callback_data or update.chat_id is None:
            return None

        parts = update.callback_data.split(":", 1)
        if len(parts) != 2:
            return TelegramReply(
                chat_id=update.chat_id,
                text=f"⚠️ Bad callback payload: <code>{_escape(update.callback_data)}</code>",
            )
        action, tyre_code = parts[0], parts[1]

        # Bridge agent handles the cross-channel routing for cancel/release/broadcast.
        # For Week 2 the broker's chat_id is passed so the bridge can ack the broker
        # back on Telegram after the BFF call completes.
        if action in ("cancel", "release", "broadcast"):
            return await self._dispatch_to_bridge(action, tyre_code, update)

        if action == "track":
            return TelegramReply(
                chat_id=update.chat_id,
                text=(
                    f"📍 <b>Track <code>{_escape(tyre_code)}</code></b>\n\n"
                    "Open the TYRE dashboard for live GPS + ETA.\n"
                    "<i>Inline track ships in Week 3.</i>"
                ),
            )
        return TelegramReply(
            chat_id=update.chat_id,
            text=f"⚠️ Unknown callback action: <code>{_escape(action)}</code>",
        )

    async def _dispatch_to_bridge(
        self, action: str, tyre_code: str, update: TelegramUpdate
    ) -> TelegramReply:
        """Call the bridge agent for a broker-initiated action and translate the
        result into a Telegram reply. The bridge agent does the BFF call + driver
        WhatsApp notification; we just format the outcome for the broker."""
        chat_id = update.chat_id  # captured for the reply
        try:
            from app.agents.bridge import BridgeAgent
            agent = BridgeAgent()
            event_map = {
                "cancel": "broker_cancel_load",
                "release": "broker_release_balance",
                "broadcast": "broker_broadcast",
            }
            result = await agent.run({
                "event": event_map[action],
                "tyre_code": tyre_code,
                "broker_chat_id": str(chat_id),
            })
        except Exception as e:  # noqa: BLE001 — bridge errors must surface as a friendly reply
            return TelegramReply(
                chat_id=chat_id,  # type: ignore[arg-type]
                text=(
                    f"⚠️ <b>{_escape(action.title())} failed</b> for <code>{_escape(tyre_code)}</code>.\n"
                    f"Error: {_escape(str(e))}"
                ),
            )

        return self._format_bridge_callback_reply(action, tyre_code, result, chat_id)

    def _format_bridge_callback_reply(
        self, action: str, tyre_code: str, result: Any, chat_id: str | int
    ) -> TelegramReply:
        """Translate a bridge agent AgentResult into a Telegram reply for the broker."""
        if not result.success:
            return TelegramReply(
                chat_id=chat_id,
                text=(
                    f"⚠️ <b>{_escape(action.title())} failed</b> for <code>{_escape(tyre_code)}</code>.\n"
                    f"Error: {_escape(result.error or 'unknown')}"
                ),
            )

        data = result.data or {}
        if action == "cancel":
            cancelled = data.get("cancelled_in_db", False)
            driver_notified = data.get("driver_notified", False)
            return TelegramReply(
                chat_id=chat_id,
                text=(
                    f"❌ <b>Cancelled</b> <code>{_escape(tyre_code)}</code>.\n\n"
                    f"DB updated: {'✅' if cancelled else '⚠️ (BFF unreachable)'}\n"
                    f"Driver notified on WhatsApp: {'✅' if driver_notified else '⚠️ (no phone on file)'}"
                ),
            )
        if action == "release":
            released = data.get("released", False)
            amount = data.get("amount_inr", 0)
            upi_ref = data.get("upi_ref", "")
            driver_notified = data.get("driver_notified", False)
            if released:
                return TelegramReply(
                    chat_id=chat_id,
                    text=(
                        f"✅ <b>Balance released</b> for <code>{_escape(tyre_code)}</code>.\n\n"
                        f"Amount: ₹{int(amount):,}\n"
                        f"UPI ref: <code>{_escape(upi_ref)}</code>\n"
                        f"Driver notified on WhatsApp: {'✅' if driver_notified else '⚠️'}"
                    ),
                )
            return TelegramReply(
                chat_id=chat_id,
                text=(
                    f"⚠️ <b>Balance release failed</b> for <code>{_escape(tyre_code)}</code>.\n\n"
                    f"Check the trip dashboard or try again later."
                ),
            )
        if action == "broadcast":
            return TelegramReply(
                chat_id=chat_id,
                text=(
                    f"📢 <b>Broadcast queued</b> for <code>{_escape(tyre_code)}</code>.\n\n"
                    "<i>Nearby-driver fan-out ships in Week 3 — for now this ack confirms the button works.</i>"
                ),
            )
        return TelegramReply(
            chat_id=chat_id,
            text=f"✅ <b>{_escape(action.title())}</b> processed for <code>{_escape(tyre_code)}</code>.",
        )

    # ── Proactive pushes (called by bridge agent / payment agent) ──────
    async def send_proactive_message(self, chat_id: str | int, text: str) -> dict:
        """Send a proactive Telegram message to a linked broker.

        Used by: bridge agent (driver WhatsApp → broker Telegram), payment
        agent (balance release → broker confirmation), consignee_confirm
        service (delivery confirmation → broker notification).

        Mirrors `WhatsAppDriverBot.send_proactive_message` shape so the
        bridge agent can treat both channels uniformly."""
        result = await bot_client.send_message(chat_id, text)
        return {
            "success": result.get("success", False),
            "channel": "telegram",
            "message_id": result.get("message_id"),
            "to": chat_id,
            "text": text,
            "sent_at": str(int(time.time())),
            "error": result.get("error"),
        }

    async def send_load_request_to_broker(
        self,
        chat_id: str | int,
        driver_name: str,
        driver_phone: str,
        origin: str,
        destination: str,
        truck_type: str = "",
        tyre_code: str = "",
    ) -> dict:
        """Push a driver's WhatsApp load request to the linked broker on
        Telegram. This is one half of the Week 2 bridge (driver WhatsApp →
        broker Telegram). Shipped in Week 1 so the broker bot has a real
        proactive send path even before the bridge agent wires it up."""
        text = (
            "📦 <b>New load request</b>\n\n"
            f"👤 Driver: <b>{_escape(driver_name)}</b>\n"
            f"📞 {_escape(driver_phone)}\n"
            f"🗺️ {_escape(origin)} → {_escape(destination)}\n"
            + (f"🚛 {_escape(truck_type)}\n" if truck_type else "")
            + (f"\n🔖 Ref: <code>{_escape(tyre_code)}</code>" if tyre_code else "")
            + "\n\n<i>Reply in this chat or call the driver directly.</i>"
        )
        return await self.send_proactive_message(chat_id, text)

    async def send_payment_confirmation_to_broker(
        self,
        chat_id: str | int,
        tyre_code: str,
        amount_inr: float,
        payment_type: str = "balance",
        upi_ref: str = "",
    ) -> dict:
        """Push a UPI payment confirmation to the linked broker. Mirrors the
        WhatsApp driver's `send_payment_confirmation`."""
        emoji = "💰" if payment_type == "advance" else "✅"
        text = (
            f"TYRE: {emoji} <b>₹{int(amount_inr):,} {payment_type} released</b>\n\n"
            f"Load: <code>{_escape(tyre_code)}</code>\n"
            + (f"UPI ref: <code>{_escape(upi_ref)}</code>\n" if upi_ref else "")
            + f"Time: {time.strftime('%H:%M:%S')}\n"
            f"{'Advance sent to driver.' if payment_type == 'advance' else 'Balance settled to broker after consignee confirmation.'}"
        )
        return await self.send_proactive_message(chat_id, text)

    # ── BFF plumbing ───────────────────────────────────────────────────
    async def _link_broker(
        self, chat_id: str | int, broker_code: str, broker_phone: str | None
    ) -> dict[str, Any]:
        """Call the BFF to persist `telegram_chat_id` on the Broker row.
        Returns `{"success": bool, "error": str | None, "data": {...} | None}`.
        Degrades to a logged no-op when the BFF isn't configured (local dev /
        tests) so the bot still boots and the onboarding flow can be tested
        end-to-end with a mock."""
        if not bff_client._configured():
            logger.warning("[broker_bot] link skipped — BFF not configured")
            return {"success": False, "error": "bff_not_configured", "data": None}
        result = await bff_client.link_telegram_chat_id(
            broker_code=broker_code,
            broker_phone=broker_phone or "",
            telegram_chat_id=str(chat_id),
            telegram_username=None,
        )
        if not result:
            return {"success": False, "error": "bff_call_failed", "data": None}
        if result.get("success"):
            return {"success": True, "error": None, "data": result.get("data")}
        return {"success": False, "error": result.get("error") or "bff_rejected", "data": None}

    async def _unlink_broker(self, chat_id: str | int) -> dict[str, Any]:
        if not bff_client._configured():
            return {"success": False, "error": "bff_not_configured"}
        result = await bff_client.unlink_telegram_chat_id(str(chat_id))
        if not result:
            return {"success": False, "error": "bff_call_failed"}
        return {"success": bool(result.get("success")), "error": result.get("error")}

    async def _lookup_broker(self, chat_id: str | int) -> dict[str, Any] | None:
        if not bff_client._configured():
            return None
        return await bff_client.get_broker_by_telegram_chat_id(str(chat_id))

    # ── Help text ──────────────────────────────────────────────────────
    def _build_help_reply(self, update: TelegramUpdate) -> TelegramReply:
        return TelegramReply(
            chat_id=update.chat_id,  # type: ignore[arg-type]
            text=(
                "🤖 <b>TYRE Broker Bot — commands</b>\n\n"
                "<b>/start</b> — greet + link instructions\n"
                "<b>/link BRK-CODE +91XXXXXXXXXX</b> — link your broker account\n"
                "<b>/unlink</b> — stop alerts to this chat\n"
                "<b>/loads</b> — list your open loads (with action buttons)\n"
                "<b>/status</b> — show your link status\n"
                "<b>/help</b> — this message\n\n"
                "<i>Tip: brokers get real-time alerts here whenever a driver accepts "
                "or completes a load on WhatsApp — no app install needed on the driver side.</i>"
            ),
        )


# ── Helpers ────────────────────────────────────────────────────────────
def _escape(text: str) -> str:
    """Escape HTML special chars for Telegram's HTML parse_mode.
    Telegram only recognizes &lt; &gt; &amp; — quotes are fine in text."""
    if text is None:
        return ""
    return (
        str(text)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )


def _extract_start_payload(text: str) -> str | None:
    """Extract the deep-link payload from a `/start <payload>` command.
    Telegram's `t.me/<bot>?start=BRK-PAT-001` link opens the chat with
    `/start BRK-PAT-001` pre-filled. Returns None for plain /start."""
    parts = text.split(maxsplit=1)
    if len(parts) < 2:
        return None
    payload = parts[1].strip()
    # Reject anything that isn't a plausible broker code (BRK-...). Avoids
    # HTML/URL injection through the deep-link parameter.
    if not payload or len(payload) > 32:
        return None
    if not all(c.isalnum() or c in "-_/" for c in payload):
        return None
    return payload
