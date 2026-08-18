import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole, rateLimitOrNull } from "@tyre/auth";
import { clientIp } from "@/lib/http";

export const dynamic = "force-dynamic";


function serializeTruck(t: any) {
  return {
    id: t.id,
    vehicle_number: t.vehicleNumber,
    truck_type: t.truckType,
    driver_name: t.driver?.name || "Unassigned",
    driver_phone: t.driver?.phone || "",
    current_location: t.currentLocation,
    status: t.status,
    utilization_pct: t.utilizationPct,
    todays_km: t.todaysKm,
    total_km_this_month: t.totalKmThisMonth,
    fuel_efficiency_kmpl: t.fuelEfficiencyKmpl,
    next_maintenance_km: t.nextMaintenanceKm,
    last_maintenance_date: t.lastMaintenanceDate.toISOString().slice(0, 10),
    predicted_breakdown_risk: t.predictedBreakdownRisk,
    cargo_loaded: t.cargoLoaded,
    destination: t.destination,
  };
}

// GET /api/v1/trucks
export async function GET(req: NextRequest) {
  const limited = await rateLimitOrNull("standard", clientIp(req));
  if (limited) return NextResponse.json(limited.body, { status: limited.status });

  // Public read — consistent with GET /loads, /drivers and /trips. The
  // dashboard fetches this without a bearer token; writes below stay guarded.

  try {
    const trucks = await db.truck.findMany({
      include: { driver: true },
      orderBy: { vehicleNumber: "asc" },
    });
    return NextResponse.json({
      success: true,
      data: trucks.map(serializeTruck),
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Internal error";
    if (process.env.NODE_ENV !== "production") console.error("[trucks]", msg);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
