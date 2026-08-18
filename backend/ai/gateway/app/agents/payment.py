"""Payment Agent — v3.2 wedge: UPI escrow only.

Removed in v3.2:
  - Stablecoin escrow (RBI blocks crypto, Africa banks won't touch it)
  - Multi-rail (M-Pesa, Pix, Stripe, bKash) — Y2+ when expanding to those countries
  - Smart contracts (insurance companies won't integrate with startup smart contracts)

Kept in v3.2 Y1:
  - UPI escrow via Razorpay Route
  - Instant ₹10K advance (released within 60 seconds of load acceptance)
  - GPS-verified balance release
  - Consignee WhatsApp confirmation trigger
  - 1% take rate on every load

── Phase 0 fix ──────────────────────────────────────────────────────────────
Before Phase 0 this agent asked an LLM to *generate JSON that looks like a transaction
happened* — including a fabricated `razorpay_transfer_id` and `upi_transaction_ref`. The
LLM has no Razorpay credentials, no DB access, no way to actually move money. The
rule-based fallback was no better (`f"acc_{int(time.time())}"` is not a Razorpay ID).

Money-moving logic must never be hallucinated by an LLM — there is no "best guess" for
whether ₹10,000 actually left an account. This agent now does zero LLM calls. It is a
thin, deterministic router onto `UpiEscrowService` (`app/ai/payments/upi_escrow.py`),
which is the only place that talks to Razorpay. If anything needs an LLM in the payment
flow in the future (e.g. dispute summarization), it must be a read-only, advisory call —
never the source of truth for whether money moved.
"""
from __future__ import annotations

import time

from app.agents.base import AgentResult, BaseAgent
from app.ai.payments.upi_escrow import (
    AdvanceReleaseRequest,
    BalanceReleaseRequest,
    EscrowFundingRequest,
    UpiEscrowService,
)


