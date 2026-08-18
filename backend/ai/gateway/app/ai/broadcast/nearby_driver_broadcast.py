"""Nearby-driver broadcast service — Week 3 of the WhatsApp↔Telegram bridge.

The highest-ROI feature for the Indian trucking wedge. Currently drivers call
5-10 brokers to find loads; brokers call 10-20 drivers to find trucks. This
service solves the broker side: when a broker broadcasts a load, we query all
AVAILABLE drivers within `radius_km` of the load origin and WhatsApp each one
a load offer — no app install needed on the driver side.

Why this is the wedge's killer feature:
  - 80% of Indian truck drivers use WhatsApp daily. The blast goes to the
    channel they already check.
  - Brokers currently spend 30-60 min per load on phone calls. This collapses
    it to 1 tap on Telegram + 30 seconds of WhatsApp delivery.
  - The first broker who can fill a truck in 5 minutes instead of 60 wins
    every shipper. That's the marketplace moat.

Same "fail loud in logs, not silently" pattern as the rest of the codebase:
every per-driver WhatsApp send returns a result dict, never raises — one
driver's WhatsApp failure must not stop the blast to the other 19.

Anti-spam (enforced in the BFF route, not here):
  - A load can be broadcast at most 3 times in 10 minutes (broker can re-blast
    if the first blast didn't fill the truck).
  - A driver receives at most 5 broadcasts per hour (queried from BroadcastLog).
  - Hard cap of 50 drivers per blast (the WhatsApp Business API rate limit is
    1000 business-initiated conversations per 24h; 50/load is well within).
"""
from __future__ import annotations

import asyncio
import json
import logging
import math
import time
from dataclasses import dataclass, field
from typing import Any

from app.ai.whatsapp.driver_bot import WhatsAppDriverBot
from app.clients import bff_client

logger = logging.getLogger("tyre.broadcast")


# ── Tunable constants ─────────────────────────────────────────────────────────
DEFAULT_RADIUS_KM = 50           # Y1 wedge: Bihar-Jharkhand-UP, 50km is the broker's natural catchment
MAX_DRIVERS_PER_BLAST = 50       # hard cap — WhatsApp Business API + anti-spam
MIN_RADIUS_KM = 5                # below this, the broker should just call drivers directly
MAX_RADIUS_KM = 200              # above this, the blast is too unfocused to be useful
PER_DRIVER_SEND_CONCURRENCY = 10 # WhatsApp sends fanned out 10 at a time to avoid thundering herd on Meta


@dataclass
class BroadcastRequest:
    """One broadcast invocation. Built by the bridge agent or the /wedge/broadcast
    route from a load + broker context."""
    tyre_code: str
    broker_code: str
    origin_lat: float
    origin_lng: float
    origin_label: str
    radius_km: int = DEFAULT_RADIUS_KM
    truck_type_filter: str | None = None
    driver_locale: str = "hi"           # BCP-47 — used to pick the WhatsApp template
    initiated_by: str = "broker_telegram"  # broker_telegram | dashboard | api


@dataclass
class BroadcastOutcome:
    """Per-driver outcome — one of these per driver we tried to blast."""
    driver_phone: str
    driver_name: str
    distance_km: float
    status: str                          # delivered | failed | skipped
    error: str | None = None


@dataclass
class BroadcastResult:
    """Aggregate result returned to the caller (bridge agent / BFF route)."""
    success: bool
    tyre_code: str
    broker_code: str
    drivers_found: int
    drivers_notified: int
    drivers_failed: int
    outcomes: list[BroadcastOutcome] = field(default_factory=list)
    broadcast_log_id: str | None = None    # BroadcastLog row id (if persisted)
    latency_ms: int = 0
    error: str | None = None


