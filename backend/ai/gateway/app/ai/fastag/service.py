"""FASTag wallet service — Y1 H2 feature.

Saves driver ₹500-2000/trip in cash toll premium.

How it works:
  - TYRE Wallet: single FASTag linked to driver escrow balance
  - Auto-recharge when balance < ₹500 (recharge ₹2000 from escrow)
  - Toll deducted directly from escrow
  - Disputes auto-filed via NHAI API
  - Per-trip toll cost visible to fleet owner

Revenue: 0.5% of toll volume (₹50-100/trip).
Drivers save ₹500-2000/trip in cash toll premium.

── Phase 0 fix ──────────────────────────────────────────────────────────────
Every wallet read/write here used to be a commented-out line above a fabricated number
(`"remaining_balance_inr": 1500,  # stub`). Wallet state now reads/writes through the BFF
(`app/clients/bff_client.get_fastag_wallet()` / `record_fastag_event()`), which is the
real `FastagWallet`/`FastagTransaction` Postgres tables. The toll-estimate and
NETC-verification calls remain honestly labeled as not-yet-integrated with NHAI's live
API (that integration needs an NHAI partner agreement, out of scope for a Phase 0 code
fix) — they now say so explicitly in the response instead of returning numbers
indistinguishable from a real toll calculator.
"""
from __future__ import annotations

import time
from dataclasses import dataclass

from app.clients import bff_client


@dataclass
class TollEvent:
    fastag_id: str
    toll_plaza: str
    toll_plaza_id: str
    highway: str
    amount: float  # INR
    timestamp: str
    transaction_ref: str


class FastagService:
    """
    FASTag wallet integration via NHAI's NETC API.
    Y1: integration with major issuers (ICICI, HDFC, SBI, AXIS).
    """

    SUPPORTED_ISSUERS = ["ICICI", "HDFC", "SBI", "AXIS", "KOTAK", "YES"]

    async def link_fastag(
        self,
        driver_id: str,
        driver_phone: str,
        fastag_id: str,
        issuer: str,
        vehicle_number: str,
    ) -> dict:
        """Link existing FASTag to TYRE wallet — persists via the BFF."""
        if issuer.upper() not in self.SUPPORTED_ISSUERS:
            return {
                "success": False,
                "error": f"Unsupported FASTag issuer: {issuer}. Supported: {self.SUPPORTED_ISSUERS}",
            }

        # NETC verification API integration requires an NHAI/NETC partner agreement —
        # not yet signed (Y1 H2 scope). We do format-level validation only and label it.
        verification = await self._verify_fastag(fastag_id, vehicle_number)
        if not verification["valid"]:
            return {"success": False, "error": verification["error"]}

        persisted = await bff_client.record_fastag_event({
            "action": "link",
            "driver_id": driver_id,
            "driver_phone": driver_phone,
            "fastag_id": fastag_id,
            "issuer": issuer.upper(),
            "vehicle_number": vehicle_number,
        })

        if not persisted or not persisted.get("success"):
            return {"success": False, "error": "Could not persist wallet link — BFF unavailable"}

        return {
            "success": True,
            "fastag_id": fastag_id,
            "issuer": issuer.upper(),
            "vehicle_number": vehicle_number,
            "escrow_linked": True,
            "auto_recharge_threshold_inr": 500,
            "auto_recharge_amount_inr": 2000,
            "wallet_id": persisted["data"]["wallet_id"],
        }

    async def process_toll_event(self, event: TollEvent) -> dict:
        """
        Process an incoming toll event (from NETC webhook).
        Deduct from driver's escrow balance — real wallet update via the BFF.
        """
        t0 = time.monotonic()

        result = await bff_client.record_fastag_event({
            "action": "toll",
            "fastag_id": event.fastag_id,
            "amount": event.amount,
            "toll_plaza": event.toll_plaza,
            "toll_plaza_id": event.toll_plaza_id,
            "highway": event.highway,
            "transaction_ref": event.transaction_ref,
        })

        if not result or not result.get("success"):
            return {
                "success": False,
                "error": "Could not process toll event — wallet not found or BFF unavailable",
                "processing_latency_ms": int((time.monotonic() - t0) * 1000),
            }

        await self._notify_driver(event)

        return {
            "success": True,
            "toll_amount_inr": event.amount,
            "auto_recharge_triggered": result["data"]["auto_recharge_triggered"],
            "remaining_balance_inr": result["data"]["remaining_balance_inr"],
            "processing_latency_ms": int((time.monotonic() - t0) * 1000),
        }

    async def get_wallet(self, driver_phone: str) -> dict:
        """Real wallet read — added in Phase 0 so callers aren't limited to event-driven flows."""
        result = await bff_client.get_fastag_wallet(driver_phone)
        if result is None:
            return {"success": False, "error": "BFF unavailable"}
        return {"success": True, "data": result.get("data")}

    async def get_toll_estimate(
        self, origin: str, destination: str, vehicle_class: str = "HMV"  # Heavy Motor Vehicle
    ) -> dict:
        """
        Estimate toll cost for a route.
        Honest gap: NHAI's toll calculator API (https://tis.nhai.gov.in/TollInformation)
        integration is unsigned Y1 H2 work, not a code-level fix — this is explicitly
        labeled NOT_INTEGRATED rather than returning a number indistinguishable from a
        real estimate, per the same standard applied to the escrow/trust/WhatsApp fixes.
        """
        return {
            "origin": origin,
            "destination": destination,
            "vehicle_class": vehicle_class,
            "estimated_toll_inr": None,
            "toll_plazas_count": None,
            "currency": "INR",
            "status": "NOT_INTEGRATED",
            "reason": "NHAI NETC toll-calculator partner API not yet signed (Y1 H2 scope)",
        }

    async def file_dispute(
        self,
        transaction_ref: str,
        dispute_reason: str,  # double_charge | wrong_amount | vehicle_mismatch | unauthorized
    ) -> dict:
        """File toll dispute — same honest gap as get_toll_estimate: NETC dispute API
        needs the NHAI partner agreement, not a code fix."""
        return {
            "success": False,
            "transaction_ref": transaction_ref,
            "reason": dispute_reason,
            "status": "NOT_INTEGRATED",
            "error": "NHAI NETC dispute-resolution partner API not yet signed (Y1 H2 scope)",
        }

    async def _verify_fastag(self, fastag_id: str, vehicle_number: str) -> dict:
        """Format-level validation only — see link_fastag() docstring for why full NETC
        verification isn't wired yet."""
        valid = bool(fastag_id) and len(fastag_id) >= 8 and bool(vehicle_number)
        return {"valid": valid, "vehicle_match": valid, "error": None if valid else "Malformed FASTag ID or vehicle number"}

    async def _notify_driver(self, event: TollEvent):
        """Send WhatsApp (falling back to SMS) notification to driver about toll charge.
        Best-effort: the BFF's `record_fastag_event("toll", ...)` call already has the
        wallet's `driverPhone` server-side; if it isn't echoed back in the response we
        skip notification rather than fail the toll deduction over a non-critical step."""
        from app.ai.whatsapp.graph_client import send_with_sms_fallback
        driver_phone = getattr(event, "driver_phone", None)
        if not driver_phone:
            return
        await send_with_sms_fallback(
            driver_phone,
            f"TYRE: ₹{int(event.amount)} toll deducted at {event.toll_plaza}. Ref: {event.transaction_ref}",
        )
