import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole, rateLimitOrNull } from "@tyre/auth";
import { clientIp } from "@/lib/http";

export const dynamic = "force-dynamic";

const REPORT_TYPES = ["revenue", "fleet", "drivers", "trips"] as const;
type ReportType = (typeof REPORT_TYPES)[number];

function dayKey(d: Date): string {
  return new Date(d).toISOString().slice(0, 10);
}

/**
 * GET /api/v1/reports/[type] — compute a real report from live data.
 *   revenue | fleet | drivers | trips
 * Replaces the fabricated dashboard "Reports" list with on-demand, real output.
 * Role-gated (fleet:metrics / reports) so only operators/fleet managers/admins run them.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ type: string }> }) {
  const limited = await rateLimitOrNull("standard", clientIp(req));
  if (limited) return NextResponse.json(limited.body, { status: limited.status });

  const { user, response } = requireRole(req, "fleet:metrics");
  if (response) return response;

  const { type } = await ctx.params;
  if (!REPORT_TYPES.includes(type as ReportType)) {
    return NextResponse.json(
      { success: false, error: `Unknown report '${type}'. Valid: ${REPORT_TYPES.join(", ")}` },
      { status: 404 },
    );
  }

  try {
    const generatedAt = new Date().toISOString();

    if (type === "revenue") {
      const trips = await db.trip.findMany({
        where: { status: { in: ["COMPLETED"] } },
        include: { load: true },
        orderBy: { createdAt: "desc" },
        take: 1000,
      });
      const byDay = new Map<string, { revenue: number; trips: number }>();
      const byRoute = new Map<string, { origin: string; destination: string; revenue: number; trips: number }>();
      let total = 0;
      for (const t of trips) {
        const rev = t.load?.aiSuggestedRate ?? 0;
        total += rev;
        const dk = dayKey(t.createdAt);
        const d = byDay.get(dk) ?? { revenue: 0, trips: 0 };
        d.revenue += rev;
        d.trips += 1;
        byDay.set(dk, d);
        if (t.load) {
          const rk = `${t.load.origin} -> ${t.load.destination}`;
          const r = byRoute.get(rk) ?? { origin: t.load.origin, destination: t.load.destination, revenue: 0, trips: 0 };
          r.revenue += rev;
          r.trips += 1;
          byRoute.set(rk, r);
        }
      }
      return NextResponse.json({
        success: true,
        data: {
          type,
          generatedAt,
          summary: { totalRevenue: total, completedTrips: trips.length, avgPerTrip: trips.length ? Math.round(total / trips.length) : 0 },
          byDay: [...byDay.entries()].map(([date, v]) => ({ date, ...v })).sort((a, b) => a.date.localeCompare(b.date)),
          topRoutes: [...byRoute.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 10),
        },
      });
    }

    if (type === "fleet") {
      const trucks = await db.truck.findMany({ where: { deletedAt: null }, include: { driver: true } });
      const rows = trucks.map((t) => ({
        vehicle_number: t.vehicleNumber,
        truck_type: t.truckType,
        status: t.status,
        driver: t.driver?.name ?? null,
        utilization_pct: t.utilizationPct,
        todays_km: t.todaysKm,
        total_km_this_month: t.totalKmThisMonth,
        fuel_efficiency_kmpl: t.fuelEfficiencyKmpl,
      }));
      const avgUtil = rows.length ? Math.round(rows.reduce((s, r) => s + r.utilization_pct, 0) / rows.length) : 0;
      return NextResponse.json({
        success: true,
        data: {
          type,
          generatedAt,
          summary: {
            totalTrucks: rows.length,
            active: rows.filter((r) => r.status !== "IDLE" && r.status !== "MAINTENANCE").length,
            avgUtilization: avgUtil,
            kmThisMonth: rows.reduce((s, r) => s + r.total_km_this_month, 0),
          },
          rows,
        },
      });
    }

    if (type === "drivers") {
      const drivers = await db.driver.findMany({ orderBy: { totalTrips: "desc" } });
      const rows = drivers.map((d) => ({
        name: d.name,
        phone: d.phone,
        status: d.status,
        total_trips: d.totalTrips,
        rating: d.rating,
        kyc_verified: d.kycVerified,
      }));
      return NextResponse.json({
        success: true,
        data: {
          type,
          generatedAt,
          summary: {
            totalDrivers: rows.length,
            kycVerified: rows.filter((r) => r.kyc_verified).length,
            avgRating: rows.length ? Number((rows.reduce((s, r) => s + r.rating, 0) / rows.length).toFixed(2)) : 0,
            totalTrips: rows.reduce((s, r) => s + r.total_trips, 0),
          },
          rows,
        },
      });
    }

    // trips
    const trips = await db.trip.findMany({ include: { load: true, truck: true }, orderBy: { createdAt: "desc" }, take: 1000 });
    const byStatus = new Map<string, number>();
    for (const t of trips) byStatus.set(t.status, (byStatus.get(t.status) ?? 0) + 1);
    return NextResponse.json({
      success: true,
      data: {
        type,
        generatedAt,
        summary: {
          total: trips.length,
          completed: byStatus.get("COMPLETED") ?? 0,
          inProgress: byStatus.get("IN_PROGRESS") ?? 0,
          planned: byStatus.get("PLANNED") ?? 0,
          cancelled: byStatus.get("CANCELLED") ?? 0,
        },
        byStatus: [...byStatus.entries()].map(([status, count]) => ({ status, count })),
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Internal error";
    if (process.env.NODE_ENV !== "production") console.error(`[reports:${type}]`, msg);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
