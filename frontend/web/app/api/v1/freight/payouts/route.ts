import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  FREIGHT_BOOKING_FEE_INR,
  requireActor,
  serializePayoutEntry,
  internalError,
} from "@/lib/freight/server";

export const dynamic = "force-dynamic";

// GET /api/v1/freight/payouts — the caller's payout ledger + summary.
// Balance = signed sum of ledger entries (fees are -49, refunds +49).
export async function GET(req: NextRequest) {
  const { actor, response } = requireActor(req);
  if (response) return response;

  try {
    const entries = await db.freightPayoutEntry.findMany({
      where: { ownerId: actor! },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    const feesCharged = entries.filter((e) => e.type === "BOOKING_FEE").length;
    const feesRefunded = entries.filter((e) => e.type === "BOOKING_FEE_REFUND").length;
    const balance = entries.reduce((s, e) => s + e.amount, 0);

    return NextResponse.json({
      success: true,
      data: {
        fee_inr: FREIGHT_BOOKING_FEE_INR,
        balance,
        fees_charged: feesCharged,
        fees_refunded: feesRefunded,
        net_fees_paid: (feesCharged - feesRefunded) * FREIGHT_BOOKING_FEE_INR,
        entries: entries.map(serializePayoutEntry),
      },
    });
  } catch (e) {
    return internalError("freight:payouts", e);
  }
}
