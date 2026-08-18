import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { rateLimitOrNull } from "@tyre/auth";
import { clientIp } from "@/lib/http";
import { capture } from "@/lib/analytics";
import { actorId, requireActor, serializeListing, internalError } from "@/lib/freight/server";

export const dynamic = "force-dynamic";

const VEHICLE_TYPES = ["Open", "Container", "Tipper", "Tanker", "Refrigerated", "Trailer"] as const;

const UpdateListingSchema = z.object({
  owner_name: z.string().min(2).max(80).optional(),
  phone: z.string().regex(/^(\+91)?[6-9]\d{9}$/, "Enter a valid Indian mobile number").optional(),
  photo_url: z.string().max(500).nullish(),
  vehicle_number: z
    .string()
    .min(6)
    .max(14)
    .transform((s) => s.toUpperCase().replace(/\s+/g, ""))
    .optional(),
  vehicle_type: z.enum(VEHICLE_TYPES).optional(),
  capacity_tons: z.number().min(0.5).max(60).optional(),
  origin: z.string().min(2).max(80).optional(),
  destination: z.string().max(80).nullish(),
  rate_per_km: z.number().min(1).max(1000).nullish(),
  expected_rate: z.number().min(100).max(10_000_000).nullish(),
  description: z.string().max(600).optional(),
  status: z.enum(["ACTIVE", "PAUSED"]).optional(),
});

async function findOwnedListing(id: string, actor: string) {
  const listing = await db.freightListing.findFirst({ where: { id, deletedAt: null } });
  if (!listing) return { listing: null, error: NextResponse.json({ success: false, error: "Listing not found" }, { status: 404 }) };
  if (listing.ownerId !== actor) {
    return { listing: null, error: NextResponse.json({ success: false, error: "You can only modify your own listing" }, { status: 403 }) };
  }
  return { listing, error: null };
}

// GET /api/v1/freight/[id] — public detail incl. booking counts
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const actor = actorId(req);
    const listing = await db.freightListing.findFirst({
      where: { id, deletedAt: null },
      include: { bookings: true },
    });
    if (!listing) {
      return NextResponse.json({ success: false, error: "Listing not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: serializeListing(listing, actor) });
  } catch (e) {
    return internalError("freight:get", e);
  }
}

// PATCH /api/v1/freight/[id] — owner-only edit
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const limited = await rateLimitOrNull("standard", clientIp(req));
  if (limited) return NextResponse.json(limited.body, { status: limited.status });
  const { actor, response } = requireActor(req);
  if (response) return response;

  try {
    const { id } = await ctx.params;
    const { listing, error } = await findOwnedListing(id, actor!);
    if (error) return error;

    const body = await req.json();
    const parsed = UpdateListingSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message || "Invalid input" },
        { status: 400 },
      );
    }
    const p = parsed.data;

    const updated = await db.freightListing.update({
      where: { id: listing!.id },
      data: {
        ...(p.owner_name !== undefined && { ownerName: p.owner_name }),
        ...(p.phone !== undefined && { phone: p.phone }),
        ...(p.photo_url !== undefined && { photoUrl: p.photo_url }),
        ...(p.vehicle_number !== undefined && { vehicleNumber: p.vehicle_number }),
        ...(p.vehicle_type !== undefined && { vehicleType: p.vehicle_type }),
        ...(p.capacity_tons !== undefined && { capacityTons: p.capacity_tons }),
        ...(p.origin !== undefined && { origin: p.origin }),
        ...(p.destination !== undefined && { destination: p.destination }),
        ...(p.rate_per_km !== undefined && { ratePerKm: p.rate_per_km }),
        ...(p.expected_rate !== undefined && { expectedRate: p.expected_rate }),
        ...(p.description !== undefined && { description: p.description }),
        ...(p.status !== undefined && { status: p.status }),
      },
    });

    void capture(actor!, "freight_listing_updated", { listing_id: updated.id });
    return NextResponse.json({ success: true, data: serializeListing(updated, actor) });
  } catch (e) {
    return internalError("freight:update", e);
  }
}

// DELETE /api/v1/freight/[id] — owner-only soft delete.
// Any PENDING bookings are auto-rejected; ACCEPTED bookings block deletion
// (cancel them first so the ₹49 refund path runs).
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const limited = await rateLimitOrNull("standard", clientIp(req));
  if (limited) return NextResponse.json(limited.body, { status: limited.status });
  const { actor, response } = requireActor(req);
  if (response) return response;

  try {
    const { id } = await ctx.params;
    const { listing, error } = await findOwnedListing(id, actor!);
    if (error) return error;

    const acceptedCount = await db.freightBooking.count({
      where: { listingId: listing!.id, status: "ACCEPTED" },
    });
    if (acceptedCount > 0) {
      return NextResponse.json(
        { success: false, error: "This listing has an accepted booking. Cancel it before removing the listing." },
        { status: 409 },
      );
    }

    await db.$transaction([
      db.freightBooking.updateMany({
        where: { listingId: listing!.id, status: "PENDING" },
        data: { status: "REJECTED" },
      }),
      db.freightListing.update({
        where: { id: listing!.id },
        data: { deletedAt: new Date() },
      }),
    ]);

    void capture(actor!, "freight_listing_removed", { listing_id: listing!.id });
    return NextResponse.json({ success: true });
  } catch (e) {
    return internalError("freight:delete", e);
  }
}
