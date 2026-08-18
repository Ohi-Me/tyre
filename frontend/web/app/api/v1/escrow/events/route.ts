import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireInternalService, recordAudit } from "@tyre/auth";
import { clientIp } from "@/lib/http";
import { z } from "zod";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/escrow/events — Phase 0 fix + BE-C4/BE-C5/BE-C6/BE-C8 audit fixes.
 *
 * BE-C4 fix: every event is validated with a Zod schema before processing.
 * BE-C5 fix: multi-write operations (account update + transaction log) are
 *   wrapped in db.$transaction() so partial failures don't leave the ledger
 *   in an inconsistent state.
 * BE-C6 fix: every event type now checks for an existing transaction with the
 *   same idempotency key before inserting (previously only ADVANCE_RELEASED
 *   was idempotent — a retried BALANCE_RELEASED would double-release balance).
 * BE-C8 fix: recordAudit is called for every escrow event.
 */

// ── Zod schemas (BE-C4) ─────────────────────────────────────────────────────

const FundedSchema = z.object({
  event: z.literal("FUNDED"),
  broker_id: z.string().min(1),
  load_id: z.string().min(1),
  razorpay_account_id: z.string().min(1),
  total_funded_inr: z.number().positive(),
  advance_amount_inr: z.number().nonnegative(),
  balance_amount_inr: z.number().nonnegative(),
  tyre_fee_inr: z.number().nonnegative(),
  idempotency_key: z.string().min(1),
});

const AdvanceReleasedSchema = z.object({
  event: z.literal("ADVANCE_RELEASED"),
  escrow_account_id: z.string().min(1),
  load_id: z.string().min(1),
  driver_phone: z.string().min(1),
  razorpay_transfer_id: z.string().optional(),
  upi_transaction_ref: z.string().optional(),
  amount_released_inr: z.number().positive(),
  release_latency_ms: z.number().nonnegative().optional(),
  idempotency_key: z.string().min(1),
});

const BalanceReleasedSchema = z.object({
  event: z.literal("BALANCE_RELEASED"),
  escrow_account_id: z.string().min(1),
  load_id: z.string().min(1),
  trip_id: z.string().min(1),
  driver_phone: z.string().min(1),
  razorpay_transfer_id: z.string().optional(),
  upi_transaction_ref: z.string().optional(),
  amount_released_inr: z.number().positive(),
  tyre_fee_inr: z.number().nonnegative().optional(),
  trigger: z.string().optional(),
  trigger_ref: z.string().optional(),
  idempotency_key: z.string().min(1),
});

const RefundedSchema = z.object({
  event: z.literal("REFUNDED"),
  escrow_account_id: z.string().min(1),
  refund_amount_inr: z.number().positive(),
  reason: z.string().optional(),
  idempotency_key: z.string().min(1),
});

const EventSchema = z.discriminatedUnion("event", [
  FundedSchema,
  AdvanceReleasedSchema,
  BalanceReleasedSchema,
  RefundedSchema,
]);

function jsonOk(data: Record<string, unknown>): NextResponse {
  return NextResponse.json({ success: true, data });
}

function jsonError(error: string, status: number): NextResponse {
  return NextResponse.json({ success: false, error }, { status });
}

/**
 * BE-C6 fix: check idempotency. Audit H3 hardening: dedup keys off the
 * `referenceId` (= the ai-gateway's idempotency key, also sent to Razorpay as
 * `reference_id`) rather than `upiTransactionRef`. The old ref-based check had a
 * gap: when Razorpay returned a UTR synchronously the first insert stored
 * `upiTransactionRef = <UTR>`, and a retry of the same event (whose ref falls
 * back to the idempotency form) matched nothing → double insert. The legacy
 * lookup is kept as a fallback for rows created before `reference_id` existed.
 */
async function findExistingTx(referenceId: string, legacyRef: string) {
  return (
    (await db.upiEscrowTransaction.findFirst({ where: { referenceId } })) ??
    db.upiEscrowTransaction.findUnique({ where: { upiTransactionRef: legacyRef } })
  );
}

