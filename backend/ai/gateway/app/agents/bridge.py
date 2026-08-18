"""Bridge Agent — routes events between WhatsApp (driver channel) and Telegram (broker channel).

The WhatsApp↔Telegram bridge epic, Week 2: the actual cross-channel routing layer that
sits between the two bots. Where Week 1 built the *channels* (Telegram bot client +
broker bot + webhook + onboarding), Week 2 builds the *bridge*: a single agent that
subscribes to driver WhatsApp events and broker Telegram actions, and pushes the
corresponding notification to the other side.

Why a separate agent (not just direct calls from each bot):
  - Single source of truth for "when X happens on side A, what should side B see?"
  - One place to add future channels (SMS blast, in-app push, email) without touching
    the bots themselves.
  - Decouples bot UX (Hindi Bhojpuri voice notes on WhatsApp; /commands on Telegram)
    from inter-channel routing logic.
  - Same BaseAgent shape as Dispatch/Pricing/Fraud/Payment so it shows up in agent
    metrics, audit logs, and the orchestrator's registry when we promote it to Y1.

The agent is deliberately *not* in Y1_AGENTS yet — it's registered in Y2PLUS_AGENTS
until Week 3 lands the nearby-driver broadcast (which makes the bridge load-bearing
for the marketplace). For Week 2 it's used via direct `await BridgeAgent().run(...)`
calls from the WhatsApp driver bot and the Telegram broker bot, not via the
orchestrator.

Same "fail loud in logs, not silently" rule as the rest of the codebase: every push
to WhatsApp or Telegram returns a result dict, never raises — a failed Telegram
push to a broker must not crash a driver's WhatsApp flow.
"""
from __future__ import annotations

import logging
import time
from typing import Any

from app.agents.base import AgentResult, BaseAgent
from app.ai.telegram.broker_bot import TelegramBrokerBot
from app.ai.whatsapp.driver_bot import WhatsAppDriverBot
from app.clients import bff_client

logger = logging.getLogger("tyre.bridge")


