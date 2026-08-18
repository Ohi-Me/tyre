import { NextRequest, NextResponse } from "next/server";
import { rateLimitOrNull } from "@tyre/auth";
import { clientIp } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/reports — catalog of report types the platform can generate.
 * Each entry points at /api/v1/reports/[type] which computes it from live data.
 */
const CATALOG = [
  { id: "revenue", type: "Monthly Revenue Report", category: "Financial", format: "JSON", endpoint: "/api/v1/reports/revenue" },
  { id: "fleet", type: "Fleet Performance Report", category: "Operations", format: "JSON", endpoint: "/api/v1/reports/fleet" },
  { id: "drivers", type: "Driver Performance Report", category: "HR", format: "JSON", endpoint: "/api/v1/reports/drivers" },
  { id: "trips", type: "Trip Summary Report", category: "Operations", format: "JSON", endpoint: "/api/v1/reports/trips" },
] as const;

export async function GET(req: NextRequest) {
  const limited = await rateLimitOrNull("standard", clientIp(req));
  if (limited) return NextResponse.json(limited.body, { status: limited.status });

  const today = new Date().toISOString().slice(0, 10);
  return NextResponse.json({
    success: true,
    data: CATALOG.map((c) => ({ ...c, date: today })),
  });
}
