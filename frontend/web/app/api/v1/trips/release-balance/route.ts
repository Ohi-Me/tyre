import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireInternalService } from "@tyre/auth";
import { aiClient } from "@tyre/ai-client";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/trips/release-balance — broker-initiated balance release.
 *
 * Internal-service route called by the bridge agent when a broker presses the
 * "Release Balance" button on Telegram (`callback_data: release:TYRE-0001`).
 *
 * Mirrors the existing `POST /api/v1/trips/[id]/complete` money-moving path
 * but driven by a broker action instead of a driver POD upload:
 *   1. Look up the trip by tyre_code (broker only knows the tyre_code).
 *   2. If the trip is already COMPLETED, return idempotent success.
 *   3. Call the ai-gateway's escrow.balance() (which talks to Razorpay) with
 *      trigger=MANUAL, trigger_ref=broker_telegram_<timestamp>.
 *   4. Update the trip to COMPLETED, set paymentStatus=BALANCE_RELEASED,
 *      mark the truck IDLE and the load DELIVERED.
 *   5. Return the amount + UPI ref so the bridge can WhatsApp the driver and
 *      ack the broker on Telegram.
 *
 * No RBAC on this route because it's internal-service only (bearer token
 * gated). The broker's identity is already verified by the broker bot's
 * /link flow before they ever see the Release Balance button.
 */
export async function POST(req: NextRequest) {
  const denied = requireInternalService(req);
  if (denied) return denied;

  try {
    const body = await req.json();
    const { tyre_code, trigger, trigger_ref } = body || {};
    if (!tyre_code || typeof tyre_code !== "string") {
      return NextResponse.json(
        { success: false, error: "tyre_code is required" },
        { status: 400 },
      );
    }

    const load = await db.load.findFirst({
      where: { tyreCode: tyre_code },
      include: { broker: true, assignedTruck: { include: { driver: true } } },
    });
    if (!load) {
      return NextResponse.json(
        { success: false, error: "load_not_found", message: `No load with code ${tyre_code}` },
        { status: 404 },
      );
    }

    const trip = await db.trip.findFirst({ where: { loadId: load.id } });
    if (!trip) {
      return NextResponse.json(
        { success: false, error: "trip_not_found", message: `No trip for load ${tyre_code}` },
        { status: 404 },
      );
    }

    // Idempotent — if the trip is already completed, return the existing state
    if (trip.status === "COMPLETED") {
      return NextResponse.json({
        success: true,
        data: {
          trip_id: trip.id,
          tyre_code: load.tyreCode,
          amount_inr: trip.balanceAmount,
          upi_ref: trip.escrowRef ?? "",
          already_released: true,
          message: "Trip was already completed; balance already released.",
        },
      });
    }

    // Call the real escrow release path via the ai-gateway
    const balanceAmount = load.aiSuggestedRate - load.advanceOffered;
    // The escrow.balance() trigger field is typed as a union
    // ("GPS_POD" | "CONSIGNEE_CONFIRM" | "MANUAL"); cast the validated string
    // to that union. Unknown values fall back to "MANUAL".
    const VALID_TRIGGERS = ["GPS_POD", "CONSIGNEE_CONFIRM", "MANUAL"] as const;
    const triggerType = typeof trigger === "string" && (VALID_TRIGGERS as readonly string[]).includes(trigger)
      ? (trigger as typeof VALID_TRIGGERS[number])
      : "MANUAL";
    const triggerRef = typeof trigger_ref === "string" ? trigger_ref : `broker_telegram_${Date.now()}`;

    let balanceReleased = false;
    let escrowSimulated = true;
    let escrowError: string | undefined;
    let upiRef: string | undefined;

    try {
      const result = await aiClient.escrow.balance({
        escrow_account_id: load.tyreCode,
        driver_phone: load.assignedTruck?.driver?.phone || "",
        driver_upi_id: (load.assignedTruck?.driver as any)?.upiId || "",
        trip_id: trip.id,
        load_id: load.tyreCode,
        balance_amount_inr: balanceAmount,
        trigger: triggerType,
        trigger_ref: triggerRef,
      });
      balanceReleased = result.success;
      escrowSimulated = result.data?.simulated ?? true;
      escrowError = result.error;
      upiRef = result.data?.upi_transaction_ref;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Internal error";
      if (process.env.NODE_ENV !== "production") console.error("[trips/release-balance]", msg);
      escrowError = "ai-gateway unreachable";
    }

    if (!balanceReleased) {
      return NextResponse.json({
        success: false,
        error: escrowError || "release_failed",
        data: { tyre_code: tyre_code, simulated: escrowSimulated },
      });
    }

    // Commit the trip/load/truck state updates atomically
    const [updatedTrip] = await db.$transaction([
      db.trip.update({
        where: { id: trip.id },
        data: {
          status: "COMPLETED",
          endTime: new Date(),
          podVerified: true,
          paymentStatus: "BALANCE_RELEASED",
          escrowRef: upiRef ?? trip.escrowRef,
        },
      }),
      db.load.update({
        where: { id: load.id },
        data: { status: "DELIVERED" },
      }),
      db.truck.update({
        where: { id: trip.truckId },
        data: {
          status: "IDLE",
          cargoLoaded: false,
          destination: null,
          currentLocation: load.destination,
        },
      }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        trip_id: updatedTrip.id,
        tyre_code: load.tyreCode,
        amount_inr: balanceAmount,
        upi_ref: upiRef ?? "",
        already_released: false,
        simulated: escrowSimulated,
        released_at: updatedTrip.endTime?.toISOString(),
        driver_phone: load.assignedTruck?.driver?.phone ?? null,
        driver_name: load.assignedTruck?.driver?.name ?? null,
        broker_telegram_chat_id: load.broker.telegramChatId,
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Internal error";
    if (process.env.NODE_ENV !== "production") console.error("[trips/release-balance]", msg);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