class NearbyDriverBroadcastService:
    """Orchestrates the nearby-driver broadcast.

    Stateless — instantiates a fresh WhatsAppDriverBot per call (the bot is
    cheap; no DB connection, no LLM client). If the broadcast ever needs to
    cache driver lookups, swap this for a singleton.
    """

    def __init__(self):
        self._whatsapp_bot = WhatsAppDriverBot()

    async def broadcast(self, request: BroadcastRequest) -> BroadcastResult:
        """Run one broadcast. Steps:
            1. Validate the request (radius, coords).
            2. Query nearby AVAILABLE drivers via the BFF.
            3. Cap to MAX_DRIVERS_PER_BLAST.
            4. Send a localized WhatsApp load offer to each driver (concurrent,
               bounded by PER_DRIVER_SEND_CONCURRENCY).
            5. Persist a BroadcastLog row with the per-driver outcomes.
            6. Return the aggregate result.
        """
        t0 = time.monotonic()
        try:
            # 1. Validate
            if not request.tyre_code or not request.broker_code:
                return BroadcastResult(
                    success=False, tyre_code=request.tyre_code, broker_code=request.broker_code,
                    drivers_found=0, drivers_notified=0, drivers_failed=0,
                    error="tyre_code and broker_code are required",
                    latency_ms=int((time.monotonic() - t0) * 1000),
                )
            if not _valid_coord(request.origin_lat, request.origin_lng):
                return BroadcastResult(
                    success=False, tyre_code=request.tyre_code, broker_code=request.broker_code,
                    drivers_found=0, drivers_notified=0, drivers_failed=0,
                    error=f"invalid origin coords: {request.origin_lat}, {request.origin_lng}",
                    latency_ms=int((time.monotonic() - t0) * 1000),
                )
            radius = max(MIN_RADIUS_KM, min(MAX_RADIUS_KM, request.radius_km))

            # 2. Query nearby drivers via BFF
            nearby_resp = await bff_client.find_nearby_drivers(
                lat=request.origin_lat,
                lng=request.origin_lng,
                radius_km=radius,
                truck_type=request.truck_type_filter,
            )
            if not nearby_resp or not nearby_resp.get("success"):
                err = (nearby_resp or {}).get("error", "bff_unavailable")
                return BroadcastResult(
                    success=False, tyre_code=request.tyre_code, broker_code=request.broker_code,
                    drivers_found=0, drivers_notified=0, drivers_failed=0,
                    error=f"nearby query failed: {err}",
                    latency_ms=int((time.monotonic() - t0) * 1000),
                )

            drivers = (nearby_resp.get("data") or {}).get("drivers") or []
            if not drivers:
                logger.info(
                    "[broadcast] %s: 0 drivers within %dkm of (%.4f, %.4f) — no blast",
                    request.tyre_code, radius, request.origin_lat, request.origin_lng,
                )
                # Still persist a BroadcastLog row so the broker sees "0 found"
                # in their history (helps them decide to widen the radius next time).
                log_id = await self._persist_log(request, radius, [], 0, 0, 0)
                return BroadcastResult(
                    success=True, tyre_code=request.tyre_code, broker_code=request.broker_code,
                    drivers_found=0, drivers_notified=0, drivers_failed=0,
                    outcomes=[], broadcast_log_id=log_id,
                    latency_ms=int((time.monotonic() - t0) * 1000),
                )

            # 3. Cap + sort by distance (BFF already sorted, but re-sort defensively)
            drivers_sorted = sorted(drivers, key=lambda d: float(d.get("distance_km") or 9999))
            drivers_capped = drivers_sorted[:MAX_DRIVERS_PER_BLAST]

            # 4. Concurrent WhatsApp blast (bounded)
            outcomes = await self._blast_drivers(drivers_capped, request)

            delivered = [o for o in outcomes if o.status == "delivered"]
            failed = [o for o in outcomes if o.status == "failed"]

            # 5. Persist BroadcastLog
            log_id = await self._persist_log(
                request, radius, outcomes,
                drivers_found=len(drivers_capped),
                drivers_notified=len(delivered),
                drivers_failed=len(failed),
            )

            logger.info(
                "[broadcast] %s: found=%d notified=%d failed=%d (radius=%dkm, log=%s)",
                request.tyre_code, len(drivers_capped), len(delivered), len(failed),
                radius, log_id,
            )

            return BroadcastResult(
                success=True,
                tyre_code=request.tyre_code,
                broker_code=request.broker_code,
                drivers_found=len(drivers_capped),
                drivers_notified=len(delivered),
                drivers_failed=len(failed),
                outcomes=outcomes,
                broadcast_log_id=log_id,
                latency_ms=int((time.monotonic() - t0) * 1000),
            )
        except Exception as e:  # noqa: BLE001 — broadcast failures must surface as a result, not raise
            logger.error("[broadcast] %s raised: %s", request.tyre_code, e)
            return BroadcastResult(
                success=False, tyre_code=request.tyre_code, broker_code=request.broker_code,
                drivers_found=0, drivers_notified=0, drivers_failed=0,
                error=str(e),
                latency_ms=int((time.monotonic() - t0) * 1000),
            )

    # ── Per-driver WhatsApp blast ──────────────────────────────────────
    async def _blast_drivers(
        self, drivers: list[dict], request: BroadcastRequest,
    ) -> list[BroadcastOutcome]:
        """Send a WhatsApp load offer to each driver, bounded by
        PER_DRIVER_SEND_CONCURRENCY. One driver's failure does not stop the
        rest — each send returns a BroadcastOutcome, never raises."""
        semaphore = asyncio.Semaphore(PER_DRIVER_SEND_CONCURRENCY)

        async def _one(driver: dict) -> BroadcastOutcome:
            async with semaphore:
                return await self._send_to_one_driver(driver, request)

        return await asyncio.gather(*[_one(d) for d in drivers])

    async def _send_to_one_driver(
        self, driver: dict, request: BroadcastRequest,
    ) -> BroadcastOutcome:
        """Send the localized load offer to one driver. Returns the outcome."""
        phone = driver.get("phone", "")
        name = driver.get("name", "Driver")
        distance_km = float(driver.get("distance_km") or 0)
        if not phone:
            return BroadcastOutcome(
                driver_phone="", driver_name=name, distance_km=distance_km,
                status="skipped", error="missing_phone",
            )

        text = _build_load_offer_text(request, driver)
        try:
            result = await self._whatsapp_bot.send_proactive_message(phone, text)
            if result.get("success"):
                return BroadcastOutcome(
                    driver_phone=phone, driver_name=name, distance_km=distance_km,
                    status="delivered",
                )
            return BroadcastOutcome(
                driver_phone=phone, driver_name=name, distance_km=distance_km,
                status="failed", error=result.get("error", "send_failed"),
            )
        except Exception as e:  # noqa: BLE001 — one failure must not stop the blast
            logger.warning("[broadcast] send to %s failed: %s", phone, e)
            return BroadcastOutcome(
                driver_phone=phone, driver_name=name, distance_km=distance_km,
                status="failed", error=str(e),
            )

    # ── BroadcastLog persistence ───────────────────────────────────────
    async def _persist_log(
        self,
        request: BroadcastRequest,
        radius_km: int,
        outcomes: list[BroadcastOutcome],
        drivers_found: int,
        drivers_notified: int,
        drivers_failed: int,
    ) -> str | None:
        """Persist a BroadcastLog row via the BFF. Best-effort — if the BFF
        is unavailable, the broadcast still ran; we just lose the audit trail
        (logged, not crashed)."""
        outcomes_json = json.dumps([
            {
                "phone": o.driver_phone,
                "name": o.driver_name,
                "distance_km": round(o.distance_km, 2),
                "status": o.status,
                "error": o.error,
            }
            for o in outcomes
        ], ensure_ascii=False)
        result = await bff_client.persist_broadcast_log({
            "tyre_code": request.tyre_code,
            "broker_code": request.broker_code,
            "origin_lat": request.origin_lat,
            "origin_lng": request.origin_lng,
            "origin_label": request.origin_label,
            "radius_km": radius_km,
            "truck_type_filter": request.truck_type_filter,
            "drivers_found": drivers_found,
            "drivers_notified": drivers_notified,
            "drivers_failed": drivers_failed,
            "outcomes": outcomes_json,
            "initiated_by": request.initiated_by,
        })
        if not result or not result.get("success"):
            logger.warning(
                "[broadcast] %s: BroadcastLog not persisted — BFF unavailable",
                request.tyre_code,
            )
            return None
        return (result.get("data") or {}).get("id")