class BridgeAgent(BaseAgent):
    """Cross-channel event router.

    Two entry points:
      - `run({"event": "driver_*", ...})`           — driver WhatsApp event → broker Telegram
      - `run({"event": "broker_*", ...})`           — broker Telegram action → driver WhatsApp

    The two bots call `bridge.run(...)` directly. Each event handler is a small async
    method that fans out to one or both channels. The agent never blocks a bot reply
    on a successful bridge push — if the broker's Telegram is unreachable, the driver
    still gets their WhatsApp reply and the gap is logged.
    """

    name = "Bridge"

    def __init__(self):
        self._whatsapp_bot = WhatsAppDriverBot()
        self._telegram_bot = TelegramBrokerBot()

    # ── BaseAgent entrypoint ───────────────────────────────────────────
    async def run(self, input_data: dict) -> AgentResult:
        """Route a bridge event. The `event` field selects the handler:
            driver_load_search    — driver asked for loads on WhatsApp
            driver_load_accept    — driver accepted a load on WhatsApp
            driver_status_loaded  — driver said "loaded" on WhatsApp
            driver_status_reached — driver said "reached" on WhatsApp
            driver_pod_uploaded   — driver sent a POD photo on WhatsApp
            driver_emergency      — driver sent an SOS on WhatsApp
            broker_cancel_load    — broker pressed Cancel on Telegram
            broker_release_balance— broker pressed Release Balance on Telegram
            broker_broadcast      — broker pressed Broadcast on Telegram (Week 3 stub)
            payment_advance       — PaymentAgent released an advance
            payment_balance       — PaymentAgent released a balance
        """
        t0 = time.monotonic()
        event = (input_data.get("event") or "").strip()
        try:
            handler = getattr(self, f"_on_{event}", None)
            if handler is None:
                return AgentResult(
                    success=False,
                    data={"event": event, "error": "unknown_event"},
                    latency_ms=int((time.monotonic() - t0) * 1000),
                    error=f"unknown bridge event: {event}",
                )
            data = await handler(input_data)
            return AgentResult(
                success=True,
                data=data,
                latency_ms=int((time.monotonic() - t0) * 1000),
            )
        except Exception as e:  # noqa: BLE001 — bridge failures must never crash a bot flow
            logger.error("[bridge] event %s raised: %s", event, e)
            return AgentResult(
                success=False,
                data={"event": event, "error": str(e)},
                latency_ms=int((time.monotonic() - t0) * 1000),
                error=str(e),
            )

    # ── Driver → Broker events (driver WhatsApp → broker Telegram) ─────

    async def _on_driver_load_search(self, data: dict) -> dict:
        """Driver searched for loads on WhatsApp → notify linked broker.

        Per the bridge design: 'Driver WhatsApps "load chahiye" → broker instantly
        gets a Telegram notification: 📦 New load req from Ramesh · Patna→Delhi'.
        The broker can then either call the driver directly or pre-emptively
        post a matching load via the dashboard."""
        broker_chat_id = await self._resolve_broker_chat_id_for_load_or_driver(data)
        if not broker_chat_id:
            return {"pushed": False, "reason": "no_linked_broker"}
        result = await self._telegram_bot.send_load_request_to_broker(
            chat_id=broker_chat_id,
            driver_name=data.get("driver_name", "Driver"),
            driver_phone=data.get("driver_phone", ""),
            origin=data.get("origin", "") or "—",
            destination=data.get("destination", "") or "—",
            truck_type=data.get("truck_type", ""),
            tyre_code=data.get("tyre_code", ""),
        )
        return {"pushed": result["success"], "channel": "telegram", "send": result}

    async def _on_driver_load_accept(self, data: dict) -> dict:
        """Driver accepted a load on WhatsApp → notify broker that load is taken."""
        broker_chat_id = await self._resolve_broker_chat_id_for_load_or_driver(data)
        if not broker_chat_id:
            return {"pushed": False, "reason": "no_linked_broker"}
        tyre_code = data.get("tyre_code", "—")
        driver_name = data.get("driver_name", "Driver")
        driver_phone = data.get("driver_phone", "")
        advance = data.get("advance_inr", 0)
        text = (
            "✅ <b>Load accepted</b>\n\n"
            f"🔖 <code>{_esc(tyre_code)}</code>\n"
            f"👤 {_esc(driver_name)} · {_esc(driver_phone)}\n"
            + (f"💰 ₹{int(advance):,} advance releasing now.\n" if advance else "")
            + "\n<i>The driver has been sent pickup details on WhatsApp.</i>"
        )
        result = await self._telegram_bot.send_proactive_message(broker_chat_id, text)
        return {"pushed": result["success"], "channel": "telegram", "send": result}

    async def _on_driver_status_loaded(self, data: dict) -> dict:
        """Driver said 'loaded' on WhatsApp → notify broker cargo is on the truck."""
        broker_chat_id = await self._resolve_broker_chat_id_for_load_or_driver(data)
        if not broker_chat_id:
            return {"pushed": False, "reason": "no_linked_broker"}
        tyre_code = data.get("tyre_code", "—")
        truck_number = data.get("truck_number", "")
        text = (
            "📦 <b>Cargo loaded</b>\n\n"
            f"🔖 <code>{_esc(tyre_code)}</code>\n"
            + (f"🚛 {_esc(truck_number)} now in transit.\n" if truck_number else "")
            + "📍 <i>Live GPS tracking available in the dashboard.</i>"
        )
        result = await self._telegram_bot.send_proactive_message(broker_chat_id, text)
        return {"pushed": result["success"], "channel": "telegram", "send": result}

    async def _on_driver_status_reached(self, data: dict) -> dict:
        """Driver said 'reached' on WhatsApp → notify broker the truck is at destination.

        Per the bridge design: 'Driver WhatsApps "reached Delhi unload point" → broker
        instantly gets a Telegram notification: 📍 GPS verified · BR01GA1234 at dest'.
        This is the moment the broker starts watching for the consignee confirmation."""
        broker_chat_id = await self._resolve_broker_chat_id_for_load_or_driver(data)
        if not broker_chat_id:
            return {"pushed": False, "reason": "no_linked_broker"}
        tyre_code = data.get("tyre_code", "—")
        destination = data.get("destination", "")
        gps_lat = data.get("gps_lat")
        gps_lng = data.get("gps_lng")
        text = (
            "📍 <b>Reached destination</b>\n\n"
            f"🔖 <code>{_esc(tyre_code)}</code>\n"
            + (f"🗺️ {_esc(destination)}\n" if destination else "")
            + (
                f"📍 GPS: {_fmt_gps(gps_lat, gps_lng)} (verified ✅)\n"
                if gps_lat is not None and gps_lng is not None
                else "📍 GPS: pending (driver hasn't shared location)\n"
            )
            + "\n<i>Waiting for POD photo + consignee confirmation to release balance.</i>"
        )
        result = await self._telegram_bot.send_proactive_message(broker_chat_id, text)
        return {"pushed": result["success"], "channel": "telegram", "send": result}

    async def _on_driver_pod_uploaded(self, data: dict) -> dict:
        """Driver sent a POD photo on WhatsApp → notify broker the delivery proof is in."""
        broker_chat_id = await self._resolve_broker_chat_id_for_load_or_driver(data)
        if not broker_chat_id:
            return {"pushed": False, "reason": "no_linked_broker"}
        tyre_code = data.get("tyre_code", "—")
        photo_url = data.get("photo_url", "")
        gps_lat = data.get("gps_lat")
        gps_lng = data.get("gps_lng")
        text = (
            "📸 <b>POD uploaded</b>\n\n"
            f"🔖 <code>{_esc(tyre_code)}</code>\n"
            + (f"📷 <a href=\"{_esc(photo_url)}\">View photo</a>\n" if photo_url else "")
            + (
                f"📍 GPS: {_fmt_gps(gps_lat, gps_lng)} (verified ✅)\n"
                if gps_lat is not None and gps_lng is not None
                else ""
            )
            + "\n<i>Consignee WhatsApp confirmation sent. Balance releases on their tap.</i>"
        )
        result = await self._telegram_bot.send_proactive_message(broker_chat_id, text)
        return {"pushed": result["success"], "channel": "telegram", "send": result}

    async def _on_driver_emergency(self, data: dict) -> dict:
        """Driver SOS on WhatsApp → notify broker so they can rearrange logistics.

        Per the bridge design: '🚨 Driver emergency alerts' on the broker's Telegram
        so they can dispatch a replacement truck or warn the consignee."""
        broker_chat_id = await self._resolve_broker_chat_id_for_load_or_driver(data)
        if not broker_chat_id:
            return {"pushed": False, "reason": "no_linked_broker"}
        tyre_code = data.get("tyre_code", "—")
        driver_phone = data.get("driver_phone", "")
        driver_name = data.get("driver_name", "Driver")
        description = data.get("description", "")
        text = (
            "🚨 <b>DRIVER EMERGENCY</b>\n\n"
            f"🔖 <code>{_esc(tyre_code)}</code>\n"
            f"👤 {_esc(driver_name)} · {_esc(driver_phone)}\n"
            + (f"📝 {_esc(description)}\n" if description else "")
            + "\n⚠️ <b>Mechanic dispatch + tow truck have been arranged for the driver.</b>\n"
            + "<i>Consider notifying the consignee of a possible delay.</i>"
        )
        result = await self._telegram_bot.send_proactive_message(broker_chat_id, text)
        return {"pushed": result["success"], "channel": "telegram", "send": result}

    # ── Broker → Driver events (broker Telegram → driver WhatsApp) ─────

    async def _on_broker_cancel_load(self, data: dict) -> dict:
        """Broker pressed Cancel on Telegram → notify driver via WhatsApp.

        Week 2 calls the BFF to actually cancel the load (PATCH the Load row to
        CANCELLED). The driver gets a WhatsApp push telling them the load is gone
        and why, so they don't show up to a loading point that no longer exists."""
        tyre_code = data.get("tyre_code", "")
        driver_phone = data.get("driver_phone", "")
        reason = data.get("reason", "cancelled by broker")

        # 1. Cancel via BFF (best-effort — driver notification happens regardless).
        # `bff_client.cancel_load` uses `_safe_post` which no-ops + logs when the
        # BFF isn't configured, so no need to pre-check here.
        cancel_result: dict | None = None
        if tyre_code:
            cancel_result = await bff_client.cancel_load(tyre_code, reason=reason)

        # 2. Notify driver on WhatsApp
        pushed = False
        send_result: dict | None = None
        if driver_phone:
            text = (
                f"TYRE: ⚠️ Load {tyre_code} has been cancelled by the broker.\n\n"
                f"Reason: {reason}\n\n"
                "Sorry for the inconvenience, bhai. Reply 'load' to find another load."
            )
            send_result = await self._whatsapp_bot.send_proactive_message(driver_phone, text)
            pushed = send_result.get("success", False)

        return {
            "cancelled_in_db": bool(cancel_result and cancel_result.get("success")),
            "driver_notified": pushed,
            "cancel_result": cancel_result,
            "send_result": send_result,
        }

    async def _on_broker_release_balance(self, data: dict) -> dict:
        """Broker pressed Release Balance on Telegram → trigger manual balance release.

        Week 2 wires the broker's Release Balance button (from a /loads inline
        keyboard, available once the load is DELIVERED) to the real escrow release
        path via the BFF. The driver gets a WhatsApp confirmation when the money
        lands in their UPI."""
        tyre_code = data.get("tyre_code", "")
        driver_phone = data.get("driver_phone", "")
        broker_chat_id = data.get("broker_chat_id", "")

        # 1. Trigger balance release via the BFF — the BFF route calls the
        #    PaymentAgent which talks to Razorpay. We don't call Razorpay directly
        #    from the bridge to keep money-moving logic in one place.
        # `bff_client.release_balance_manually` uses `_safe_post` which no-ops + logs
        # when the BFF isn't configured.
        release_result: dict | None = None
        if tyre_code:
            release_result = await bff_client.release_balance_manually(tyre_code)

        released = bool(release_result and release_result.get("success"))
        amount_inr = (release_result or {}).get("data", {}).get("amount_inr", 0)
        upi_ref = (release_result or {}).get("data", {}).get("upi_ref", "")

        # 2. Notify driver on WhatsApp
        driver_pushed = False
        if driver_phone and released:
            text = (
                f"TYRE: ✅ ₹{int(amount_inr):,} balance released to your UPI.\n"
                f"Load: {tyre_code}\n"
                f"Ref: {upi_ref}\n"
                f"Time: {time.strftime('%H:%M:%S')}\n\n"
                "Trip complete. Well done, bhai! 🎉"
            )
            send_result = await self._whatsapp_bot.send_proactive_message(driver_phone, text)
            driver_pushed = send_result.get("success", False)

        # 3. Acknowledge back to the broker on Telegram
        broker_ack_pushed = False
        if broker_chat_id:
            if released:
                ack_text = (
                    f"✅ <b>Balance released</b> for <code>{_esc(tyre_code)}</code>.\n"
                    f"₹{int(amount_inr):,} sent to driver's UPI (ref <code>{_esc(upi_ref)}</code>)."
                )
            else:
                err = (release_result or {}).get("error", "release failed")
                ack_text = (
                    f"⚠️ <b>Balance release failed</b> for <code>{_esc(tyre_code)}</code>.\n"
                    f"Error: {_esc(err)}\n\n"
                    "<i>Check the trip dashboard or try again later.</i>"
                )
            ack_result = await self._telegram_bot.send_proactive_message(broker_chat_id, ack_text)
            broker_ack_pushed = ack_result.get("success", False)

        return {
            "released": released,
            "amount_inr": amount_inr,
            "upi_ref": upi_ref,
            "driver_notified": driver_pushed,
            "broker_acked": broker_ack_pushed,
            "release_result": release_result,
        }

    async def _on_broker_broadcast(self, data: dict) -> dict:
        """Broker pressed Broadcast on Telegram → fan out to nearby drivers.

        Week 3: the actual fan-out. Steps:
          1. Resolve the load (tyre_code → load + origin GPS + broker_code).
          2. Anti-spam check: ≤3 broadcasts of this load in the last 10 min.
          3. Call NearbyDriverBroadcastService.broadcast() which:
             - queries AVAILABLE drivers within 50km of the origin
             - WhatsApp each one a localized load offer (bounded concurrency)
             - persists a BroadcastLog row
          4. Ack the broker on Telegram with the blast stats.

        The broker's chat_id is in `broker_chat_id` (passed by the broker bot's
        callback router). The driver locale is inferred from the broker's
        preferred locale — Week 3 ships hi/bho/en templates, falling back to en.
        """
        tyre_code = data.get("tyre_code", "")
        broker_chat_id = data.get("broker_chat_id", "")
        broker_code = data.get("broker_code", "")
        driver_locale = data.get("driver_locale", "hi")

        if not tyre_code:
            return {"pushed": False, "reason": "missing_tyre_code", "broker_chat_id": broker_chat_id}

        # 1. Resolve the load to get origin GPS + broker_code (if not provided)
        load_data = await self._resolve_load_for_broadcast(tyre_code, broker_code)
        if not load_data:
            # Ack the broker that the load couldn't be found
            if broker_chat_id:
                await self._telegram_bot.send_proactive_message(
                    broker_chat_id,
                    f"⚠️ <b>Broadcast failed</b> — load <code>{_esc(tyre_code)}</code> not found.",
                )
            return {"pushed": False, "reason": "load_not_found", "tyre_code": tyre_code,
                    "broker_chat_id": broker_chat_id}

        broker_code = load_data.get("broker_code", broker_code)
        origin_lat = load_data.get("origin_lat")
        origin_lng = load_data.get("origin_lng")
        origin_label = load_data.get("origin_label") or load_data.get("origin") or "—"
        truck_type_filter = load_data.get("truck_type_req") or data.get("truck_type_filter")

        if origin_lat is None or origin_lng is None:
            # Load has no origin GPS — can't do a nearby query
            if broker_chat_id:
                await self._telegram_bot.send_proactive_message(
                    broker_chat_id,
                    f"⚠️ <b>Broadcast failed</b> — load <code>{_esc(tyre_code)}</code> has no origin GPS coordinates. "
                    f"Set the origin lat/lng from the dashboard and try again.",
                )
            return {"pushed": False, "reason": "no_origin_gps", "tyre_code": tyre_code,
                    "broker_chat_id": broker_chat_id}

        # 2. Anti-spam check (≤3 broadcasts of this load in 10 min)
        if bff_client._configured():
            allowed_resp = await bff_client.check_broadcast_allowed(tyre_code, broker_code)
            if allowed_resp and allowed_resp.get("success"):
                allowed_data = allowed_resp.get("data") or {}
                if not allowed_data.get("allowed"):
                    if broker_chat_id:
                        await self._telegram_bot.send_proactive_message(
                            broker_chat_id,
                            f"⚠️ <b>Broadcast rate-limited</b> for <code>{_esc(tyre_code)}</code>.\n\n"
                            f"{_esc(allowed_data.get('reason', 'too many recent broadcasts'))}\n\n"
                            "<i>Wait a few minutes and try again, or widen your search from the dashboard.</i>",
                        )
                    return {
                        "pushed": False, "reason": "rate_limited",
                        "tyre_code": tyre_code, "broker_chat_id": broker_chat_id,
                        "rate_limit_reason": allowed_data.get("reason"),
                    }

        # 3. Run the broadcast
        from app.ai.broadcast import (
            BroadcastRequest,
            NearbyDriverBroadcastService,
        )
        service = NearbyDriverBroadcastService()
        request = BroadcastRequest(
            tyre_code=tyre_code,
            broker_code=broker_code,
            origin_lat=float(origin_lat),
            origin_lng=float(origin_lng),
            origin_label=origin_label,
            radius_km=int(data.get("radius_km", 50)),
            truck_type_filter=truck_type_filter,
            driver_locale=driver_locale,
            initiated_by="broker_telegram",
        )
        result = await service.broadcast(request)

        # 4. Ack the broker with the stats
        if broker_chat_id:
            await self._send_broadcast_ack_to_broker(broker_chat_id, tyre_code, result)

        return {
            "pushed": result.success and result.drivers_notified > 0,
            "tyre_code": tyre_code,
            "broker_chat_id": broker_chat_id,
            "drivers_found": result.drivers_found,
            "drivers_notified": result.drivers_notified,
            "drivers_failed": result.drivers_failed,
            "broadcast_log_id": result.broadcast_log_id,
            "error": result.error,
        }

    async def _resolve_load_for_broadcast(self, tyre_code: str, broker_code: str) -> dict | None:
        """Look up a load's origin GPS + broker info for the broadcast.

        Uses the existing get_load_by_tyre_code BFF method (added in Week 2).
        Returns None if the load can't be found."""
        if not bff_client._configured():
            return None
        resp = await bff_client.get_load_by_tyre_code(tyre_code)
        if not resp or not resp.get("success"):
            return None
        data = resp.get("data") or {}
        # The Week 2 /loads/by-tyre-code route doesn't return origin_lat/lng
        # (those fields were added in Week 3). We derive them from origin_label
        # via a geocoding lookup — but for Week 3 we expect the load creation
        # flow to set origin_lat/lng directly. If they're missing, the broadcast
        # fails gracefully with a clear "no origin GPS" message.
        return {
            "broker_code": data.get("broker_code", broker_code),
            "origin_lat": data.get("origin_lat"),
            "origin_lng": data.get("origin_lng"),
            "origin_label": data.get("origin"),
            "origin": data.get("origin"),
            "truck_type_req": data.get("truck_type_req"),
        }

    async def _send_broadcast_ack_to_broker(
        self, chat_id: str | int, tyre_code: str, result: Any,
    ) -> None:
        """Send the broadcast result back to the broker on Telegram.

        Three cases: success with notified drivers, success but 0 drivers found,
        and failure. Each gets a distinct, actionable message."""
        if not result.success:
            text = (
                f"⚠️ <b>Broadcast failed</b> for <code>{_esc(tyre_code)}</code>.\n\n"
                f"Error: {_esc(result.error or 'unknown')}"
            )
        elif result.drivers_notified == 0:
            text = (
                f"📢 <b>Broadcast complete</b> for <code>{_esc(tyre_code)}</code>.\n\n"
                f"Found {result.drivers_found} driver(s) within radius, but none were notified.\n"
                f"<i>Possible reasons: all were on the per-driver hourly limit, or all WhatsApp sends failed.</i>\n\n"
                f"<i>Try widening the radius from the dashboard, or wait an hour for the rate limit to reset.</i>"
            )
        else:
            # Show top 3 closest notified drivers so the broker knows who to expect
            top = sorted(
                [o for o in result.outcomes if o.status == "delivered"],
                key=lambda o: o.distance_km,
            )[:3]
            top_lines = "\n".join(
                f"  • {_esc(o.driver_name)} ({_esc(o.driver_phone)}) — {o.distance_km:.1f} km"
                for o in top
            ) or "  (no delivery details)"
            text = (
                f"📢 <b>Broadcast complete</b> for <code>{_esc(tyre_code)}</code>.\n\n"
                f"✅ {result.drivers_notified} driver(s) notified on WhatsApp\n"
                f"🔍 {result.drivers_found} found within radius\n"
                + (f"⚠️ {result.drivers_failed} send(s) failed\n" if result.drivers_failed else "")
                + f"\n<b>Closest notified:</b>\n{top_lines}\n\n"
                f"<i>The first driver to reply 'accept {tyre_code}' on WhatsApp gets the load.</i>"
            )
        try:
            await self._telegram_bot.send_proactive_message(chat_id, text)
        except Exception as e:  # noqa: BLE001 — ack failure must not mask the broadcast result
            logger.warning("[bridge] broadcast ack to broker failed: %s", e)

    # ── Payment Agent → both sides ─────────────────────────────────────

    async def _on_payment_advance(self, data: dict) -> dict:
        """PaymentAgent released an advance → notify both driver (WhatsApp) and
        broker (Telegram).

        The driver already gets a confirmation via `WhatsAppDriverBot.send_payment_confirmation`
        called from the load-assign flow, so the bridge's driver push is intentionally
        skipped here — but the broker push is the bridge's responsibility because the
        payment agent has no broker-channel awareness."""
        broker_chat_id = await self._resolve_broker_chat_id_for_load_or_driver(data)
        if not broker_chat_id:
            return {"pushed": False, "reason": "no_linked_broker"}
        result = await self._telegram_bot.send_payment_confirmation_to_broker(
            chat_id=broker_chat_id,
            tyre_code=data.get("tyre_code", "—"),
            amount_inr=data.get("amount_inr", 0),
            payment_type="advance",
            upi_ref=data.get("upi_ref", ""),
        )
        return {"pushed": result["success"], "channel": "telegram", "send": result}

    async def _on_payment_balance(self, data: dict) -> dict:
        """PaymentAgent released a balance → notify broker.

        Driver notification is handled by consignee_confirm._notify_parties (which
        already WhatsApps the driver on CONFIRMED). The bridge adds the broker
        Telegram leg."""
        broker_chat_id = await self._resolve_broker_chat_id_for_load_or_driver(data)
        if not broker_chat_id:
            return {"pushed": False, "reason": "no_linked_broker"}
        result = await self._telegram_bot.send_payment_confirmation_to_broker(
            chat_id=broker_chat_id,
            tyre_code=data.get("tyre_code", "—"),
            amount_inr=data.get("amount_inr", 0),
            payment_type="balance",
            upi_ref=data.get("upi_ref", ""),
        )
        return {"pushed": result["success"], "channel": "telegram", "send": result}

    # ── Broker chat_id resolution ──────────────────────────────────────
    async def _resolve_broker_chat_id_for_load_or_driver(self, data: dict) -> str | None:
        """Resolve the broker's Telegram chat_id from either:
          - explicit `broker_chat_id` field (caller already knows it), or
          - `tyre_code` → look up load → look up broker → look up chat_id, or
          - `driver_phone` → look up driver's active trip → load → broker → chat_id.

        Returns None when no linked broker can be found — callers treat that as a
        no-op rather than an error (the bridge is best-effort)."""
        # 1. Explicit
        chat_id = data.get("broker_chat_id")
        if chat_id:
            return str(chat_id)

        if not bff_client._configured():
            return None

        # 2. Via tyre_code → load → broker
        tyre_code = data.get("tyre_code")
        if tyre_code:
            load_resp = await bff_client.get_load_by_tyre_code(tyre_code)
            if load_resp and load_resp.get("success"):
                chat_id = (load_resp.get("data") or {}).get("broker_telegram_chat_id")
                if chat_id:
                    return str(chat_id)

        # 3. Via driver_phone → active trip → load → broker
        driver_phone = data.get("driver_phone")
        if driver_phone:
            trip_resp = await bff_client.get_driver_active_trip(driver_phone)
            if trip_resp and trip_resp.get("success"):
                chat_id = (trip_resp.get("data") or {}).get("broker_telegram_chat_id")
                if chat_id:
                    return str(chat_id)

        return None


# ── Helpers ───────────────────────────────────────────────────────────
def _esc(text: Any) -> str:
    """Escape HTML special chars for Telegram's HTML parse_mode."""
    if text is None:
        return ""
    return (
        str(text)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )


def _fmt_gps(lat: float | None, lng: float | None) -> str:
    """Format GPS coordinates for Telegram display. Returns 'unavailable' if
    either coordinate is missing."""
    if lat is None or lng is None:
        return "unavailable"
    try:
        return f"{float(lat):.4f}, {float(lng):.4f}"
    except (TypeError, ValueError):
        return "unavailable"
