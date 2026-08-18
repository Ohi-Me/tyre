import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireInternalService } from "@tyre/auth";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/drivers/update-location — update a driver's current GPS coords.
 *
 * Internal-service route called by:
 *   - The WhatsApp driver bot when a driver shares a WhatsApp location pin
 *     (TODO: wire this in the voice pipeline — the WhatsApp webhook handler
 *     needs to extract the lat/lng from the inbound message and call this).
 *   - A periodic job that promotes the latest GpsPing of an active trip to
 *     the driver's currentLat/Lng when the trip ends (TODO: Week 4 cron).
 *   - The voice onboarding pipeline when a driver says "Main Patna mein hoon"
 *     and the pipeline geocodes "Patna" to lat/lng (TODO: Week 4 geocode).
 *
 * Until those callers are wired, the dashboard's driver edit page can call
 * this directly. Drivers without GPS coords are invisible to the nearby
 * broadcast query — the broadcast just won't reach them.
 *
 * Idempotent: calling it again with the same coords is a no-op. Calling it
 * with new coords overwrites the old ones.
 *
 * Body:
 *   { driver_phone: "+91...", lat: 25.5941, lng: 85.1376, location_label?: "Patna" }
 *
 * `driver_phone` is the lookup key (drivers don't know their internal cuid).
 * `location_label` is optional — if provided, also updates the human-readable
 * `currentLocation` string (e.g. "Patna, Bihar") for dashboard display.
 */
export async function POST(req: NextRequest) {
  const denied = requireInternalService(req);
  if (denied) return denied;

  try {
    const body = await req.json();
    const { driver_phone, lat, lng, location_label } = body || {};

    if (!driver_phone || typeof driver_phone !== "string") {
      return NextResponse.json(
        { success: false, error: "driver_phone is required" },
        { status: 400 },
      );
    }
    if (typeof lat !== "number" || typeof lng !== "number") {
      return NextResponse.json(
        { success: false, error: "lat and lng must be numbers" },
        { status: 400 },
      );
    }
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return NextResponse.json(
        { success: false, error: "lat/lng out of valid range" },
        { status: 400 },
      );
    }

    // Find the driver by phone (drivers don't know their cuid)
    const driver = await db.driver.findFirst({ where: { phone: driver_phone } });
    if (!driver) {
      return NextResponse.json(
        { success: false, error: "driver_not_found", message: `No driver with phone ${driver_phone}` },
        { status: 404 },
      );
    }

    // Update GPS coords + optional location label
    const updated = await db.driver.update({
      where: { id: driver.id },
      data: {
        currentLat: lat,
        currentLng: lng,
        ...(typeof location_label === "string" && location_label.length <= 200
          ? { currentLocation: location_label }
          : {}),
      },
      select: {
        id: true,
        name: true,
        phone: true,
        currentLat: true,
        currentLng: true,
        currentLocation: true,
        status: true,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        id: updated.id,
        driver_phone: updated.phone,
        driver_name: updated.name,
        current_lat: updated.currentLat,
        current_lng: updated.currentLng,
        current_location: updated.currentLocation,
        status: updated.status,
        updated_at: new Date().toISOString(),
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Internal error";
    if (process.env.NODE_ENV !== "production") console.error("[drivers/update-location]", msg);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
