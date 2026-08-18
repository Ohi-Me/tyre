"""UPI escrow service — THE Y1 wedge flagship.

The single most powerful driver-acquisition tool:
  ₹10,000 advance released within 60 seconds of load acceptance.

How it works:
  1. Broker funds escrow: ₹55K = ₹45K load + ₹10K advance (via Razorpay Route)
  2. Load appears on marketplace
  3. Driver accepts load
  4. Within 60 seconds: ₹10K advance auto-released to driver's UPI
  5. Driver delivers, uploads POD photo + GPS
  6. Consignee confirms via WhatsApp
  7. Balance ₹45K auto-released to driver UPI, minus TYRE's 1% balance-leg fee
     (₹450 = 1% of ₹45K) — this is the fee actually deducted in code.
  8. NOTE: ₹550 (1% of the ₹55K total) is recorded at funding as the headline
     take-rate figure, but only the ₹450 balance-leg fee is collected today.

Y1 GOAL: no credit risk, pure escrow, capital-light (Convoy died on credit
risk). ⚠️ NOT YET TRUE IN CODE — see the money-model caveat below.

── Money model: goal vs. current implementation ─────────────────────────────
The target is a true escrow hold: the broker's ₹55K is captured and *held*
before the load goes live, and the driver is paid out of that held balance, so
TYRE never fronts money. This module does not do that yet:
  • fund_escrow() creates a Razorpay Route *linked account* but never captures
    or holds the broker's funds — nothing is actually escrowed at this step.
  • release_advance()/release_balance() pay the driver via RazorpayX *Payouts*
    from TYRE's own account — TYRE fronts the cash. Until broker-funds capture
    and hold exist, the ₹10K advance is TYRE float/credit exposure, i.e. exactly
    the risk the "no credit risk" line claims to avoid.
Treat "no credit risk / pure escrow" as the goal, not today's behaviour;
closing this (real order capture + settlement hold, or Route transfers instead
of Payouts) is a hard blocker before any real money moves.

── Phase 0 fix ──────────────────────────────────────────────────────────────
Before Phase 0 every method here had a `# Stub for now` comment above a block that
fabricated a fake `acc_…`/`trf_…` ID and returned `success=True`. No money ever moved.

This version:
  - Calls the real `razorpay` Python SDK (sandbox/test mode by default — see
    `TYRE_RAZORPAY_KEY_ID`/`TYRE_RAZORPAY_KEY_SECRET` in `.env.example`) instead of fabricating IDs.
  - Puts an idempotency key on every money-moving call, so a retried request after a
    timeout can't double-fund or double-pay (`docs/ARCHITECTURE.md` §6.3 / Phase 2 gap,
    closed early because it's free once real Razorpay calls exist).
  - Persists every funding/advance/balance/refund event to Postgres via the BFF
    (`UpiEscrowAccount` + `UpiEscrowTransaction`) instead of returning numbers that vanish
    when the process exits — see `app/clients/bff_client.py`.
  - Sends real WhatsApp notifications (falling back to SMS) instead of writing a message
    string and discarding it.
  - If Razorpay credentials are absent, falls back to the rule-based path *and labels it
    SIMULATED* in the response — the old code returned `success=True` indistinguishably
    from a real transaction, which is exactly the dishonesty this phase exists to remove.
"""
from __future__ import annotations

import time
import uuid
from dataclasses import dataclass

from app.ai.whatsapp.graph_client import send_with_sms_fallback
from app.clients import bff_client
from app.clients.bff_client import _get as _bff_get
from app.config import settings

# PMF target: advance released within 60 seconds of load acceptance
ADVANCE_RELEASE_TARGET_MS = 60_000

# TYRE take rate
TAKE_RATE_PERCENT = 1.0  # 1% of total escrow

# Default advance percentage (configurable per load)
DEFAULT_ADVANCE_PERCENT = 18.0  # ~18% of load value (₹10K on ₹55K)


def _razorpay_configured() -> bool:
    return bool(settings.razorpay_key_id and settings.razorpay_key_secret)


def _razorpay_client():
    """Lazy import — keeps `razorpay` an optional dependency for envs that only
    run the rule-based fallback (e.g. unit tests, local dev without sandbox keys)."""
    import razorpay  # razorpay-python SDK
    return razorpay.Client(auth=(settings.razorpay_key_id, settings.razorpay_key_secret))


