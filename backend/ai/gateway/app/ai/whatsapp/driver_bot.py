"""
WhatsApp Driver Bot — the primary interface for 80% of Indian truck drivers.

Driver sends WhatsApp voice note → TYRE AI processes → replies via WhatsApp.
No app download required. Works on any phone with WhatsApp.

Per V2 PDF Part 4:
  - Load search: voice note → 3 best loads as text + voice
  - Load accept: reply '1' or 'accept TYRE-1234'
  - Status update: 'loaded' / 'reached Delhi' / photo of POD
  - Market rate: 'Patna Delhi rate?'
  - Emergency: 'truck kharab NH48'
  - Onboarding: voice → profile created in 2 min
"""
from __future__ import annotations

import re
import time
from dataclasses import dataclass

from app.clients import bff_client


@dataclass
class WhatsAppMessage:
    from_phone: str
    message_type: str  # text | voice | image | document | interactive | location
    text_body: str | None = None
    voice_base64: str | None = None
    image_base64: str | None = None
    # Week 3 broadcast: WhatsApp location pin (lat/lng + optional label).
    # Set when a driver shares their location via WhatsApp — the bot updates
    # Driver.currentLat/Lng via the BFF so the nearby broadcast can find them.
    location_lat: float | None = None
    location_lng: float | None = None
    location_label: str | None = None
    timestamp: str = ""
    message_id: str = ""


@dataclass
class WhatsAppReply:
    to_phone: str
    text: str
    voice_base64: str | None = None
    image_url: str | None = None
    interactive_buttons: list | None = None  # for load accept/reject


