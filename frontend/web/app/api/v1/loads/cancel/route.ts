import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireInternalService } from "@tyre/auth";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/loads/cancel — cancel a load by tyre_code.
 *
 * Internal-service route called by the bridge agent when a broker presses the
 * Cancel button on Telegram (`callback_data: cancel:TYRE-0001`). The bridge
 * passes the tyre_code + reason; this route:
 *   1. Looks up the load by tyre_code.
 *   2. Returns 409 if the load is already DELIVERED or CANCELLED (can't cancel
 *      a finished load).
 *   3. Sets the Load status to CANCELLED.
 *   4. If a truck was assigned, frees the truck back to IDLE and cancels the
 *      trip (status=CANCELLED) so it doesn't show as active.
 *   5. Returns the cancelled load + the driver's phone (so the bridge can
 *      WhatsApp them about the cancellation).
 *
 * Money held in escrow is NOT released here — that's the escrow refund flow,
 * which is a separate route (POST /api/v1/escrow/refund, Y2). For Y1 we just
 * flag the load as cancelled; the broker can manually trigger a refund from
 * the dashboard if money was already funded.
 */
export async function POST(req: NextRequest) {
  const denied = requireInternalService(req);
  if (denied) return denied;

  try {
    const body = await req.json();
    const { tyre_code, reason } = body || {};
    if (!tyre_code || typeof tyre_code !== "string") {
      return NextResponse.json(
        { success: false, error: "tyre_code is required" },
        { status: 400 },
      );
    }
    const cancelReason = typeof reason === "string" && reason.length <= 200
      ? reason
      : "cancelled by broker";

    const load = await db.load.findFirst({
      where: { tyreCode: tyre_code },
      include: { assignedTruck: { include: { driver: true } }, broker: true },
    });
    if (!load) {
      return NextResponse.json(
        { success: false, error: "load_not_found", message: `No load with code ${tyre_code}` },
        { status: 404 },
      );
    }

    // 409 — can't cancel a finished load
    if (load.status === "DELIVERED") {
      return NextResponse.json(
        {
          success: false,
          error: "already_delivered",
          message: "Cannot cancel a delivered load. Use the dispute flow instead.",
        },
        { status: 409 },
      );
    }
    if (load.status === "CANCELLED") {
      // Idempotent — return success with the existing state
      return NextResponse.json({
        success: true,
        data: {
          tyre_code: load.tyreCode,
          status: "CANCELLED",
          driver_phone: load.assignedTruck?.driver?.phone ?? null,
          message: "Load was already cancelled.",
        },
      });
    }

    // Cancel the load + free the truck + cancel the trip in ONE transaction.
    // Previously these were three separate awaits despite the "one transaction"
    // comment: a crash after the load update left a CANCELLED load with a still-
    // assigned/BUSY truck and a live trip. Now all writes commit atomically.
    let driverPhone: string | null = null;
    let cancelledTripId: string | null = null;

    // Read the associated trip up front so the transaction contains only writes.
    const trip = load.assignedTruckId
      ? await db.trip.findFirst({ where: { loadId: load.id } })
      : null;
    const shouldCancelTrip =
      !!trip && trip.status !== "COMPLETED" && trip.status !== "CANCELLED";

    const writes: any[] = [
      db.load.update({ where: { id: load.id }, data: { status: "CANCELLED" } }),
    ];
    if (load.assignedTruckId) {
      writes.push(
        db.truck.update({
          where: { id: load.assignedTruckId },
          data: { status: "IDLE", cargoLoaded: false, destination: null },
        }),
      );
      driverPhone = load.assignedTruck?.driver?.phone ?? null;
    }
    if (shouldCancelTrip) {
      writes.push(
        db.trip.update({ where: { id: trip!.id }, data: { status: "CANCELLED" } }),
      );
      cancelledTripId = trip!.id;
    }

    const [updatedLoad] = await db.$transaction(writes);

    return NextResponse.json({
      success: true,
      data: {
        tyre_code: updatedLoad.tyreCode,
        status: "CANCELLED",
        driver_phone: driverPhone,
        cancelled_trip_id: cancelledTripId,
        reason: cancelReason,
        cancelled_at: new Date().toISOString(),
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Internal error";
    if (process.env.NODE_ENV !== "production") console.error("[loads/cancel]", msg);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