def _idempotency_key(*parts: str) -> str:
    """Deterministic idempotency key from stable inputs — same inputs always produce the
    same key, so a network-timeout retry of the *same* logical operation is deduplicated
    by Razorpay server-side instead of creating a second transfer."""
    import hashlib
    raw = "|".join(parts)
    return hashlib.sha256(raw.encode()).hexdigest()[:40]


@dataclass
class EscrowFundingRequest:
    broker_id: str
    load_id: str
    load_amount_inr: float
    advance_amount_inr: float  # typically ₹10K
    driver_upi_id: str | None = None  # set on load acceptance


@dataclass
class EscrowFundingResult:
    success: bool
    razorpay_account_id: str
    total_funded_inr: float
    advance_amount_inr: float
    balance_amount_inr: float
    tyre_fee_inr: float
    status: str  # FUNDED | FAILED
    funding_latency_ms: int
    simulated: bool = False  # True when Razorpay isn't configured — rule-based fallback used
    error: str | None = None


@dataclass
class AdvanceReleaseRequest:
    escrow_account_id: str
    driver_phone: str
    driver_upi_id: str
    load_id: str
    advance_amount_inr: float


@dataclass
class AdvanceReleaseResult:
    success: bool
    razorpay_transfer_id: str
    upi_transaction_ref: str
    amount_released_inr: float
    release_latency_ms: int  # TARGET: <60,000
    driver_notified: bool
    simulated: bool = False
    error: str | None = None


@dataclass
class BalanceReleaseRequest:
    escrow_account_id: str
    driver_phone: str
    driver_upi_id: str
    trip_id: str
    load_id: str
    balance_amount_inr: float
    trigger: str  # GPS_POD | CONSIGNEE_CONFIRM | MANUAL
    trigger_ref: str  # consignee_confirmation_id or gps_ping_id


@dataclass
class BalanceReleaseResult:
    success: bool
    razorpay_transfer_id: str
    upi_transaction_ref: str
    amount_released_inr: float
    tyre_fee_inr: float
    release_latency_ms: int
    driver_notified: bool
    broker_notified: bool
    simulated: bool = False
    error: str | None = None


