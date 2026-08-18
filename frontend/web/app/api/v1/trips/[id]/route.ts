import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rateLimitOrNull } from "@tyre/auth";
import { requireUser } from "@/lib/api/require-user";
import { clientIp } from "@/lib/http";

export const dynamic = "force-dynamic";


// GET /api/v1/trips/[id]
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const limited = await rateLimitOrNull("standard", clientIp(req));
  if (limited) return NextResponse.json(limited.body, { status: limited.status });

  // C1 (audit): findUnique by id alone let any caller read any org's trip (IDOR).
  // Require a valid user and scope the lookup to their org.
  const { user, response } = requireUser(req);
  if (response) return response;

  try {
    const { id } = await params;
    const trip = await db.trip.findFirst({
      where: { id, orgId: user!.orgId },
      include: { load: { include: { broker: true } }, truck: { include: { driver: true } } },
    });
    if (!trip) return NextResponse.json({ success: false, error: "Trip not found" }, { status: 404 });
    return NextResponse.json({ success: true, data: trip });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Internal error";
    if (process.env.NODE_ENV !== "production") console.error("[trips/[id]]", msg);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
