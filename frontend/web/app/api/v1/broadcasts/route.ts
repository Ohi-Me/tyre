import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireInternalService } from "@tyre/auth";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/broadcasts — persist one BroadcastLog row.
 *
 * Internal-service route called by the broadcast service after every blast
 * (including 0-driver blasts, so the broker sees "0 found" in their history).
 *
 * The row is the audit trail required by the marketplace anti-spam rules:
 *   - per-load: ≤3 broadcasts in 10 min (enforced by /broadcast-allowed)
 *   - per-driver: ≤5 broadcasts/hour (enforced by /drivers/nearby)
 *
 * Returns the row id so the broadcast service can include it in BroadcastResult.
 */
export async function POST(req: NextRequest) {
  const denied = requireInternalService(req);
  if (denied) return denied;

  try {
    const body = await req.json();
    const {
      tyre_code,
      broker_code,
      origin_lat,
      origin_lng,
      origin_label,
      radius_km,
      truck_type_filter,
      drivers_found,
      drivers_notified,
      drivers_failed,
      outcomes,
      initiated_by,
    } = body || {};

    if (!tyre_code || !broker_code || typeof origin_lat !== "number" || typeof origin_lng !== "number") {
      return NextResponse.json(
        {
          success: false,
          error: "tyre_code, broker_code, origin_lat, origin_lng are required",
        },
        { status: 400 },
      );
    }

    const row = await db.broadcastLog.create({
      data: {
        tyreCode: tyre_code,
        brokerCode: broker_code,
        originLat: origin_lat,
        originLng: origin_lng,
        originLabel: typeof origin_label === "string" ? origin_label : "",
        radiusKm: typeof radius_km === "number" ? radius_km : 50,
        truckTypeFilter: truck_type_filter || null,
        driversFound: drivers_found || 0,
        driversNotified: drivers_notified || 0,
        driversFailed: drivers_failed || 0,
        outcomes: typeof outcomes === "string" ? outcomes : "[]",
        initiatedBy: initiated_by || "broker_telegram",
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        id: row.id,
        tyre_code: row.tyreCode,
        broker_code: row.brokerCode,
        drivers_found: row.driversFound,
        drivers_notified: row.driversNotified,
        drivers_failed: row.driversFailed,
        created_at: row.createdAt.toISOString(),
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Internal error";
    if (process.env.NODE_ENV !== "production") console.error("[broadcasts]", msg);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
