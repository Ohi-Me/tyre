import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole, rateLimitOrNull } from "@tyre/auth";
import { clientIp } from "@/lib/http";

export const dynamic = "force-dynamic";


// POST /api/v1/trips/[id]/start — driver starts the trip
// Sets trip status to IN_PROGRESS, start_time to now, truck status to IN_TRANSIT
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const limited = await rateLimitOrNull("standard", clientIp(req));
  if (limited) return NextResponse.json(limited.body, { status: limited.status });

  // "trips:self" — drivers start their own trips; operators/admins can too via "trips:*".
  const { response } = requireRole(req, "trips:self");
  if (response) return response;

  try {
    const { id } = await params;
    const trip = await db.trip.findUnique({
      where: { id },
      include: { truck: true, load: true },
    });
    if (!trip) return NextResponse.json({ success: false, error: "Trip not found" }, { status: 404 });
    if (trip.status === "IN_PROGRESS") {
      return NextResponse.json({ success: false, error: "Trip already in progress" }, { status: 400 });
    }

    const [updatedTrip, ,] = await db.$transaction([
      db.trip.update({
        where: { id },
        data: { status: "IN_PROGRESS", startTime: new Date() },
        include: { load: { include: { broker: true } }, truck: { include: { driver: true } } },
      }),
      db.load.update({
        where: { id: trip.loadId },
        data: { status: "IN_TRANSIT" },
      }),
      db.truck.update({
        where: { id: trip.truckId },
        data: { status: "IN_TRANSIT", cargoLoaded: true, destination: trip.load.destination },
      }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        trip_id: updatedTrip.id,
        status: updatedTrip.status,
        start_time: updatedTrip.startTime?.toISOString(),
        truck_status: "IN_TRANSIT",
        load_status: "IN_TRANSIT",
        message: "Trip started. UPI advance released to driver.",
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Internal error";
    if (process.env.NODE_ENV !== "production") console.error("[trips/[id]/start]", msg);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
