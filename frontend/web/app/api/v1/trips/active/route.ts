import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireInternalService } from "@tyre/auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/trips/active?driver_phone=+91XXXXXXXXXX
 *
 * Internal-service route called by the bridge agent for driver WhatsApp events
 * that don't carry a tyre_code yet (e.g. driver_load_search before any load is
 * accepted, or driver_emergency where the driver just shouts for help).
 *
 * Returns the driver's most-recent trip that's PLANNED or IN_PROGRESS, joined
 * with the load + broker info (including broker_telegram_chat_id) so the bridge
 * can route a notification to the right broker.
 *
 * Returns 404 (treated as no-op by the bridge, not an error) when the driver
 * has no active trip — common during load search.
 */
export async function GET(req: NextRequest) {
  const denied = requireInternalService(req);
  if (denied) return denied;

  const driverPhone = req.nextUrl.searchParams.get("driver_phone");
  if (!driverPhone) {
    return NextResponse.json(
      { success: false, error: "driver_phone query param is required" },
      { status: 400 },
    );
  }

  // Find the driver, then their truck, then the active trip on that truck.
  const driver = await db.driver.findFirst({ where: { phone: driverPhone } });
  if (!driver) {
    return NextResponse.json(
      { success: false, error: "driver_not_found", message: `No driver with phone ${driverPhone}` },
      { status: 404 },
    );
  }

  // Look up the most-recent active trip for any truck owned by this driver.
  // `active` = PLANNED or IN_PROGRESS — COMPLETED / CANCELLED trips don't count.
  const trip = await db.trip.findFirst({
    where: {
      status: { in: ["PLANNED", "IN_PROGRESS"] },
      truck: { driverId: driver.id },
    },
    orderBy: { createdAt: "desc" },
    include: {
      load: { include: { broker: true } },
      truck: true,
    },
  });

  if (!trip) {
    return NextResponse.json(
      {
        success: false,
        error: "no_active_trip",
        message: "Driver has no PLANNED or IN_PROGRESS trip",
      },
      { status: 404 },
    );
  }

  return NextResponse.json({
    success: true,
    data: {
      trip_id: trip.id,
      trip_status: trip.status,
      tyre_code: trip.load.tyreCode,
      origin: trip.load.origin,
      destination: trip.load.destination,
      offered_rate: trip.load.offeredRate,
      advance_offered: trip.load.advanceOffered,
      load_status: trip.load.status,
      truck_number: trip.truck.vehicleNumber,
      driver_phone: driverPhone,
      driver_name: driver.name,
      broker_code: trip.load.broker.brokerCode,
      broker_name: trip.load.broker.name,
      broker_phone: trip.load.broker.phone,
      broker_telegram_chat_id: trip.load.broker.telegramChatId,
      started_at: trip.startTime?.toISOString() ?? null,
    },
  });
}
