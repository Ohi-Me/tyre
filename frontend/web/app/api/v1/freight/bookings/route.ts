import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireActor, serializeBooking, internalError } from "@/lib/freight/server";

export const dynamic = "force-dynamic";

// GET /api/v1/freight/bookings — bookings visible to the caller.
//   ?role=lister → bookings on listings I own (incoming requests)
//   ?role=booker → bookings I made (default: both)
export async function GET(req: NextRequest) {
  const { actor, response } = requireActor(req);
  if (response) return response;

  try {
    const role = new URL(req.url).searchParams.get("role");

    const where =
      role === "lister"
        ? { listing: { ownerId: actor! } }
        : role === "booker"
          ? { bookerId: actor! }
          : { OR: [{ bookerId: actor! }, { listing: { ownerId: actor! } }] };

    const bookings = await db.freightBooking.findMany({
      where,
      include: { listing: true },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    return NextResponse.json({
      success: true,
      data: bookings.map((b) => serializeBooking(b, actor)),
    });
  } catch (e) {
    return internalError("freight:bookings", e);
  }
}