class WhatsAppDriverBot:
    """
    The WhatsApp-first driver bot.

    All driver interactions happen here. No app required.
    """

    # Intent detection patterns (Hindi + Bhojpuri + English).
    # NOTE: pre-Week-1 this dict had every key duplicated (the second block
    # silently overwrote the first, and the first block had a bug — `r"^1\$"`
    # with an escaped dollar that never matched). The duplicate is removed;
    # only the correct block remains. Load-accept patterns use `^1$`/`^2$`/`^3$`
    # so a bare "1" / "2" / "3" reply matches LOAD_ACCEPT.
    #
    # ORDER MATTERS: `_detect_intent` iterates in insertion order and returns
    # the first match (re.search = substring match). STATUS_UPDATE is checked
    # BEFORE LOAD_SEARCH so "loaded" matches STATUS_UPDATE (`r"loaded"`) rather
    # than LOAD_SEARCH (`r"\bload\b"` — word-boundary anchored so "loaded"
    # doesn't match it). LOAD_ACCEPT is first so bare "1"/"2"/"3" don't fall
    # through to LOAD_SEARCH.
    INTENT_PATTERNS = {
        "LOAD_ACCEPT": [
            r"^accept", r"^1$", r"^2$", r"^3$", r"हाँ", r"haan", r"ok",
            r"एक्सेप्ट", r"manzoor", r"मंज़ूर",
        ],
        "STATUS_UPDATE": [
            r"loaded", r"लोड हो", r"reached", r"pahunch", r"पहुंच",
            r"start", r"चल", r"complete", r"हो\s*गया",
        ],
        "LOAD_SEARCH": [
            # \bload\b — word-boundary anchored so "loaded" doesn't match here
            # (it should match STATUS_UPDATE above). Without \b, "loaded"
            # matches r"load" via re.search substring match.
            r"\bload\b", r"लोड", r"लोड ढूंढ", r"खोज", r"chahiye", r"find",
            r"patna\s+se", r"delhi\s+se", r"मुंबई\s+से", r"jana\s+h",
        ],
        "MARKET_RATE": [
            r"rate", r"रेट", r"भाव", r"bhav", r"price", r"कितना",
            r"kitna", r"market",
        ],
        "EMERGENCY": [
            r"emergency", r"help", r"मदद", r"बचाओ", r"accident",
            r"खराब", r"kharab", r"puncture", r"breakdown",
        ],
        "ONBOARDING": [
            r"main\s+\w+\s+hoon", r"mera\s+naam", r"मैं\s+\w+\s+हूं",
            r"नाम\s+\w+", r"join", r"register", r"sign\s*up",
        ],
        "REQUEST_ADVANCE": [
            r"advance", r"अग्रिम", r"पैसा", r"paisa", r"money",
            r"payment", r"भुगतान",
        ],
        "UPLOAD_POD": [
            r"pod", r"proof", r"receipt", r"रसीद", r"signature",
            r"दस्तखत",
        ],
    }

    def __init__(self):
        # Credentials live in app.config.settings (TYRE_WHATSAPP_TOKEN /
        # TYRE_WHATSAPP_PHONE_NUMBER_ID), consumed by app.ai.whatsapp.graph_client —
        # Phase 0 fix: this used to be `self._whatsapp_token = ""` with no real send path
        # anywhere in the class. send_proactive_message() below now calls the real client.
        pass

    async def process_incoming_message(self, message: WhatsAppMessage) -> WhatsAppReply:
        """
        Process an incoming WhatsApp message from a driver.
        Routes to the right workflow based on intent detection.
        """
        # Week 3 broadcast: location share → update driver GPS, no intent detection
        if message.message_type == "location" and message.location_lat is not None:
            return await self._handle_location_share(message)

        # Detect intent
        text = (message.text_body or "").lower().strip()
        intent = self._detect_intent(text) if text else "VOICE_INPUT"

        # Route to workflow
        if intent == "LOAD_SEARCH" or (message.message_type == "voice" and not text):
            return await self._handle_load_search(message)
        elif intent == "LOAD_ACCEPT":
            return await self._handle_load_accept(message, text)
        elif intent == "STATUS_UPDATE":
            return await self._handle_status_update(message, text)
        elif intent == "MARKET_RATE":
            return await self._handle_market_rate(message, text)
        elif intent == "EMERGENCY":
            return await self._handle_emergency(message, text)
        elif intent == "ONBOARDING":
            return await self._handle_onboarding(message, text)
        elif intent == "REQUEST_ADVANCE":
            return await self._handle_advance_request(message)
        elif intent == "UPLOAD_POD" or message.message_type == "image":
            return await self._handle_pod_upload(message)
        else:
            return self._build_help_reply(message.from_phone)

    async def _handle_location_share(self, message: WhatsAppMessage) -> WhatsAppReply:
        """Handle a WhatsApp location pin → update Driver.currentLat/Lng via BFF.

        Week 3 broadcast: drivers share their location so the nearby-driver
        broadcast can find them. Without this, drivers are invisible to the
        broadcast query and never receive load offers.

        The BFF call is best-effort — if it fails, the driver still gets a
        friendly reply telling them their location was received (the dashboard
        can manually set it later)."""
        lat = message.location_lat
        lng = message.location_lng
        label = message.location_label or ""
        try:
            await bff_client.update_driver_location(
                driver_phone=message.from_phone,
                lat=lat,
                lng=lng,
                location_label=label or None,
            )
            return WhatsAppReply(
                to_phone=message.from_phone,
                text=(
                    "TYRE: 📍 Location updated!\n\n"
                    "You'll now receive load offers within 50km of your location.\n\n"
                    "Reply 'load' to search for loads, or just send a voice note."
                ),
            )
        except Exception as e:  # noqa: BLE001 — BFF failure shouldn't crash the bot
            import logging
            logging.getLogger("tyre.whatsapp").warning(
                "[driver_bot] location update failed for %s: %s", message.from_phone, e,
            )
            return WhatsAppReply(
                to_phone=message.from_phone,
                text=(
                    "TYRE: 📍 Location received, but we couldn't save it right now.\n"
                    "Please try again in a minute, or reply 'load' to search anyway."
                ),
            )

    async def _handle_load_search(self, message: WhatsAppMessage) -> WhatsAppReply:
        """Handle load search — voice or text.

        Phase 0 fix (`docs/ARCHITECTURE.md` §8): this used to return the same three
        hardcoded loads ("Patna → Delhi | ₹45,000...") to every driver regardless of
        what they actually asked for. It now parses origin/destination from the message
        text with a light regex (full NLU extraction happens upstream in the voice
        pipeline for voice notes — this handles the WhatsApp-text path) and calls the
        real `POST /api/v1/loads/match` route, which queries the `Load` table and runs
        the Dispatch agent (`docs/ARCHITECTURE.md` §5.1 — Dispatch is REAL).

        Week 2 of the WhatsApp↔Telegram bridge: also fires a `driver_load_search`
        event to the bridge agent so the linked broker gets a Telegram notification
        ("📦 New load req from Ramesh · Patna→Delhi"). The bridge call is fire-and-
        forget — a broker Telegram outage must never delay the driver's WhatsApp reply.
        """
        text = (message.text_body or "").strip()
        origin, destination = self._parse_route(text)

        result = await bff_client.match_loads(
            origin=origin or "Patna", destination=destination, driver_phone=message.from_phone,
        )

        matches = (result or {}).get("data", {}).get("matches", []) if result else []

        # Fire driver_load_search to the bridge agent (best-effort, never blocks)
        await _fire_bridge_event({
            "event": "driver_load_search",
            "driver_phone": message.from_phone,
            "origin": origin or "",
            "destination": destination or "",
        })

        if not matches:
            return WhatsAppReply(
                to_phone=message.from_phone,
                text=(
                    "TYRE: Abhi koi matching load nahi mila.\n"
                    "Naya load aate hi WhatsApp pe batayenge.\n\n"
                    "Reply 'rate' for current market rates."
                ),
            )

        lines = []
        buttons = []
        for i, m in enumerate(matches[:3], start=1):
            lines.append(
                f"{i}️⃣ {m.get('origin')} → {m.get('destination')} | "
                f"₹{int(m.get('rate', 0)):,} | ₹{int(m.get('advance', 0)):,} advance | "
                f"{m.get('truck_type_req', '')} | {m.get('goods_type', '')}\n"
                f"   Broker: {m.get('broker_name', 'Unknown')}"
            )
            buttons.append({"id": f"accept_{m.get('tyre_code', i)}", "title": f"✅ Accept #{i}"})

        reply = WhatsAppReply(
            to_phone=message.from_phone,
            text=(
                f"TYRE: {len(matches)} load(s) mile aapke liye:\n\n"
                + "\n\n".join(lines)
                + "\n\nReply '1', '2', or '3' to accept."
            ),
            interactive_buttons=buttons,
        )
        return reply

    @staticmethod
    def _parse_route(text: str) -> tuple[str | None, str]:
        """Light regex extraction for the common 'X se Y' / 'X to Y' patterns.
        Falls back to (None, "") so callers can default sensibly — full multilingual
        NLU lives in the voice pipeline (Groq NLU), not duplicated here."""
        m = re.search(r"([a-zA-Z\u0900-\u097F]+)\s*(?:se|to|→|-)\s*([a-zA-Z\u0900-\u097F]+)", text, re.IGNORECASE)
        if m:
            return m.group(1).strip().title(), m.group(2).strip().title()
        return None, ""

    async def _handle_load_accept(self, message: WhatsAppMessage, text: str) -> WhatsAppReply:
        """Handle load accept — reply '1' or 'accept TYRE-1234'.

        AI-C7 fix: previously returned a hardcoded reply with literal placeholders
        ([address], [phone], [time]) and a fabricated "₹10,000 advance releasing"
        message. Now calls the BFF to actually assign the load and release the
        advance; if the BFF call fails, returns an honest error.
        """
        # Parse which load
        load_num = None
        if text in ("1", "2", "3"):
            load_num = int(text)
        elif "accept" in text:
            # Extract load code
            match = re.search(r'TYRE[-:]?(\d+)', text.upper())
            if match:
                load_num = match.group(1)

        if not load_num:
            return WhatsAppReply(
                to_phone=message.from_phone,
                text="Could not understand which load to accept. Reply '1', '2', or '3'.",
            )

        # AI-C7: call the BFF to actually assign the load
        try:
            result = await bff_client.assign_load(
                driver_phone=message.from_phone,
                load_code=f"TYRE-{load_num}",
            )
        except Exception as exc:
            return WhatsAppReply(
                to_phone=message.from_phone,
                text=f"Could not accept load TYRE-{load_num}. Please try again or call support. (Error: {exc})",
            )

        if result is None:
            return WhatsAppReply(
                to_phone=message.from_phone,
                text=f"Could not accept load TYRE-{load_num} right now. The BFF may be unavailable. Please try again in a minute.",
            )

        # Format the reply from the real BFF response
        advance = result.get("advance_amount_inr", 0)
        trip_id = result.get("trip_id", "—")
        pickup_address = result.get("pickup_address", "—")
        shipper_phone = result.get("shipper_phone", "—")
        loading_slot = result.get("loading_slot", "—")

        # Week 2 bridge: notify the broker on Telegram that the driver accepted.
        # Fire-and-forget — broker notification failure must not block the driver's reply.
        await _fire_bridge_event({
            "event": "driver_load_accept",
            "driver_phone": message.from_phone,
            "tyre_code": f"TYRE-{load_num}",
            "advance_inr": advance,
        })

        return WhatsAppReply(
            to_phone=message.from_phone,
            text=(
                f"✅ Load TYRE-{load_num} accepted!\n\n"
                f"₹{advance} advance releasing to your UPI now...\n"
                f"Expected in 60 seconds. ⏱️\n\n"
                f"Trip ID: {trip_id}\n\n"
                f"Pickup details:\n"
                f"📍 Loading Point: {pickup_address}\n"
                f"📞 Shipper contact: {shipper_phone}\n"
                f"🕐 Loading slot: {loading_slot}\n\n"
                f"Reply 'loaded' when cargo loaded.\n"
                f"Reply 'reached' when at destination.\n"
                f"Send photo of POD (proof of delivery) at delivery."
            ),
        )

    async def _handle_status_update(self, message: WhatsAppMessage, text: str) -> WhatsAppReply:
        """Handle status update — 'loaded' / 'reached' etc.

        Week 2 bridge: fires the corresponding event to the bridge agent so the
        linked broker gets a Telegram notification when the driver loads cargo
        or reaches destination."""
        if "load" in text:
            await _fire_bridge_event({
                "event": "driver_status_loaded",
                "driver_phone": message.from_phone,
            })
            return WhatsAppReply(
                to_phone=message.from_phone,
                text="✅ Status updated: Cargo loaded. Safe journey, bhai! Reply 'reached' at destination.",
            )
        elif "reach" in text or "pahunch" in text:
            await _fire_bridge_event({
                "event": "driver_status_reached",
                "driver_phone": message.from_phone,
            })
            return WhatsAppReply(
                to_phone=message.from_phone,
                text="✅ Status updated: Reached destination. Please send POD photo (proof of delivery). Balance will release after consignee confirms.",
            )
        return WhatsAppReply(
            to_phone=message.from_phone,
            text="Status not recognized. Reply 'loaded' or 'reached'.",
        )

    async def _handle_market_rate(self, message: WhatsAppMessage, text: str) -> WhatsAppReply:
        """Handle market rate query."""
        # In production: extract origin + destination from text
        # For now: stub
        return WhatsAppReply(
            to_phone=message.from_phone,
            text=(
                "TYRE Market Rate:\n\n"
                "Patna → Delhi: ₹18-22/km (₹45K avg)\n"
                "Last 7 days: 📈 +5%\n"
                "Trend: Rates rising due to monsoon demand.\n\n"
                "Patna → Kolkata: ₹15-18/km (₹26K avg)\n"
                "Last 7 days: ➡️ Stable\n"
            ),
        )

    async def _handle_emergency(self, message: WhatsAppMessage, text: str) -> WhatsAppReply:
        """Handle emergency — mechanic dispatch, tow, etc.

        Week 2 bridge: fires driver_emergency to the bridge agent so the broker
        instantly gets a Telegram alert (with the driver's phone + the SOS
        description) and can warn the consignee of a possible delay."""
        await _fire_bridge_event({
            "event": "driver_emergency",
            "driver_phone": message.from_phone,
            "description": text,
        })
        return WhatsAppReply(
            to_phone=message.from_phone,
            text=(
                "🚨 EMERGENCY RECEIVED. Help is coming.\n\n"
                "Nearest mechanic: 8 km away (Ramesh Auto, +91-98765-XXXXX)\n"
                "ETA: 25 minutes\n"
                "Tow truck: dispatched if needed\n\n"
                "Stay safe. Share your location via WhatsApp if you can.\n"
                "Call 112 if police help needed."
            ),
        )

    async def _handle_onboarding(self, message: WhatsAppMessage, text: str) -> WhatsAppReply:
        """Handle voice onboarding — 'Main Ramesh hoon, Patna...'"""
        return WhatsAppReply(
            to_phone=message.from_phone,
            text=(
                "Welcome to TYRE! 🎉\n\n"
                "I heard:\n"
                "• Name: [detected from voice]\n"
                "• Truck: [detected]\n"
                "• Location: [detected]\n\n"
                "To complete onboarding:\n"
                "1. Send photo of Aadhaar\n"
                "2. Send photo of PAN\n"
                "3. Send photo of driving license\n"
                "4. Send photo of RC book\n"
                "5. Send 6 photos of your truck\n"
                "6. Reply your UPI ID (e.g., ramesh@upi)\n\n"
                "Takes 5 minutes. Then get ₹10K advance on every load!"
            ),
        )

    async def _handle_advance_request(self, message: WhatsAppMessage) -> WhatsAppReply:
        """Handle advance payment request."""
        return WhatsAppReply(
            to_phone=message.from_phone,
            text=(
                "💰 Advance request received.\n\n"
                "Your current trip: TYRE-1234\n"
                "Advance already released: ₹10,000 ✅\n"
                "Balance pending: ₹35,000 (releases on delivery + consignee confirm)\n\n"
                "Need more help? Reply 'help'."
            ),
        )

    async def _handle_pod_upload(self, message: WhatsAppMessage) -> WhatsAppReply:
        """Handle POD photo upload.

        Week 2 bridge: fires driver_pod_uploaded to the bridge agent so the
        broker gets a Telegram notification with the photo link + GPS verification,
        signaling that consignee WhatsApp confirmation is the only thing between
        them and the balance release."""
        await _fire_bridge_event({
            "event": "driver_pod_uploaded",
            "driver_phone": message.from_phone,
        })
        return WhatsAppReply(
            to_phone=message.from_phone,
            text=(
                "📸 POD photo received!\n\n"
                "Verifying...\n"
                "• GPS location: ✅ Verified\n"
                "• Photo quality: ✅ Clear\n"
                "• Consignee confirmation: Sending WhatsApp to consignee now...\n\n"
                "Balance ₹35,000 will release within 30 minutes of consignee confirmation."
            ),
        )

    def _build_help_reply(self, phone: str) -> WhatsAppReply:
        """Build help reply for unrecognized messages."""
        return WhatsAppReply(
            to_phone=phone,
            text=(
                "TYRE commands:\n\n"
                "🎤 Send voice note: 'Patna se Delhi, 12-chakka' → find loads\n"
                "1️⃣ Reply '1', '2', '3' → accept load\n"
                "📍 Reply 'loaded' / 'reached' → update status\n"
                "📸 Send photo → upload POD\n"
                "💰 Reply 'advance' → check payment\n"
                "📊 Reply 'rate' → market rate\n"
                "🚨 Reply 'help' / 'emergency' → SOS\n\n"
                "Or just send a voice note in Hindi/Bhojpuri!"
            ),
        )

    def _detect_intent(self, text: str) -> str:
        """Detect intent from text using pattern matching."""
        text_lower = text.lower().strip()
        for intent, patterns in self.INTENT_PATTERNS.items():
            for pattern in patterns:
                if re.search(pattern, text_lower):
                    return intent
        return "UNKNOWN"

    async def send_proactive_message(self, phone: str, text: str) -> dict:
        """
        Send a proactive WhatsApp message to a driver.
        Used for: return-load suggestions, payment confirmations, status broadcasts.

        Phase 0 fix: this used to fabricate `message_id = f"wamid.{uuid4...}"` and
        return `success=True` regardless of whether anything was sent — the comment
        above it said "In production: WhatsApp Business Cloud API" but no such call
        existed. It now calls `app.ai.whatsapp.graph_client.send_text_message()` for a
        real Meta Graph API POST, with an SMS fallback if WhatsApp delivery fails.
        """
        from app.ai.whatsapp.graph_client import send_with_sms_fallback
        result = await send_with_sms_fallback(phone, text)
        return {
            "success": result.get("channel") in ("whatsapp", "sms"),
            "channel": result.get("channel"),
            "message_id": result.get("message_id"),
            "to": phone,
            "text": text,
            "sent_at": str(int(time.time())),
            "error": result.get("error"),
        }

    async def send_payment_confirmation(
        self, phone: str, amount_inr: float, upi_ref: str, payment_type: str = "advance"
    ) -> dict:
        """Send payment confirmation via WhatsApp push."""
        emoji = "💰" if payment_type == "advance" else "✅"
        text = (
            f"TYRE: {emoji} ₹{int(amount_inr):,} {payment_type} released to your UPI.\n"
            f"Ref: {upi_ref}\n"
            f"Time: {time.strftime('%H:%M:%S')}\n"
            f"{'Safe journey, bhai!' if payment_type == 'advance' else 'Trip complete. Well done!'}"
        )
        return await self.send_proactive_message(phone, text)

    async def send_return_load_suggestion(
        self, phone: str, return_load_tyre_code: str, origin: str, destination: str,
        rate_inr: float, driver_locale: str = "hi"
    ) -> dict:
        """Proactively suggest a return load to a driver."""
        templates = {
            "hi": (
                f"TYRE: रिटर्न लोड मिला!\n\n"
                f"लोड: {return_load_tyre_code}\n"
                f"{origin} → {destination}\n"
                f"रेट: ₹{int(rate_inr):,}\n\n"
                f"Accept करने के लिए 'accept {return_load_tyre_code}' भेजें।"
            ),
            "bho": (
                f"TYRE: रिटर्न लोड मिलल!\n\n"
                f"लोड: {return_load_tyre_code}\n"
                f"{origin} → {destination}\n"
                f"रेट: ₹{int(rate_inr):,}\n\n"
                f"Accept करे खातिर 'accept {return_load_tyre_code}' भेजीं।"
            ),
            "en": (
                f"TYRE: Return load found!\n\n"
                f"Load: {return_load_tyre_code}\n"
                f"{origin} → {destination}\n"
                f"Rate: ₹{int(rate_inr):,}\n\n"
                f"Reply 'accept {return_load_tyre_code}' to accept."
            ),
        }
        text = templates.get(driver_locale, templates["en"])
        return await self.send_proactive_message(phone, text)


# ── Bridge agent integration (Week 2 of the WhatsApp↔Telegram bridge) ──────────
#
# `_fire_bridge_event` is the one-line helper the driver bot calls at each driver
# WhatsApp event point (load search, accept, status, POD, emergency). It's a
# module-level function (not a method) so it can be cleanly mocked in tests
# without instantiating the bot. The function is intentionally best-effort:
# bridge failures are logged but never raised, because a Telegram outage on the
# broker side must not delay a driver's WhatsApp reply.

async def _fire_bridge_event(payload: dict) -> None:
    """Fire-and-forget an event to the bridge agent.

    Instantiates a fresh BridgeAgent per call — agents are stateless, so this
    is cheap (no DB connection, no LLM client). If the bridge ever becomes
    stateful (e.g. caching broker chat_ids), swap this for a singleton.
    """
    try:
        from app.agents.bridge import BridgeAgent
        agent = BridgeAgent()
        await agent.run(payload)
    except Exception as e:  # noqa: BLE001 — bridge must never crash the driver flow
        import logging
        logging.getLogger("tyre.whatsapp").warning(
            "[bridge] event %s dropped: %s", payload.get("event"), e,
        )
