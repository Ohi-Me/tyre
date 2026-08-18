import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireInternalService } from "@tyre/auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/escrow/[id] — Phase 0 fix.
 *
 * `docs/ARCHITECTURE.md` §8: `get_escrow_status()` used to return a hardcoded example
 * (`total_funded_inr: 55000`) for every account id. This reads the real persisted row —
 * `id` may be either the Postgres cuid or the Razorpay account id, matching how callers
 * reference an escrow account at different points in the flow.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = requireInternalService(req);
  if (denied) return denied;

  try {
    const { id } = await params;
    const account =
      (await db.upiEscrowAccount.findUnique({ where: { id } }).catch(() => null)) ??
      (await db.upiEscrowAccount.findUnique({ where: { razorpayAccountId: id } }).catch(() => null));

    if (!account) {
      return NextResponse.json({ escrow_account_id: id, status: "NOT_FOUND" }, { status: 404 });
    }

    return NextResponse.json({
      escrow_account_id: account.id,
      razorpay_account_id: account.razorpayAccountId,
      status: account.status,
      total_funded_inr: account.totalFunded,
      advance_released_inr: account.advanceReleased,
      balance_pending_inr: account.totalFunded - account.advanceReleased - account.balanceReleased,
      balance_released_inr: account.balanceReleased,
      tyre_fee_inr: account.tyreFee,
      refund_to_broker_inr: account.refundToBroker,
      advance_release_latency_ms: account.advanceReleaseLatencyMs,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Internal error";
    if (process.env.NODE_ENV !== "production") console.error("[escrow/[id]]", msg);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
