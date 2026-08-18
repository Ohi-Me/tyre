import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireInternalService } from "@tyre/auth";

export const dynamic = "force-dynamic";

// POST /api/v1/escrow/notify-broker — internal callback, logs broker settlement notice.
// Brokers see this in their dashboard via AgentLog/notification feed rather than WhatsApp
// (drivers get WhatsApp/SMS; brokers are desk-based — see ARCHITECTURE.md §5.3 voice
// pipeline being driver-facing only).
export async function POST(req: NextRequest) {
  const denied = requireInternalService(req);
  if (denied) return denied;

  try {
    const { escrow_account_id, balance, tyre_fee } = await req.json();

    await db.agentLog.create({
      data: {
        agentName: "Payment",
        eventType: "BROKER_SETTLEMENT_NOTICE",
        payload: JSON.stringify({ escrowAccountId: escrow_account_id, balance, tyreFee: tyre_fee }),
        latencyMs: 0,
        success: true,
      },
    });

    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Internal error";
    if (process.env.NODE_ENV !== "production") console.error("[escrow/notify-broker]", msg);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
