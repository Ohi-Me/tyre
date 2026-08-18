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

// GET /api/v1/fleet — aggregate fleet metrics + truck list + 14-day history
export async function GET(req: NextRequest) {
  const limited = await rateLimitOrNull("standard", clientIp(req));
  if (limited) return NextResponse.json(limited.body, { status: limited.status });

  const { user, response } = requireRole(req, "fleet:read");
  if (response) return response;

  try {
    const trucks = await db.truck.findMany({ include: { driver: true } });
    const total = trucks.length;
    const inTransit = trucks.filter((t: any) => t.status === "IN_TRANSIT").length;
    const idle = trucks.filter((t: any) => t.status === "IDLE").length;
    const maintenance = trucks.filter((t: any) => t.status === "MAINTENANCE").length;
    const avgUtilization = total
      ? Math.round(trucks.reduce((s: number, t: any) => s + (t.utilizationPct || 0), 0) / total)
      : 0;
    const todaysRevenue = trucks.reduce((s: number, t: any) => s + (t.todaysKm || 0) * 32, 0);
    const highRiskCount = trucks.filter((t: any) => t.predictedBreakdownRisk === "HIGH").length;

    const metricsRows = await db.fleetMetric.findMany({ orderBy: { date: "asc" } });
    const metrics = metricsRows.map((m: any) => ({
      date: m.date,
      utilization: m.utilization,
      revenue: m.revenue,
      trips: m.trips,
      empty_return_pct: m.emptyReturnPct,
    }));

    return NextResponse.json({
      success: true,
      data: {
        total_trucks: total,
        in_transit: inTransit,
        idle,
        maintenance,
        avg_utilization_pct: avgUtilization,
        todays_revenue_inr: todaysRevenue,
        high_breakdown_risk: highRiskCount,
        trucks: trucks.map(serializeTruck),
        metrics,
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Internal error";
    if (process.env.NODE_ENV !== "production") console.error("[fleet]", msg);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
