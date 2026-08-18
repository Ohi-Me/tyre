/**
 * Freight marketplace — server-side helpers shared by /api/v1/freight/* routes.
 *
 * Identity model: the marketplace is open (no login wall), so each browser
 * generates a stable anonymous id (nanoid, persisted in localStorage) and
 * sends it as the `x-tyre-actor` header. Listings/bookings are owned by that
 * actor id; mutations verify ownership against it. This mirrors how the rest
 * of the local app works (no NextAuth session on /api/v1/*).
 */
import { NextRequest, NextResponse } from "next/server";

/** Flat platform fee (INR) debited from the lister's payout when a booking is accepted. */
export const FREIGHT_BOOKING_FEE_INR = 49;

export function actorId(req: NextRequest): string | null {
  const v = req.headers.get("x-tyre-actor");
  if (!v || v.length < 6 || v.length > 64) return null;
  // nanoid alphabet — reject anything that couldn't be one
  if (!/^[A-Za-z0-9_-]+$/.test(v)) return null;
  return v;
}

export function requireActor(req: NextRequest): { actor: string | null; response: NextResponse | null } {
  const actor = actorId(req);
  if (!actor) {
    return {
      actor: null,
      response: NextResponse.json(
        { success: false, error: "Missing or invalid x-tyre-actor header" },
        { status: 401 },
      ),
    };
  }
  return { actor, response: null };
}

export function serializeListing(l: any, actor?: string | null) {
  return {
    id: l.id,
    code: l.code,
    owner_name: l.ownerName,
    // Contact number is public by design — booking works via direct call.
    phone: l.phone,
    photo_url: l.photoUrl,
    vehicle_number: l.vehicleNumber,
    vehicle_type: l.vehicleType,
    capacity_tons: l.capacityTons,
    origin: l.origin,
    destination: l.destination,
    rate_per_km: l.ratePerKm,
    expected_rate: l.expectedRate,
    description: l.description,
    status: l.status,
    is_mine: !!actor && l.ownerId === actor,
    bookings_count: l._count?.bookings ?? undefined,
    pending_bookings: l.bookings
      ? l.bookings.filter((b: any) => b.status === "PENDING").length
      : undefined,
    created_at: l.createdAt.toISOString(),
    updated_at: l.updatedAt.toISOString(),
  };
}

export function serializeBooking(b: any, actor?: string | null) {
  return {
    id: b.id,
    listing_id: b.listingId,
    listing: b.listing ? serializeListing(b.listing, actor) : undefined,
    booker_name: b.bookerName,
    booker_phone: b.bookerPhone,
    pickup: b.pickup,
    dropoff: b.dropoff,
    note: b.note,
    status: b.status,
    fee_charged: b.feeCharged,
    is_mine: !!actor && b.bookerId === actor,
    accepted_at: b.acceptedAt ? b.acceptedAt.toISOString() : null,
    cancelled_at: b.cancelledAt ? b.cancelledAt.toISOString() : null,
    created_at: b.createdAt.toISOString(),
  };
}

export function serializePayoutEntry(e: any) {
  return {
    id: e.id,
    type: e.type,
    amount: e.amount,
    note: e.note,
    listing_id: e.listingId,
    booking_id: e.bookingId,
    created_at: e.createdAt.toISOString(),
  };
}

export function internalError(scope: string, e: unknown): NextResponse {
  const msg = e instanceof Error ? e.message : "Internal error";
  if (process.env.NODE_ENV !== "production") console.error(`[${scope}]`, msg);
  return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
}
