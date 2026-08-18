"""BFF callback client — Phase 0 fix.

`backend/ai/gateway` never opens a DB connection directly (see `backend/database/prisma/index.ts`
docstring and `docs/ARCHITECTURE.md` §2.1): it goes through `frontend/web`'s API. Before
Phase 0 this was documented intent with zero implementation — every "real impl: db.X.create(...)"
comment in the Python services was just a comment. This module is the implementation:
a thin, retrying HTTP client the AI gateway uses to write back to Postgres via the BFF's
internal-service routes (`/api/v1/_internal/*`), authenticated with a shared bearer
secret (`TYRE_INTERNAL_SERVICE_TOKEN`) — the same shape as the existing JWT bearer auth
in `backend/shared/auth/src/jwt.ts`, but for service-to-service calls instead of user calls.

If `TYRE_WEB_BFF_URL` or `TYRE_INTERNAL_SERVICE_TOKEN` isn't configured, every call
degrades to a logged no-op rather than throwing — local dev / tests still work, and the
gap is visible in logs instead of silently fabricating success.
"""
from __future__ import annotations

import logging
from typing import Any

import httpx
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

from app.config import settings

logger = logging.getLogger("tyre.bff_client")


class BffUnavailable(Exception):
    """Raised when the BFF could not be reached after retries — caller decides fallback."""


def _configured() -> bool:
    return bool(settings.web_bff_url and settings.internal_service_token)


@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=0.3, min=0.3, max=3),
    retry=retry_if_exception_type((httpx.TransportError, httpx.HTTPStatusError)),
    reraise=True,
)
async def _post(path: str, payload: dict[str, Any]) -> dict[str, Any]:
    url = f"{settings.web_bff_url.rstrip('/')}{path}"
    async with httpx.AsyncClient(timeout=8.0) as client:
        resp = await client.post(
            url,
            json=payload,
            headers={
                "Authorization": f"Bearer {settings.internal_service_token}",
                "X-Tyre-Service": "ai-gateway",
            },
        )
        resp.raise_for_status()
        return resp.json()


