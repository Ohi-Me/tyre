import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { rateLimitOrNull } from "@tyre/auth";
import { clientIp } from "@/lib/http";
import { capture } from "@/lib/analytics";
import { requireActor, serializeBooking, internalError } from "@/lib/freight/server";

export const dynamic = "force-dynamic";

const BookSchema = z.object({
  booker_name: z.string().min(2).max(80),
  booker_phone: z.string().regex(/^(\+91)?[6-9]\d{9}$/, "Enter a valid Indian mobile number"),
  pickup: z.string().max(120).optional().default(""),
  dropoff: z.string().max(120).optional().default(""),
  note: z.string().max(400).optional().default(""),
});

// POST /api/v1/freight/[id]/book — request a booking on a listing.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const limited = await rateLimitOrNull("standard", clientIp(req));
  if (limited) return NextResponse.json(limited.body, { status: limited.status });
  const { actor, response } = requireActor(req);
  if (response) return response;

  try {
    const { id } = await ctx.params;
    const listing = await db.freightListing.findFirst({ where: { id, deletedAt: null } });
    if (!listing) {
      return NextResponse.json({ success: false, error: "Listing not found" }, { status: 404 });
    }
    if (listing.ownerId === actor) {
      return NextResponse.json({ success: false, error: "You cannot book your own listing" }, { status: 400 });
    }
    if (listing.status !== "ACTIVE") {
      return NextResponse.json({ success: false, error: "This vehicle is not accepting bookings right now" }, { status: 409 });
    }

    const body = await req.json();
    const parsed = BookSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message || "Invalid input" },
        { status: 400 },
      );
    }

    // One live request per booker per listing.
    const existing = await db.freightBooking.findFirst({
      where: { listingId: listing.id, bookerId: actor!, status: { in: ["PENDING", "ACCEPTED"] } },
    });
    if (existing) {
      return NextResponse.json(
        { success: false, error: "You already have an open booking on this listing" },
        { status: 409 },
      );
    }

    const booking = await db.freightBooking.create({
      data: {
        listingId: listing.id,
        bookerId: actor!,
        bookerName: parsed.data.booker_name,
        bookerPhone: parsed.data.booker_phone,
        pickup: parsed.data.pickup,
        dropoff: parsed.data.dropoff,
        note: parsed.data.note,
      },
      include: { listing: true },
    });

    void capture(actor!, "freight_booking_requested", {
      listing_id: listing.id,
      booking_id: booking.id,
    });

    return NextResponse.json({ success: true, data: serializeBooking(booking, actor) }, { status: 201 });
  } catch (e) {
    return internalError("freight:book", e);
  }
}