class PaymentAgent(BaseAgent):
    name = "Payment"

    def __init__(self):
        self._escrow = UpiEscrowService()

    async def run(self, input_data: dict) -> AgentResult:
        """Routes to the real escrow service based on `input_data["action"]`.

        action: "fund" | "advance" | "balance" — no other action is accepted; this agent
        does not narrate a payment state from an LLM guess.
        """
        t0 = time.monotonic()
        action = (input_data.get("action") or "advance").lower()

        try:
            if action == "fund":
                result = await self._escrow.fund_escrow(EscrowFundingRequest(
                    broker_id=input_data["broker_id"],
                    load_id=input_data["load_id"],
                    load_amount_inr=float(input_data["load_amount_inr"]),
                    advance_amount_inr=float(input_data.get("advance_amount_inr", 10000)),
                ))
                data = {
                    "status": "FUNDED" if result.success else "FAILED",
                    "amount": result.total_funded_inr,
                    "currency": "INR",
                    "razorpay_account_id": result.razorpay_account_id,
                    "advance_release_latency_ms": None,
                    "simulated": result.simulated,
                    "next_steps": ["Load appears on marketplace now that escrow is funded."],
                }
            elif action == "balance":
                result = await self._escrow.release_balance(BalanceReleaseRequest(
                    escrow_account_id=input_data["escrow_account_id"],
                    driver_phone=input_data.get("driver_phone", ""),
                    driver_upi_id=input_data.get("driver_upi_id", ""),
                    trip_id=input_data["trip_id"],
                    load_id=input_data["load_id"],
                    balance_amount_inr=float(input_data["amount"]),
                    trigger=input_data.get("trigger", "MANUAL"),
                    trigger_ref=input_data.get("trigger_ref", ""),
                ))
                data = {
                    "status": "COMPLETED" if result.success else "FAILED",
                    "amount": result.amount_released_inr,
                    "currency": "INR",
                    "razorpay_account_id": input_data.get("razorpay_account_id", ""),
                    "upi_transaction_ref": result.upi_transaction_ref,
                    "advance_release_latency_ms": None,
                    "simulated": result.simulated,
                    "next_steps": ["Trip complete." if result.success else f"Balance release failed: {result.error}"],
                }
                # Week 2 bridge: notify the linked broker on Telegram that the
                # balance landed. Driver is notified separately by
                # consignee_confirm._notify_parties (WhatsApp).
                if result.success:
                    await _fire_bridge_event({
                        "event": "payment_balance",
                        "tyre_code": input_data.get("load_id", ""),
                        "amount_inr": result.amount_released_inr,
                        "upi_ref": result.upi_transaction_ref or "",
                        "driver_phone": input_data.get("driver_phone", ""),
                    })
            else:  # "advance" — the PMF-critical path
                result = await self._escrow.release_advance(AdvanceReleaseRequest(
                    escrow_account_id=input_data.get("escrow_account_id", ""),
                    driver_phone=input_data.get("driver_phone", ""),
                    driver_upi_id=input_data.get("driver_upi_id", ""),
                    load_id=input_data.get("load_id", ""),
                    advance_amount_inr=float(input_data.get("amount", 10000)),
                ))
                data = {
                    "status": "ADVANCE_RELEASED" if result.success else "FAILED",
                    "amount": result.amount_released_inr,
                    "currency": "INR",
                    "razorpay_account_id": input_data.get("razorpay_account_id", ""),
                    "upi_transaction_ref": result.upi_transaction_ref,
                    "advance_release_latency_ms": result.release_latency_ms,
                    "simulated": result.simulated,
                    "next_steps": [
                        "Notify driver via WhatsApp: advance released" if result.success else f"Advance release failed: {result.error}",
                        "Update trip status to ASSIGNED",
                        "Wait for GPS-verified POD + consignee WhatsApp confirmation",
                    ],
                }
                # Week 2 bridge: notify the linked broker on Telegram that the
                # advance landed. Driver gets a separate WhatsApp push from the
                # load-assign flow (driver_bot.send_payment_confirmation).
                if result.success:
                    await _fire_bridge_event({
                        "event": "payment_advance",
                        "tyre_code": input_data.get("load_id", ""),
                        "amount_inr": result.amount_released_inr,
                        "upi_ref": result.upi_transaction_ref or "",
                        "driver_phone": input_data.get("driver_phone", ""),
                    })

            return AgentResult(
                success=bool(data.get("status") not in ("FAILED",)),
                data=data,
                latency_ms=int((time.monotonic() - t0) * 1000),
            )
        except KeyError as e:
            return AgentResult(
                success=False,
                data={"status": "FAILED", "error": f"missing required field: {e}"},
                latency_ms=int((time.monotonic() - t0) * 1000),
                error=f"missing required field: {e}",
            )
        except Exception as e:
            return AgentResult(
                success=False,
                data={"status": "FAILED", "error": str(e)},
                latency_ms=int((time.monotonic() - t0) * 1000),
                error=str(e),
            )


# ── Bridge agent integration (Week 2 of the WhatsApp↔Telegram bridge) ──────────
#
# Same fire-and-forget pattern as the WhatsApp driver bot: the payment agent
# notifies the bridge agent when money actually moves (advance / balance release)
# so the linked broker gets a Telegram confirmation. The bridge call is best-
# effort — a Telegram outage must never crash a money-moving flow.

async def _fire_bridge_event(payload: dict) -> None:
    """Fire-and-forget an event to the bridge agent.

    Instantiates a fresh BridgeAgent per call — agents are stateless, so this
    is cheap. If the bridge ever becomes stateful, swap this for a singleton.
    """
    try:
        from app.agents.bridge import BridgeAgent
        agent = BridgeAgent()
        await agent.run(payload)
    except Exception as e:  # noqa: BLE001 — bridge must never crash the payment flow
        import logging
        logging.getLogger("tyre.payment").warning(
            "[bridge] event %s dropped: %s", payload.get("event"), e,
        )
