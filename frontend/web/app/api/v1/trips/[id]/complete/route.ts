import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole, rateLimitOrNull, recordAudit } from "@tyre/auth";
import { aiClient } from "@tyre/ai-client";
import { clientIp } from "@/lib/http";

export const dynamic = "force-dynamic";


// POST /api/v1/trips/[id]/complete — driver delivers, POD verified, balance payment released
//
// Phase 0 fix: same pattern as loads/assign — RBAC + rate limiting added, and the
// balance release now calls the real escrow service instead of just flagging
// `paymentReleased: true` on the Trip row with no corresponding money movement.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const limited = await rateLimitOrNull("standard", clientIp(req));
  if (limited) return NextResponse.json(limited.body, { status: limited.status });

  const { user, response } = requireRole(req, "trips:complete");
  if (response) return response;

  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const podVerified = body.pod_verified !== false; // default true

    const trip = await db.trip.findUnique({
      where: { id },
      include: { load: { include: { broker: true } }, truck: { include: { driver: true } } },
    });
    if (!trip) return NextResponse.json({ success: false, error: "Trip not found" }, { status: 404 });
    if (trip.status === "COMPLETED") {
      return NextResponse.json({ success: false, error: "Trip already completed" }, { status: 400 });
    }

    const balancePayment = trip.load.aiSuggestedRate - trip.load.advanceOffered;

    let balanceReleased = false;
    let escrowSimulated = true;
    let escrowError: string | undefined;

    if (podVerified) {
      try {
        const result = await aiClient.escrow.balance({
          escrow_account_id: trip.loadId, // resolved server-side by razorpayAccountId/id fallback
          driver_phone: trip.truck.driver?.phone || "",
          driver_upi_id: (trip.truck.driver as any)?.upiId || "",
          trip_id: trip.id,
          load_id: trip.load.tyreCode,
          balance_amount_inr: balancePayment,
          trigger: "GPS_POD",
          trigger_ref: trip.id,
        });
        balanceReleased = result.success;
        escrowSimulated = result.data?.simulated ?? true;
        escrowError = result.error;
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Internal error";
        if (process.env.NODE_ENV !== "production") console.error("[trips/[id]/complete]", msg);
        escrowError = "ai-gateway unreachable";
      }
    }

    const [updatedTrip] = await db.$transaction([
      db.trip.update({
        where: { id },
        data: {
          status: "COMPLETED",
          endTime: new Date(),
          podVerified,
          // Trip tracks payment via `paymentStatus` (string), not a boolean flag.
          paymentStatus: balanceReleased ? "BALANCE_RELEASED" : "PENDING",
        },
        include: { load: { include: { broker: true } }, truck: { include: { driver: true } } },
      }),
      db.load.update({
        where: { id: trip.loadId },
        data: { status: "DELIVERED" },
      }),
      db.truck.update({
        where: { id: trip.truckId },
        data: { status: "IDLE", cargoLoaded: false, destination: null, currentLocation: trip.load.destination },
      }),
    ]);

    await db.agentLog.create({
      data: {
        agentName: "Payment",
        eventType: "RELEASE",
        payload: JSON.stringify({
          tripId: id, amount: balancePayment, advance: trip.load.advanceOffered,
          balanceReleased, simulated: escrowSimulated, error: escrowError,
        }),
        latencyMs: 540,
        success: balanceReleased,
      },
    });

    // BE-C8: audit the trip-completion write (money-moving route — balance UPI
    // payout released above).
    await recordAudit({
      action: "trip.complete",
      userId: user!.sub,
      ipAddress: clientIp(req),
      entityType: "Trip",
      entityId: updatedTrip.id,
      metadata: {
        loadId: trip.loadId,
        tyreCode: trip.load.tyreCode,
        balanceReleased: balanceReleased ? balancePayment : 0,
        advanceReleased: trip.load.advanceOffered,
        escrowSimulated,
        podVerified,
      },
    }).catch((e: unknown) => {
      console.error("[audit] recordAudit failed (trip.complete)", e);
    });

    return NextResponse.json({
      success: true,
      data: {
        trip_id: updatedTrip.id,
        status: "COMPLETED",
        pod_verified: podVerified,
        payment_released: balanceReleased,
        advance_released: trip.load.advanceOffered,
        balance_released: balanceReleased ? balancePayment : 0,
        total_payout: trip.load.advanceOffered + (balanceReleased ? balancePayment : 0),
        escrow_simulated: escrowSimulated,
        escrow_error: escrowError,
        completed_at: updatedTrip.endTime?.toISOString(),
        message: balanceReleased
          ? `POD verified. ₹${balancePayment.toLocaleString("en-IN")} balance released via UPI escrow${escrowSimulated ? " (sandbox/simulated)" : ""}.`
          : podVerified
            ? `Trip completed but balance release failed (${escrowError ?? "unknown error"}). Retry from the trip dashboard.`
            : "Trip completed but POD not yet verified. Payment held.",
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Internal error";
    if (process.env.NODE_ENV !== "production") console.error("[trips/[id]/complete]", msg);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