function idempotencyRef(event: string, key: string): string {
  return `${event.toLowerCase()}_${key}`;
}

export async function POST(req: NextRequest) {
  const denied = requireInternalService(req);
  if (denied) return denied;

  let parsed;
  try {
    const body = await req.json();
    parsed = EventSchema.safeParse(body);
  } catch {
    return jsonError("Invalid JSON body", 400);
  }
  if (!parsed.success) {
    return jsonError(`Schema validation failed: ${parsed.error.message}`, 400);
  }
  const evt = parsed.data;
  const ip = clientIp(req);

  try {
    if (evt.event === "FUNDED") {
      const ref = idempotencyRef("FUNDED", evt.idempotency_key);
      const existing = await findExistingTx(evt.idempotency_key, ref);
      if (existing) return jsonOk({ escrow_account_id: existing.escrowAccountId, deduped: true });

      const account = await db.$transaction(async (tx: any) => {
        const acc = await tx.upiEscrowAccount.upsert({
          where: { razorpayAccountId: evt.razorpay_account_id },
          create: {
            brokerId: evt.broker_id,
            loadId: evt.load_id,
            razorpayAccountId: evt.razorpay_account_id,
            totalFunded: evt.total_funded_inr,
            tyreFee: evt.tyre_fee_inr,
            status: "FUNDED",
            fundedAt: new Date(),
          },
          update: {
            totalFunded: evt.total_funded_inr,
            tyreFee: evt.tyre_fee_inr,
            status: "FUNDED",
            fundedAt: new Date(),
          },
        });
        await tx.upiEscrowTransaction.create({
          data: {
            escrowAccountId: acc.id,
            transactionType: "FUNDING",
            amount: evt.total_funded_inr,
            status: "SUCCESS",
            triggerType: "LOAD_ACCEPT",
            triggerRef: evt.load_id,
            upiTransactionRef: ref,
            referenceId: evt.idempotency_key,
          },
        });
        return acc;
      });

      await recordAudit({ userId: null, action: "escrow.event.FUNDED", entityType: "UpiEscrowAccount", entityId: account.id, ipAddress: ip, metadata: { load_id: evt.load_id, amount: evt.total_funded_inr } }).catch(() => {});
      return jsonOk({ escrow_account_id: account.id });
    }

    if (evt.event === "ADVANCE_RELEASED") {
      const ref = evt.upi_transaction_ref || idempotencyRef("ADVANCE_RELEASED", evt.idempotency_key);
      const existing = await findExistingTx(evt.idempotency_key, ref);
      if (existing) return jsonOk({ escrow_account_id: existing.escrowAccountId, deduped: true });

      const account = await db.$transaction(async (tx: any) => {
        let acc;
        try {
          acc = await tx.upiEscrowAccount.update({
            where: { id: evt.escrow_account_id },
            data: {
              driverPhone: evt.driver_phone,
              advanceReleased: evt.amount_released_inr,
              status: "ADVANCE_RELEASED",
              advanceReleasedAt: new Date(),
              advanceReleaseLatencyMs: evt.release_latency_ms ?? null,
            },
          });
        } catch {
          acc = await tx.upiEscrowAccount.update({
            where: { razorpayAccountId: evt.escrow_account_id },
            data: {
              driverPhone: evt.driver_phone,
              advanceReleased: evt.amount_released_inr,
              status: "ADVANCE_RELEASED",
              advanceReleasedAt: new Date(),
              advanceReleaseLatencyMs: evt.release_latency_ms ?? null,
            },
          });
        }
        await tx.upiEscrowTransaction.create({
          data: {
            escrowAccountId: acc.id,
            transactionType: "ADVANCE_RELEASE",
            amount: evt.amount_released_inr,
            upiId: evt.driver_phone,
            upiTransactionRef: ref,
            referenceId: evt.idempotency_key,
            razorpayTransferId: evt.razorpay_transfer_id || null,
            status: "SUCCESS",
            triggerType: "LOAD_ACCEPT",
            triggerRef: evt.load_id,
          },
        });
        return acc;
      });

      await recordAudit({ userId: null, action: "escrow.event.ADVANCE_RELEASED", entityType: "UpiEscrowAccount", entityId: account.id, ipAddress: ip, metadata: { load_id: evt.load_id, amount: evt.amount_released_inr } }).catch(() => {});
      return jsonOk({ escrow_account_id: account.id });
    }

    if (evt.event === "BALANCE_RELEASED") {
      const ref = evt.upi_transaction_ref || idempotencyRef("BALANCE_RELEASED", evt.idempotency_key);
      const existing = await findExistingTx(evt.idempotency_key, ref);
      if (existing) return jsonOk({ escrow_account_id: existing.escrowAccountId, deduped: true });

      const account = await db.$transaction(async (tx: any) => {
        let acc;
        try {
          acc = await tx.upiEscrowAccount.update({
            where: { id: evt.escrow_account_id },
            data: {
              tripId: evt.trip_id,
              balanceReleased: evt.amount_released_inr,
              tyreFee: evt.tyre_fee_inr ?? 0,
              status: "COMPLETED",
              completedAt: new Date(),
            },
          });
        } catch {
          acc = await tx.upiEscrowAccount.update({
            where: { razorpayAccountId: evt.escrow_account_id },
            data: {
              tripId: evt.trip_id,
              balanceReleased: evt.amount_released_inr,
              tyreFee: evt.tyre_fee_inr ?? 0,
              status: "COMPLETED",
              completedAt: new Date(),
            },
          });
        }
        await tx.upiEscrowTransaction.create({
          data: {
            escrowAccountId: acc.id,
            transactionType: "BALANCE_RELEASE",
            amount: evt.amount_released_inr,
            upiId: evt.driver_phone,
            upiTransactionRef: ref,
            referenceId: evt.idempotency_key,
            razorpayTransferId: evt.razorpay_transfer_id || null,
            status: "SUCCESS",
            triggerType: evt.trigger as any || "MANUAL",
            triggerRef: evt.trigger_ref || evt.trip_id,
          },
        });
        return acc;
      });

      await recordAudit({ userId: null, action: "escrow.event.BALANCE_RELEASED", entityType: "UpiEscrowAccount", entityId: account.id, ipAddress: ip, metadata: { trip_id: evt.trip_id, amount: evt.amount_released_inr } }).catch(() => {});
      return jsonOk({ escrow_account_id: account.id });
    }

    if (evt.event === "REFUNDED") {
      const ref = idempotencyRef("REFUNDED", evt.idempotency_key);
      const existing = await findExistingTx(evt.idempotency_key, ref);
      if (existing) return jsonOk({ escrow_account_id: existing.escrowAccountId, deduped: true });

      const account = await db.$transaction(async (tx: any) => {
        let acc;
        try {
          acc = await tx.upiEscrowAccount.update({
            where: { id: evt.escrow_account_id },
            data: { refundToBroker: evt.refund_amount_inr, status: "REFUNDED" },
          });
        } catch {
          acc = await tx.upiEscrowAccount.update({
            where: { razorpayAccountId: evt.escrow_account_id },
            data: { refundToBroker: evt.refund_amount_inr, status: "REFUNDED" },
          });
        }
        await tx.upiEscrowTransaction.create({
          data: {
            escrowAccountId: acc.id,
            transactionType: "REFUND",
            amount: evt.refund_amount_inr,
            status: "SUCCESS",
            triggerType: "CANCELLATION",
            triggerRef: evt.reason || null,
            upiTransactionRef: ref,
            referenceId: evt.idempotency_key,
          },
        });
        return acc;
      });

      await recordAudit({ userId: null, action: "escrow.event.REFUNDED", entityType: "UpiEscrowAccount", entityId: account.id, ipAddress: ip, metadata: { amount: evt.refund_amount_inr } }).catch(() => {});
      return jsonOk({ escrow_account_id: account.id });
    }

    return jsonError("Unknown event type", 400);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Internal error";
    if (process.env.NODE_ENV !== "production") console.error("[escrow/events]", msg);
    return jsonError("Internal error", 500);
  }
}

