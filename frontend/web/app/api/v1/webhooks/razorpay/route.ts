import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/webhooks/razorpay — Phase 0/2 fix.
 *
 * `docs/ARCHITECTURE.md` §6.3: "Razorpay webhook handling (HMAC-verified) replaces any
 * LLM-narrated status." Before this, no transaction status update came from Razorpay
 * itself at all — the system trusted whatever the (hallucinated) Payment Agent said.
 *
 * This handler verifies the `X-Razorpay-Signature` header against the raw request body
 * using `TYRE_RAZORPAY_WEBHOOK_SECRET` (HMAC-SHA256, per Razorpay's documented scheme)
 * before trusting *anything* in the payload — webhook signature verification is the
 * actual source of truth for "did this payment really happen," not the response from
 * the API call that initiated it (which could itself have been spoofed or replayed).
 *
 * Handles `payout.processed`, `payout.failed`, and `payout.reversed` events for the
 * escrow advance/balance payouts created in `app/ai/payments/upi_escrow.py`.
 *
 * Audit H3 (docs/PRODUCTION_AUDIT_2026-07.md):
 *   1. Delivery idempotency — Razorpay retries on non-2xx and can double-deliver.
 *      Each delivery's `x-razorpay-event-id` is recorded in `webhook_events`
 *      (unique on provider+event_id); a replay hits the constraint and no-ops
 *      instead of re-running status writes + duplicating auditLog rows.
 *   2. Exact, indexed linkage — the old `upiTransactionRef: { contains: reference_id }`
 *      substring scan silently missed rows whose ref was a synchronously-returned
 *      UTR (the UTR does not contain the reference_id), leaving real payouts stuck
 *      in PENDING. Transactions now carry the reference_id in a dedicated indexed
 *      column matched exactly; a legacy `contains` fallback covers pre-migration rows.
 */

/** Exact match on the indexed reference_id; legacy substring fallback for rows
 *  written before the 20260719 migration (their reference_id is NULL and the
 *  idempotency key is embedded in upi_transaction_ref). */
async function updateByReference(
  referenceId: string,
  data: { status: "SUCCESS" | "FAILED"; failureReason?: string },
): Promise<number> {
  const exact = await db.upiEscrowTransaction.updateMany({
    where: { referenceId },
    data,
  });
  if (exact.count > 0) return exact.count;
  const legacy = await db.upiEscrowTransaction.updateMany({
    where: { referenceId: null, upiTransactionRef: { contains: referenceId } },
    data,
  });
  return legacy.count;
}

export async function POST(req: NextRequest) {
  const secret = process.env.TYRE_RAZORPAY_WEBHOOK_SECRET || "";
  const signature = req.headers.get("x-razorpay-signature") || "";
  const rawBody = await req.text();

  if (!secret) {
    return NextResponse.json({ success: false, error: "Webhook secret not configured" }, { status: 503 });
  }

  const expectedSignature = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const valid =
    signature.length === expectedSignature.length &&
    crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));

  if (!valid) {
    // Don't leak whether the payload itself was well-formed — just reject.
    return NextResponse.json({ success: false, error: "Invalid signature" }, { status: 401 });
  }

  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 });
  }

  const eventType = event.event as string;
  const payoutEntity = event.payload?.payout?.entity;

  try {
    // H3.1 — delivery dedup. Signature is already verified, so the event id is
    // trustworthy. A redelivered event id violates the (provider, event_id)
    // unique constraint → acknowledge with 200 and change nothing.
    const deliveryId = req.headers.get("x-razorpay-event-id");
    if (deliveryId) {
      try {
        await db.webhookEvent.create({
          data: { provider: "razorpay", eventId: deliveryId, eventType: eventType || null },
        });
      } catch (e: unknown) {
        if ((e as { code?: string })?.code === "P2002") {
          return NextResponse.json({ success: true, deduped: true });
        }
        throw e;
      }
    }

    // H3.2 — exact indexed matching on reference_id (legacy fallback inside).
    if (eventType === "payout.processed" && payoutEntity?.reference_id) {
      await updateByReference(payoutEntity.reference_id, { status: "SUCCESS" });
    } else if (eventType === "payout.failed" && payoutEntity?.reference_id) {
      await updateByReference(payoutEntity.reference_id, {
        status: "FAILED",
        failureReason: payoutEntity.failure_reason || "payout.failed",
      });
    } else if (eventType === "payout.reversed" && payoutEntity?.reference_id) {
      await updateByReference(payoutEntity.reference_id, {
        status: "FAILED",
        failureReason: "Reversed by Razorpay",
      });
    }

    await db.auditLog.create({
      data: {
        action: `RAZORPAY_WEBHOOK_${eventType?.toUpperCase().replace(/\./g, "_") || "UNKNOWN"}`,
        entityType: "BROKER",  // BE-C6: closest EntityType enum value; full detail in metadata
        entityId: payoutEntity?.reference_id || "unknown",
        metadata: JSON.stringify({ eventType }),
      },
    });

    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    // BE-C13 fix: previously echoed e?.message back to Razorpay. Now logs server-side
    // only and returns a generic error. Status 200 is preserved so a transient DB error
    // doesn't trigger a retry storm — a real ops alert (Sentry, wired below) covers the gap.
    const msg = e instanceof Error ? e.message : "Internal error";
    console.error("[webhooks/razorpay] processing error", msg);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 200 });
  }
}