@retry(
    stop=stop_after_attempt(2),
    wait=wait_exponential(multiplier=0.3, min=0.3, max=2),
    retry=retry_if_exception_type((httpx.TransportError, httpx.HTTPStatusError)),
    reraise=True,
)
async def _get(path: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
    url = f"{settings.web_bff_url.rstrip('/')}{path}"
    async with httpx.AsyncClient(timeout=8.0) as client:
        resp = await client.get(
            url,
            params=params or {},
            headers={"Authorization": f"Bearer {settings.internal_service_token}"},
        )
        resp.raise_for_status()
        return resp.json()


async def _safe_post(path: str, payload: dict[str, Any], op: str) -> dict[str, Any] | None:
    if not _configured():
        logger.warning("[bff_client] %s skipped — TYRE_WEB_BFF_URL/TYRE_INTERNAL_SERVICE_TOKEN not set", op)
        return None
    try:
        return await _post(path, payload)
    except Exception as e:  # noqa: BLE001 — deliberately broad, this is a best-effort write-back
        logger.error("[bff_client] %s failed after retries: %s", op, e)
        return None


# ── Trust score (Phase 0 §8: "Trust score persistence — STATELESS") ────────────

async def persist_trust_score(data: dict[str, Any]) -> dict[str, Any] | None:
    return await _safe_post("/api/v1/trust/score", data, "persist_trust_score")


async def get_trust_scores(entity_ids: list[str]) -> dict[str, Any] | None:
    if not _configured():
        return None
    try:
        return await _get("/api/v1/trust/scores", {"ids": ",".join(entity_ids)})
    except Exception as e:  # noqa: BLE001
        logger.error("[bff_client] get_trust_scores failed: %s", e)
        return None


# ── Voice onboarding (Phase 0 §8: "STUB — doesn't persist a VoiceOnboarding row") ──

async def persist_voice_onboarding(data: dict[str, Any]) -> dict[str, Any] | None:
    return await _safe_post("/api/v1/onboarding/voice", data, "persist_voice_onboarding")


# ── Escrow (Phase 0 §8: "UPI escrow service — STUB", "Payment Agent — HALLUCINATED") ─

async def persist_escrow_event(data: dict[str, Any]) -> dict[str, Any] | None:
    """Writes one funding/advance/balance/refund event — creates or updates
    UpiEscrowAccount + appends a UpiEscrowTransaction row, atomically, on the BFF side."""
    return await _safe_post("/api/v1/escrow/events", data, "persist_escrow_event")


# ── WhatsApp-sourced load search (Phase 0 §8: "HALF-REAL — returns canned loads") ──

async def match_loads(origin: str, destination: str, truck_type: str | None = None, driver_phone: str = "") -> dict[str, Any] | None:
    """Calls the real `POST /api/v1/loads/match` BFF route — the one that queries the
    actual `Load` table and runs the Dispatch agent — instead of the WhatsApp bot
    returning hardcoded canned loads."""
    return await _safe_post("/api/v1/loads/match", {
        "driver_phone": driver_phone,
        "location": origin,
        "destination": destination,
        "truck_type": truck_type or "",
    }, "match_loads")


# ── Consignee confirmations (TYRE v1.1 item #5: never persisted) ───────────────

async def persist_consignee_confirmation(data: dict[str, Any]) -> dict[str, Any] | None:
    """Create a PENDING ConsigneeConfirmation row at send time so the balance-release
    trigger has a real `trigger_ref` and the audit trail isn't null."""
    return await _safe_post("/api/v1/consignee-confirmations", data, "persist_consignee_confirmation")


async def get_consignee_confirmation(confirmation_link: str) -> dict[str, Any] | None:
    if not _configured():
        return None
    try:
        return await _get("/api/v1/consignee-confirmations", {"link": confirmation_link})
    except Exception as e:  # noqa: BLE001
        logger.error("[bff_client] get_consignee_confirmation failed: %s", e)
        return None


async def update_consignee_confirmation(
    confirmation_link: str, status: str, payment_released: bool = False
) -> dict[str, Any] | None:
    """PATCH a confirmation row to CONFIRMED|REJECTED|EXPIRED."""
    if not _configured():
        logger.warning("[bff_client] update_consignee_confirmation skipped — not configured")
        return None
    url = f"{settings.web_bff_url.rstrip('/')}/api/v1/consignee-confirmations"
    payload = {
        "confirmation_link": confirmation_link,
        "status": status,
        "payment_released": payment_released,
    }
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.patch(
                url,
                json=payload,
                headers={
                    "Authorization": f"Bearer {settings.internal_service_token}",
                    "X-Tyre-Service": "ai-gateway",
                },
            )
            resp.raise_for_status()
            return resp.json()
    except Exception as e:  # noqa: BLE001
        logger.error("[bff_client] update_consignee_confirmation failed: %s", e)
        return None


# ── Voice workflows (TYRE v1.1 item #4: voice-initiated actions were no-ops) ────

async def create_load(data: dict[str, Any]) -> dict[str, Any] | None:
    """Create a Load via the real BFF route so a voice-posted load actually appears
    in the marketplace (was a `# TODO: create the load in DB` no-op)."""
    return await _safe_post("/api/v1/loads", data, "voice_create_load")


async def run_negotiation(data: dict[str, Any]) -> dict[str, Any] | None:
    """Run the NegotiationAgent via the BFF `/api/v1/negotiate` route for a
    voice-initiated negotiation (was a `# TODO: call NegotiationAgent` no-op)."""
    return await _safe_post("/api/v1/negotiate", data, "voice_negotiate")


async def get_fleet_status(params: dict[str, Any]) -> dict[str, Any] | None:
    """Query fleet status via the BFF `/api/v1/fleet` route for a voice fleet query
    (was a `# TODO: call FleetAgent` no-op returning canned data)."""
    if not _configured():
        return None
    try:
        return await _get("/api/v1/fleet", params)
    except Exception as e:  # noqa: BLE001
        logger.error("[bff_client] get_fleet_status failed: %s", e)
        return None


# ── FASTag wallet (Phase 0 §8: "STUB — fabricated wallet balances") ────────────

async def get_fastag_wallet(driver_phone: str) -> dict[str, Any] | None:
    if not _configured():
        return None
    try:
        return await _get("/api/v1/fastag/wallet", {"driver_phone": driver_phone})
    except Exception as e:  # noqa: BLE001
        logger.error("[bff_client] get_fastag_wallet failed: %s", e)
        return None


async def record_fastag_event(data: dict[str, Any]) -> dict[str, Any] | None:
    return await _safe_post("/api/v1/fastag/wallet", data, "record_fastag_event")


# ── Load assignment (AI-C7 fix: WhatsApp driver bot needs this) ────────────────

async def assign_load(driver_phone: str, load_code: str) -> dict[str, Any] | None:
    """Assign a load to a driver via the BFF.

    Calls POST /api/v1/loads/assign with the internal-service token.
    Returns the assignment result (trip_id, advance_amount_inr, pickup details)
    or None if the BFF is unavailable.
    """
    if not _configured():
        return None
    try:
        return await _post("/api/v1/loads/assign", {
            "driver_phone": driver_phone,
            "tyre_code": load_code,
        })
    except Exception as e:  # noqa: BLE001
        logger.error("[bff_client] assign_load failed: %s", e)
        return None


# ── Telegram broker linkage (Week 1 of the WhatsApp↔Telegram bridge) ──────────
#
# The Telegram broker bot (app/ai/telegram/broker_bot.py) needs the same
# BFF-write pattern as the WhatsApp driver bot: persist `telegram_chat_id` on
# the Broker row when a broker runs `/link`, look it up on every subsequent
# `/loads` or callback, and list the broker's open loads. These four methods
# are the thin authenticated HTTP wrappers — the broker bot owns the UX.

async def link_telegram_chat_id(
    broker_code: str,
    broker_phone: str,
    telegram_chat_id: str,
    telegram_username: str | None = None,
) -> dict[str, Any] | None:
    """POST /api/v1/brokers/link-telegram — link a Telegram chat_id to a Broker.

    The BFF route verifies (broker_code, broker_phone) match a real Broker row
    before writing the chat_id, so a random Telegram user can't link themselves
    to an arbitrary broker just by knowing the code. Returns the broker record
    on success."""
    return await _safe_post(
        "/api/v1/brokers/link-telegram",
        {
            "broker_code": broker_code,
            "broker_phone": broker_phone,
            "telegram_chat_id": telegram_chat_id,
            "telegram_username": telegram_username or "",
        },
        "link_telegram_chat_id",
    )


async def unlink_telegram_chat_id(telegram_chat_id: str) -> dict[str, Any] | None:
    """POST /api/v1/brokers/unlink-telegram — clear telegram_chat_id on any
    Broker row that has it. Idempotent — returns success even if no row was
    linked. Used by the broker bot's `/unlink` command."""
    return await _safe_post(
        "/api/v1/brokers/unlink-telegram",
        {"telegram_chat_id": telegram_chat_id},
        "unlink_telegram_chat_id",
    )


async def get_broker_by_telegram_chat_id(telegram_chat_id: str) -> dict[str, Any] | None:
    """GET /api/v1/brokers/by-telegram?chat_id=... — look up the broker linked
    to this Telegram chat. Returns None (not an error) if no broker is linked;
    the broker bot then prompts the user to run /link."""
    if not _configured():
        return None
    try:
        return await _get("/api/v1/brokers/by-telegram", {"chat_id": telegram_chat_id})
    except Exception as e:  # noqa: BLE001
        logger.error("[bff_client] get_broker_by_telegram_chat_id failed: %s", e)
        return None


async def list_broker_loads(broker_code: str) -> dict[str, Any] | None:
    """GET /api/v1/brokers/{broker_code}/loads — list a broker's loads (OPEN,
    NEGOTIATING, ASSIGNED, IN_TRANSIT). Used by the Telegram broker bot's
    `/loads` command."""
    if not _configured():
        return None
    try:
        return await _get(f"/api/v1/brokers/{broker_code}/loads")
    except Exception as e:  # noqa: BLE001
        logger.error("[bff_client] list_broker_loads failed: %s", e)
        return None


# ── Bridge agent lookups (Week 2 of the WhatsApp↔Telegram bridge) ─────────────
#
# The bridge agent needs three lookups to resolve "given X, who is the broker on
# the other side of this load?":
#   1. get_load_by_tyre_code      — load + broker telegram chat_id (for events
#      that already have a tyre_code, e.g. driver_status_reached)
#   2. get_driver_active_trip     — driver_phone → active trip → load → broker
#      (for events that only have a driver_phone, e.g. driver_load_search before
#      any load is accepted)
#   3. cancel_load                — PATCH the Load row to CANCELLED (broker
#      Cancel button on Telegram → driver WhatsApp notification)
#   4. release_balance_manually   — broker Release Balance button → BFF calls
#      the PaymentAgent which calls Razorpay

async def get_load_by_tyre_code(tyre_code: str) -> dict[str, Any] | None:
    """GET /api/v1/loads/by-tyre-code?code=TYRE-0001 — load + broker info.

    Returns the load row joined with the broker's telegram_chat_id (or null if
    the broker hasn't linked Telegram yet). Used by the bridge agent to resolve
    which Telegram chat to push a driver event to."""
    if not _configured():
        return None
    try:
        return await _get("/api/v1/loads/by-tyre-code", {"code": tyre_code})
    except Exception as e:  # noqa: BLE001
        logger.error("[bff_client] get_load_by_tyre_code failed: %s", e)
        return None


async def get_driver_active_trip(driver_phone: str) -> dict[str, Any] | None:
    """GET /api/v1/trips/active?driver_phone=... — the driver's current in-progress
    trip, joined with the load + broker's telegram_chat_id. Used by the bridge
    agent for events that only carry the driver's phone (e.g. driver_load_search,
    driver_emergency) — there's no tyre_code yet at those points."""
    if not _configured():
        return None
    try:
        return await _get("/api/v1/trips/active", {"driver_phone": driver_phone})
    except Exception as e:  # noqa: BLE001
        logger.error("[bff_client] get_driver_active_trip failed: %s", e)
        return None


async def cancel_load(tyre_code: str, reason: str = "cancelled by broker") -> dict[str, Any] | None:
    """POST /api/v1/loads/cancel — cancel a load by tyre_code. Called by the
    bridge agent when a broker presses the Cancel button on Telegram. Returns
    the cancelled load + the assigned driver's phone (so the bridge can notify
    them). 404 if the load doesn't exist; 409 if it's already DELIVERED."""
    return await _safe_post(
        "/api/v1/loads/cancel",
        {"tyre_code": tyre_code, "reason": reason},
        "cancel_load",
    )


async def release_balance_manually(tyre_code: str) -> dict[str, Any] | None:
    """POST /api/v1/trips/release-balance — broker-initiated balance release
    (broker pressed the Release Balance button on Telegram). The BFF route
    looks up the trip by tyre_code, calls the PaymentAgent with action=balance,
    and returns the UPI ref + amount. Idempotent on (trip_id, trigger_ref)."""
    return await _safe_post(
        "/api/v1/trips/release-balance",
        {"tyre_code": tyre_code, "trigger": "MANUAL", "trigger_ref": f"broker_telegram_{int(__import__('time').time())}"},
        "release_balance_manually",
    )


# ── Nearby-driver broadcast (Week 3 of the WhatsApp↔Telegram bridge) ──────────
#
# Two BFF calls the broadcast service needs:
#   1. find_nearby_drivers  — GET /api/v1/drivers/nearby?lat=&lng=&radius_km=&truck_type=
#      Returns AVAILABLE drivers within `radius_km` of (lat, lng), sorted by
#      distance, each enriched with distance_km + the broadcast load's
#      destination/rate/advance so the WhatsApp offer is self-contained.
#   2. persist_broadcast_log — POST /api/v1/broadcasts
#      Writes one BroadcastLog row (audit trail + anti-spam queries).
#   3. check_broadcast_allowed — GET /api/v1/loads/[code]/broadcast-allowed
#      Anti-spam check: returns whether the broker can broadcast this load
#      right now (≤3 broadcasts in 10 min) and the driver can receive
#      (≤5 broadcasts/hour). The BFF route enforces both.

async def find_nearby_drivers(
    lat: float, lng: float, radius_km: int = 50,
    truck_type: str | None = None,
    tyre_code: str | None = None,
) -> dict[str, Any] | None:
    """GET /api/v1/drivers/nearby — AVAILABLE drivers within radius_km of (lat, lng).

    The BFF route does the bounding-box + haversine calculation (no PostGIS
    dependency). Each driver is enriched with `distance_km` and, when
    `tyre_code` is provided, the load's destination/rate/advance so the
    broadcast service can build a self-contained WhatsApp offer."""
    if not _configured():
        return None
    params: dict[str, Any] = {
        "lat": str(lat),
        "lng": str(lng),
        "radius_km": str(radius_km),
    }
    if truck_type:
        params["truck_type"] = truck_type
    if tyre_code:
        params["tyre_code"] = tyre_code
    try:
        return await _get("/api/v1/drivers/nearby", params)
    except Exception as e:  # noqa: BLE001
        logger.error("[bff_client] find_nearby_drivers failed: %s", e)
        return None


async def persist_broadcast_log(data: dict[str, Any]) -> dict[str, Any] | None:
    """POST /api/v1/broadcasts — persist one BroadcastLog row.

    Called by the broadcast service after every blast (including 0-driver
    blasts, so the broker sees "0 found" in their history). Returns the row id
    so the broadcast service can include it in BroadcastResult."""
    return await _safe_post("/api/v1/broadcasts", data, "persist_broadcast_log")


async def check_broadcast_allowed(tyre_code: str, broker_code: str) -> dict[str, Any] | None:
    """GET /api/v1/loads/[code]/broadcast-allowed?broker_code=... — anti-spam check.

    Returns `{"allowed": bool, "reason": str, "recent_count": int}`. The BFF
    route enforces: ≤3 broadcasts of the same load in 10 min. Per-driver rate
    limiting (≤5 broadcasts/hour) is enforced inside the BFF's nearby query —
    drivers over the limit are filtered out before the blast."""
    if not _configured():
        return None
    try:
        return await _get(
            f"/api/v1/loads/{tyre_code}/broadcast-allowed",
            {"broker_code": broker_code},
        )
    except Exception as e:  # noqa: BLE001
        logger.error("[bff_client] check_broadcast_allowed failed: %s", e)
        return None


async def get_load_broadcasts(tyre_code: str) -> dict[str, Any] | None:
    """GET /api/v1/loads/[code]/broadcasts — history of broadcasts for a load.

    Used by the broker bot's /loads view to show "📢 3 broadcasts · 47 drivers
    notified" next to each load, and by the dashboard's broadcast history page."""
    if not _configured():
        return None
    try:
        return await _get(f"/api/v1/loads/{tyre_code}/broadcasts")
    except Exception as e:  # noqa: BLE001
        logger.error("[bff_client] get_load_broadcasts failed: %s", e)
        return None


async def update_driver_location(
    driver_phone: str, lat: float, lng: float, location_label: str | None = None,
) -> dict[str, Any] | None:
    """POST /api/v1/drivers/update-location — update a driver's current GPS coords.

    Called by the WhatsApp driver bot when a driver shares a WhatsApp location
    pin, by a periodic job that promotes the latest GpsPing of an active trip,
    and by the voice onboarding pipeline when a driver says their location.

    Drivers without GPS coords are invisible to the nearby broadcast query —
    the broadcast just won't reach them. This method is the only way to set
    Driver.currentLat/Lng from outside the dashboard."""
    return await _safe_post(
        "/api/v1/drivers/update-location",
        {
            "driver_phone": driver_phone,
            "lat": lat,
            "lng": lng,
            **({"location_label": location_label} if location_label else {}),
        },
        "update_driver_location",
    )
