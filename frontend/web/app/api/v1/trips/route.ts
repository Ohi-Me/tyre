import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole, rateLimitOrNull } from "@tyre/auth";
import { clientIp } from "@/lib/http";

export const dynamic = "force-dynamic";

const CreateTripSchema = z.object({
  load_id: z.string().min(1).max(64),
  truck_id: z.string().min(1).max(64),
});


function serializeTrip(t: any) {
  return {
    id: t.id,
    load_id: t.loadId,
    load_code: t.load?.tyreCode,
    origin: t.load?.origin,
    destination: t.load?.destination,
    truck_id: t.truckId,
    truck_number: t.truck?.vehicleNumber,
    driver_name: t.truck?.driver?.name,
    driver_phone: t.truck?.driver?.phone,
    start_time: t.startTime?.toISOString() || null,
    end_time: t.endTime?.toISOString() || null,
    status: t.status,
    pod_verified: t.podVerified,
    payment_released: t.paymentStatus === "RELEASED",
    rate: t.load?.aiSuggestedRate || 0,
    advance: t.load?.advanceOffered || 0,
    balance: (t.load?.aiSuggestedRate || 0) - (t.load?.advanceOffered || 0),
    created_at: t.createdAt.toISOString(),
  };
}

// GET /api/v1/trips — list all trips
export async function GET(req: NextRequest) {
  const limited = await rateLimitOrNull("standard", clientIp(req));
  if (limited) return NextResponse.json(limited.body, { status: limited.status });

  try {
    const url = new URL(req.url);
    const status = url.searchParams.get("status");
    const where: any = {};
    if (status) where.status = status;

    const trips = await db.trip.findMany({
      where,
      include: { load: { include: { broker: true } }, truck: { include: { driver: true } } },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ success: true, data: trips.map(serializeTrip) });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Internal error";
    if (process.env.NODE_ENV !== "production") console.error("[trips]", msg);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}

// POST /api/v1/trips — manually create a trip (usually created via /loads/assign)
export async function POST(req: NextRequest) {
  const limited = await rateLimitOrNull("standard", clientIp(req));
  if (limited) return NextResponse.json(limited.body, { status: limited.status });

  const { response } = requireRole(req, "trips:create");
  if (response) return response;

  try {
    const parsed = CreateTripSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message || "load_id and truck_id required" },
        { status: 400 },
      );
    }
    const { load_id, truck_id } = parsed.data;
    // Trip.orgId is required and has no default — derive it from the load.
    const load = await db.load.findUnique({ where: { id: load_id } });
    if (!load) {
      return NextResponse.json({ success: false, error: "Load not found" }, { status: 404 });
    }
    const trip = await db.trip.create({
      data: { orgId: load.orgId, loadId: load_id, truckId: truck_id, status: "PLANNED" },
      include: { load: { include: { broker: true } }, truck: { include: { driver: true } } },
    });
    return NextResponse.json({ success: true, data: serializeTrip(trip) }, { status: 201 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Internal error";
    if (process.env.NODE_ENV !== "production") console.error("[trips]", msg);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