# ── Helpers ───────────────────────────────────────────────────────────────────

def _valid_coord(lat: float, lng: float) -> bool:
    """Reject obviously-wrong coords (NaN, out of range)."""
    try:
        lat_f = float(lat)
        lng_f = float(lng)
    except (TypeError, ValueError):
        return False
    if math.isnan(lat_f) or math.isnan(lng_f):
        return False
    if not (-90 <= lat_f <= 90):
        return False
    if not (-180 <= lng_f <= 180):
        return False
    return True


def _build_load_offer_text(request: BroadcastRequest, driver: dict) -> str:
    """Build the localized WhatsApp load offer for one driver.

    Templates cover the Y1 languages (hi, bho, en). Falls back to English
    for any unknown locale — matching the consignee_confirm + return_load
    suggestion pattern in the WhatsApp driver bot."""
    distance_km = int(float(driver.get("distance_km") or 0))
    rate_inr = int(float(driver.get("rate_inr") or 0)) if driver.get("rate_inr") else 0
    advance_inr = int(float(driver.get("advance_inr") or 0)) if driver.get("advance_inr") else 0
    truck_type = driver.get("truck_type") or request.truck_type_filter or ""
    destination = driver.get("destination") or ""

    # Pull load details from the driver dict (BFF enriches the nearby response
    # with the load's destination/rate/advance so each driver gets a complete
    # offer in one message — no follow-up round-trip needed).
    rate_line = f"💰 ₹{rate_inr:,}" if rate_inr else "💰 Rate: broker se baat karein"
    advance_line = f"💸 Advance: ₹{advance_inr:,}" if advance_inr else ""
    truck_line = f"🚛 {_escape_wa(truck_type)}" if truck_type else ""
    dest_line = f"🎯 {_escape_wa(destination)}" if destination else ""

    templates = {
        "hi": (
            f"TYRE: 📦 आपके लिए नया लोड मिला!\n\n"
            f"🔖 लोड: {request.tyre_code}\n"
            f"📍 {_escape_wa(request.origin_label)} से{(' → ' + dest_line) if dest_line else ''}\n"
            f"📏 आपसे {distance_km} km दूर\n"
            f"{rate_line}\n"
            + (f"{advance_line}\n" if advance_line else "")
            + (f"{truck_line}\n" if truck_line else "")
            + f"\nAccept करने के लिए 'accept {request.tyre_code}' भेजें।"
        ),
        "bho": (
            f"TYRE: 📦 आपके खातिर नया लोड मिलल!\n\n"
            f"🔖 लोड: {request.tyre_code}\n"
            f"📍 {_escape_wa(request.origin_label)} से{(' → ' + dest_line) if dest_line else ''}\n"
            f"📏 आपसे {distance_km} km दूर\n"
            f"{rate_line}\n"
            + (f"{advance_line}\n" if advance_line else "")
            + (f"{truck_line}\n" if truck_type else "")
            + f"\nAccept करे खातिर 'accept {request.tyre_code}' भेजीं।"
        ),
        "en": (
            f"TYRE: 📦 New load available near you!\n\n"
            f"🔖 Load: {request.tyre_code}\n"
            f"📍 From {_escape_wa(request.origin_label)}{(' → ' + dest_line) if dest_line else ''}\n"
            f"📏 {distance_km} km from your location\n"
            f"{rate_line}\n"
            + (f"{advance_line}\n" if advance_inr else "")
            + (f"{truck_line}\n" if truck_type else "")
            + f"\nReply 'accept {request.tyre_code}' to accept."
        ),
    }
    return templates.get(request.driver_locale, templates["en"])


def _escape_wa(text: Any) -> str:
    """Light sanitization for WhatsApp text (WhatsApp doesn't interpret HTML,
    but we strip control chars + newlines to keep the offer readable on a
    single screen)."""
    if text is None:
        return ""
    import re
    s = str(text)
    # Replace newlines / carriage returns with single spaces, then strip other
    # control chars (matches InputValidator.validate_text in the gateway).
    s = re.sub(r'[\r\n]+', ' ', s)
    s = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', s)
    # Collapse runs of whitespace into a single space (so "Patna\r\nBihar"
    # becomes "Patna Bihar", not "Patna  Bihar")
    s = re.sub(r'\s+', ' ', s).strip()
    # Cap to 80 chars so the origin label / destination don't blow up the message
    return s[:80]