class UpiEscrowService:
    """
    UPI escrow via Razorpay Route.

    Y1: UPI only (no Pix, M-Pesa, Stripe — Y2+ when expanding to those countries).
    Y1: India only (single region).
    Y1: 1% take rate on every load.
    Y1: 60-second advance release target (PMF signal).
    """

    def __init__(self):
        self._razorpay_key_id = settings.razorpay_key_id
        self._razorpay_key_secret = settings.razorpay_key_secret
        self._razorpay_route_account_id = settings.razorpay_route_account_id

    async def fund_escrow(self, request: EscrowFundingRequest) -> EscrowFundingResult:
        """
        Broker funds escrow BEFORE load appears on marketplace.
        No escrow funding = no load visibility. Eliminates fake loads.
        """
        t0 = time.monotonic()
        total = request.load_amount_inr + request.advance_amount_inr
        tyre_fee = total * (TAKE_RATE_PERCENT / 100)
        idem_key = _idempotency_key("fund", request.broker_id, request.load_id, str(total))

        try:
            if _razorpay_configured():
                client = _razorpay_client()
                # Real Razorpay Route linked-account creation. In sandbox mode this hits
                # Razorpay's test environment and returns a real (test) account id.
                account = client.account.create({
                    "email": f"broker+{request.broker_id}@tyre.app",
                    "type": "route",
                    "reference_id": idem_key,
                    "legal_business_name": f"TYRE Broker {request.broker_id}",
                    "business_type": "individual",
                    "contact_name": request.broker_id,
                })
                razorpay_account_id = account["id"]
                simulated = False
            else:
                # No sandbox credentials configured — explicit simulated path, not a hidden one.
                razorpay_account_id = f"acc_SIMULATED_{uuid.uuid4().hex[:12]}_{request.broker_id[:6]}"
                simulated = True

            result = EscrowFundingResult(
                success=True,
                razorpay_account_id=razorpay_account_id,
                total_funded_inr=total,
                advance_amount_inr=request.advance_amount_inr,
                balance_amount_inr=request.load_amount_inr,
                tyre_fee_inr=tyre_fee,
                status="FUNDED",
                funding_latency_ms=int((time.monotonic() - t0) * 1000),
                simulated=simulated,
            )

            await bff_client.persist_escrow_event({
                "event": "FUNDED",
                "broker_id": request.broker_id,
                "load_id": request.load_id,
                "razorpay_account_id": razorpay_account_id,
                "total_funded_inr": total,
                "advance_amount_inr": request.advance_amount_inr,
                "balance_amount_inr": request.load_amount_inr,
                "tyre_fee_inr": tyre_fee,
                "idempotency_key": idem_key,
                "simulated": simulated,
            })

            return result
        except Exception as e:
            return EscrowFundingResult(
                success=False,
                razorpay_account_id="",
                total_funded_inr=0,
                advance_amount_inr=0,
                balance_amount_inr=0,
                tyre_fee_inr=0,
                status="FAILED",
                funding_latency_ms=int((time.monotonic() - t0) * 1000),
                error=str(e),
            )

    async def release_advance(self, request: AdvanceReleaseRequest) -> AdvanceReleaseResult:
        """
        Release ₹10K advance to driver UPI within 60 seconds of load acceptance.
        THIS IS THE WEDGE. PMF signal: latency <60s.
        """
        t0 = time.monotonic()
        idem_key = _idempotency_key("advance", request.escrow_account_id, request.load_id)

        try:
            if _razorpay_configured():
                client = _razorpay_client()
                payout = client.payout.create({
                    "account_number": self._razorpay_route_account_id,
                    "fund_account": {
                        "account_type": "vpa",
                        "vpa": {"address": request.driver_upi_id},
                    },
                    "amount": int(request.advance_amount_inr * 100),  # paise
                    "currency": "INR",
                    "mode": "UPI",
                    "purpose": "payout",
                    "queue_if_low_balance": True,
                    "reference_id": idem_key,
                    "narration": f"TYRE advance {request.load_id}",
                }, idempotency_key=idem_key)
                razorpay_transfer_id = payout["id"]
                # AI-C10 fix: do not fabricate UTR when Razorpay returns utr=None (normal
                # for async UPI). Store razorpay_transfer_id; a reconciliation worker polls
                # Razorpay for the real UTR once the payout settles.
                upi_ref = payout.get("utr") or ""
                simulated = False
            else:
                razorpay_transfer_id = f"trf_SIMULATED_{idem_key[:16]}"
                # AI-C10: simulated path has no real UTR from Razorpay, but we
                # generate a deterministic `upi_SIMULATED_<idem>` ref so the
                # idempotency contract is testable and downstream code (driver
                # WhatsApp confirmation, broker Telegram ack) has a non-empty
                # ref to display. A reconciliation worker would replace this
                # with the real UTR once the payout settles in production.
                upi_ref = f"upi_SIMULATED_{idem_key[:16]}"
                simulated = True

            latency_ms = int((time.monotonic() - t0) * 1000)

            notified = await self._notify_driver_advance(
                request.driver_phone, request.advance_amount_inr, upi_ref, simulated,
            )

            self._log_latency("advance_release", latency_ms)

            await bff_client.persist_escrow_event({
                "event": "ADVANCE_RELEASED",
                "escrow_account_id": request.escrow_account_id,
                "load_id": request.load_id,
                "driver_phone": request.driver_phone,
                "razorpay_transfer_id": razorpay_transfer_id,
                "upi_transaction_ref": upi_ref,
                "amount_released_inr": request.advance_amount_inr,
                "release_latency_ms": latency_ms,
                "idempotency_key": idem_key,
                "simulated": simulated,
            })

            return AdvanceReleaseResult(
                success=True,
                razorpay_transfer_id=razorpay_transfer_id,
                upi_transaction_ref=upi_ref,
                amount_released_inr=request.advance_amount_inr,
                release_latency_ms=latency_ms,
                driver_notified=notified,
                simulated=simulated,
            )
        except Exception as e:
            return AdvanceReleaseResult(
                success=False,
                razorpay_transfer_id="",
                upi_transaction_ref="",
                amount_released_inr=0,
                release_latency_ms=int((time.monotonic() - t0) * 1000),
                driver_notified=False,
                error=str(e),
            )

    async def release_balance(self, request: BalanceReleaseRequest) -> BalanceReleaseResult:
        """
        Release balance to driver after GPS-verified POD + consignee confirmation.
        TYRE takes 1% fee here.
        """
        t0 = time.monotonic()
        tyre_fee = request.balance_amount_inr * (TAKE_RATE_PERCENT / 100)
        net_to_driver = request.balance_amount_inr - tyre_fee
        idem_key = _idempotency_key("balance", request.escrow_account_id, request.trip_id)

        try:
            if _razorpay_configured():
                client = _razorpay_client()
                payout = client.payout.create({
                    "account_number": self._razorpay_route_account_id,
                    "fund_account": {
                        "account_type": "vpa",
                        "vpa": {"address": request.driver_upi_id},
                    },
                    "amount": int(net_to_driver * 100),
                    "currency": "INR",
                    "mode": "UPI",
                    "purpose": "payout",
                    "queue_if_low_balance": True,
                    "reference_id": idem_key,
                    "narration": f"TYRE balance {request.load_id}",
                }, idempotency_key=idem_key)
                razorpay_transfer_id = payout["id"]
                # AI-C10 fix: do not fabricate UTR when Razorpay returns utr=None (normal
                # for async UPI). Store razorpay_transfer_id; a reconciliation worker polls
                # Razorpay for the real UTR once the payout settles.
                upi_ref = payout.get("utr") or ""
                simulated = False
            else:
                razorpay_transfer_id = f"trf_SIMULATED_{idem_key[:16]}"
                # AI-C10: simulated path has no real UTR from Razorpay, but we
                # generate a deterministic `upi_SIMULATED_<idem>` ref so the
                # idempotency contract is testable and downstream code (driver
                # WhatsApp confirmation, broker Telegram ack) has a non-empty
                # ref to display. A reconciliation worker would replace this
                # with the real UTR once the payout settles in production.
                upi_ref = f"upi_SIMULATED_{idem_key[:16]}"
                simulated = True

            latency_ms = int((time.monotonic() - t0) * 1000)

            driver_notified = await self._notify_driver_balance(
                request.driver_phone, net_to_driver, upi_ref, simulated
            )
            broker_notified = await self._notify_broker_completed(
                request.escrow_account_id, request.balance_amount_inr, tyre_fee, simulated
            )

            await bff_client.persist_escrow_event({
                "event": "BALANCE_RELEASED",
                "escrow_account_id": request.escrow_account_id,
                "load_id": request.load_id,
                "trip_id": request.trip_id,
                "driver_phone": request.driver_phone,
                "razorpay_transfer_id": razorpay_transfer_id,
                "upi_transaction_ref": upi_ref,
                "amount_released_inr": net_to_driver,
                "tyre_fee_inr": tyre_fee,
                "release_latency_ms": latency_ms,
                "trigger": request.trigger,
                "trigger_ref": request.trigger_ref,
                "idempotency_key": idem_key,
                "simulated": simulated,
            })

            return BalanceReleaseResult(
                success=True,
                razorpay_transfer_id=razorpay_transfer_id,
                upi_transaction_ref=upi_ref,
                amount_released_inr=net_to_driver,
                tyre_fee_inr=tyre_fee,
                release_latency_ms=latency_ms,
                driver_notified=driver_notified,
                broker_notified=broker_notified,
                simulated=simulated,
            )
        except Exception as e:
            return BalanceReleaseResult(
                success=False,
                razorpay_transfer_id="",
                upi_transaction_ref="",
                amount_released_inr=0,
                tyre_fee_inr=0,
                release_latency_ms=int((time.monotonic() - t0) * 1000),
                driver_notified=False,
                broker_notified=False,
                error=str(e),
            )

    async def refund_to_broker(
        self,
        escrow_account_id: str,
        refund_amount_inr: float,
        reason: str,
        broker_upi_id: str = "",
    ) -> dict:
        """Refund escrow to broker if load cancelled — real Razorpay payout back to the
        broker's UPI when configured, persisted via the BFF either way.

        Audit C3 fix: the previous implementation posted a `payout.create` with **no
        destination `fund_account`** — a request Razorpay can never fulfil (a payout
        must name where the money goes). It "succeeded" only because the API call's
        error was swallowed upstream. Now the broker's VPA is an explicit input, the
        payout mirrors the advance/balance destination pattern, and a missing
        destination fails loudly instead of pretending a refund happened.
        """
        idem_key = _idempotency_key("refund", escrow_account_id, reason)
        simulated = not _razorpay_configured()
        if not simulated:
            if not broker_upi_id:
                # Refuse to fabricate a refund: without a destination VPA the payout
                # cannot succeed, and persisting REFUNDED anyway would mark money as
                # returned that never moved.
                return {
                    "success": False,
                    "escrow_account_id": escrow_account_id,
                    "error": "broker_upi_id required for a real refund payout (no destination fund_account)",
                }
            try:
                client = _razorpay_client()
                client.payout.create({
                    "account_number": self._razorpay_route_account_id,
                    "fund_account": {
                        "account_type": "vpa",
                        "vpa": {"address": broker_upi_id},
                    },
                    "amount": int(refund_amount_inr * 100),
                    "currency": "INR",
                    "mode": "UPI",
                    "purpose": "refund",
                    "queue_if_low_balance": True,
                    "reference_id": idem_key,
                    "narration": f"TYRE refund {escrow_account_id[:20]}",
                }, idempotency_key=idem_key)
            except Exception as e:
                return {"success": False, "escrow_account_id": escrow_account_id, "error": str(e)}

        await bff_client.persist_escrow_event({
            "event": "REFUNDED",
            "escrow_account_id": escrow_account_id,
            "refund_amount_inr": refund_amount_inr,
            "reason": reason,
            "idempotency_key": idem_key,
            "simulated": simulated,
        })
        return {
            "success": True,
            "escrow_account_id": escrow_account_id,
            "refund_amount_inr": refund_amount_inr,
            "reason": reason,
            "status": "REFUNDED",
            "simulated": simulated,
        }

    async def get_escrow_status(self, escrow_account_id: str) -> dict:
        """Get current escrow status — reads the persisted row via the BFF instead of
        returning a hardcoded ₹55,000 example every time."""
        try:
            return await _bff_get(f"/api/v1/escrow/{escrow_account_id}")
        except Exception as e:
            return {"escrow_account_id": escrow_account_id, "status": "UNKNOWN", "error": str(e)}

    async def _notify_driver_advance(
        self, driver_phone: str, amount: float, upi_ref: str, simulated: bool = False
    ) -> bool:
        """WhatsApp (falling back to SMS) notification to driver: advance released.

        When `simulated` (no Razorpay configured, no real transfer), the message must
        NOT claim money moved — texting a real driver "₹X released to your UPI" for a
        transfer that never happened is exactly the dishonesty this service exists to
        remove. We still send an honest, clearly-marked test message so callers'
        `driver_notified` wiring stays observable.
        """
        if simulated:
            message = (
                f"TYRE SANDBOX TEST — no real money has moved.\n"
                f"Simulated advance: ₹{int(amount):,} (ref {upi_ref}).\n"
                f"This is a pilot/test run, not a real UPI transfer."
            )
        else:
            message = (
                f"TYRE: ₹{int(amount):,} advance released to your UPI.\n"
                f"Ref: {upi_ref}\n"
                f"Time: {time.strftime('%H:%M:%S')}\n"
                f"Safe journey, bhai!"
            )
        result = await send_with_sms_fallback(driver_phone, message)
        return result.get("channel") in ("whatsapp", "sms")

    async def _notify_driver_balance(
        self, driver_phone: str, amount: float, upi_ref: str, simulated: bool = False
    ) -> bool:
        """WhatsApp (falling back to SMS) notification: balance released.

        Like the advance notice, a simulated run must not tell the driver real money
        arrived — see `_notify_driver_advance`.
        """
        if simulated:
            message = (
                f"TYRE SANDBOX TEST — no real money has moved.\n"
                f"Simulated balance: ₹{int(amount):,} (ref {upi_ref}).\n"
                f"This is a pilot/test run, not a real UPI transfer."
            )
        else:
            message = (
                f"TYRE: Balance ₹{int(amount):,} released to your UPI.\n"
                f"Ref: {upi_ref}\n"
                f"Trip complete. Well done, bhai!"
            )
        result = await send_with_sms_fallback(driver_phone, message)
        return result.get("channel") in ("whatsapp", "sms")

    async def _notify_broker_completed(
        self, escrow_account_id: str, balance: float, tyre_fee: float, simulated: bool = False
    ) -> bool:
        """Notify broker: trip complete, escrow settled, TYRE fee deducted."""
        # Brokers are notified via the BFF's notification path (email/dashboard), not WhatsApp.
        result = await bff_client._safe_post(
            "/api/v1/escrow/notify-broker",
            {
                "escrow_account_id": escrow_account_id,
                "balance": balance,
                "tyre_fee": tyre_fee,
                "simulated": simulated,
            },
            "notify_broker",
        )
        return result is not None

    def _log_latency(self, operation: str, latency_ms: int):
        """Log latency for PMF tracking. Target: advance_release <60s."""
        if operation == "advance_release" and latency_ms > ADVANCE_RELEASE_TARGET_MS:
            print(f"⚠️  PMF WARNING: advance_release took {latency_ms}ms (target <{ADVANCE_RELEASE_TARGET_MS}ms)")
        # Prometheus metric emission lives in app/telemetry.py, already wired into
        # app/main.py's middleware; per-transaction latency is also persisted via
        # bff_client.persist_escrow_event() above for historical/PMF-signal querying.
