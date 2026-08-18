import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole, rateLimitOrNull } from "@tyre/auth";
import { clientIp } from "@/lib/http";

export const dynamic = "force-dynamic";


// PATCH /api/v1/trucks/[id] — update truck status or location
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const limited = await rateLimitOrNull("standard", clientIp(req));
  if (limited) return NextResponse.json(limited.body, { status: limited.status });

  const { response } = requireRole(req, "trucks:manage");
  if (response) return response;

  try {
    const { id } = await params;
    const body = await req.json();

    const allowedFields = [
      "status", "currentLocation", "utilizationPct", "todaysKm",
      "destination", "cargoLoaded", "predictedBreakdownRisk",
    ];
    const data: any = {};
    for (const key of allowedFields) {
      if (body[key] !== undefined) data[key] = body[key];
    }

    const truck = await db.truck.update({ where: { id }, data, include: { driver: true } });
    return NextResponse.json({ success: true, data: truck });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Internal error";
    if (process.env.NODE_ENV !== "production") console.error("[trucks/[id]]", msg);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
