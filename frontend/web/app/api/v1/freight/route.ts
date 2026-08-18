import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { rateLimitOrNull } from "@tyre/auth";
import { clientIp } from "@/lib/http";
import { capture } from "@/lib/analytics";
import { actorId, requireActor, serializeListing, internalError } from "@/lib/freight/server";

export const dynamic = "force-dynamic";

const VEHICLE_TYPES = ["Open", "Container", "Tipper", "Tanker", "Refrigerated", "Trailer"] as const;

const CreateListingSchema = z.object({
  owner_name: z.string().min(2).max(80),
  phone: z
    .string()
    .regex(/^(\+91)?[6-9]\d{9}$/, "Enter a valid Indian mobile number"),
  photo_url: z.string().max(500).nullish(),
  vehicle_number: z
    .string()
    .min(6)
    .max(14)
    .transform((s) => s.toUpperCase().replace(/\s+/g, "")),
  vehicle_type: z.enum(VEHICLE_TYPES),
  capacity_tons: z.number().min(0.5).max(60),
  origin: z.string().min(2).max(80),
  destination: z.string().max(80).nullish(),
  rate_per_km: z.number().min(1).max(1000).nullish(),
  expected_rate: z.number().min(100).max(10_000_000).nullish(),
  description: z.string().max(600).optional().default(""),
});

// GET /api/v1/freight — public, searchable listing feed.
//   ?q=          free-text over origin/destination/owner/vehicle number/code
//   ?vehicle_type=Container
//   ?mine=1      only the caller's listings (needs x-tyre-actor)
//   ?status=     defaults to non-deleted, any status
export async function GET(req: NextRequest) {
  const limited = await rateLimitOrNull("standard", clientIp(req));
  if (limited) return NextResponse.json(limited.body, { status: limited.status });

  try {
    const actor = actorId(req);
    const url = new URL(req.url);
    const q = url.searchParams.get("q")?.trim() || "";
    const vehicleType = url.searchParams.get("vehicle_type") || "";
    const mine = url.searchParams.get("mine") === "1";
    const status = url.searchParams.get("status") || "";

    // PERF-1: bounded pagination instead of an unbounded take:200.
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 50, 1), 100);
    const offset = Math.max(Number(url.searchParams.get("offset")) || 0, 0);

    if (mine && !actor) {
      return NextResponse.json({ success: true, data: [], pagination: { total: 0, limit, offset } });
    }

    const where: any = { deletedAt: null };
    if (mine) where.ownerId = actor;
    if (vehicleType && vehicleType !== "All") where.vehicleType = vehicleType;
    if (status) where.status = status;
    if (q) {
      where.OR = [
        { origin: { contains: q, mode: "insensitive" } },
        { destination: { contains: q, mode: "insensitive" } },
        { ownerName: { contains: q, mode: "insensitive" } },
        { vehicleNumber: { contains: q.replace(/\s+/g, "").toUpperCase() } },
        { code: { contains: q.toUpperCase() } },
      ];
    }

    const [total, listings] = await Promise.all([
      db.freightListing.count({ where }),
      db.freightListing.findMany({
        where,
        include: mine ? { bookings: { where: { status: "PENDING" } } } : undefined,
        orderBy: { createdAt: "desc" },
        skip: offset,
        take: limit,
      }),
    ]);

    return NextResponse.json({
      success: true,
      data: listings.map((l) => serializeListing(l, actor)),
      pagination: { total, limit, offset, has_more: offset + listings.length < total },
    });
  } catch (e) {
    return internalError("freight:list", e);
  }
}

// POST /api/v1/freight — create a listing (owned by the calling actor).
export async function POST(req: NextRequest) {
  const limited = await rateLimitOrNull("standard", clientIp(req));
  if (limited) return NextResponse.json(limited.body, { status: limited.status });

  const { actor, response } = requireActor(req);
  if (response) return response;

  try {
    const body = await req.json();
    const parsed = CreateListingSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message || "Invalid input" },
        { status: 400 },
      );
    }
    const input = parsed.data;

    // Race-safe FRT-#### code via Postgres sequence (mirrors FE-C11 fix on loads).
    // db.count()+1 raced on concurrent POSTs and collided on the UNIQUE code column.
    let code: string;
    try {
      const seqResult = await db.$queryRaw<[{ nextval: bigint }]>`
        SELECT nextval('tyre_freight_seq')::bigint AS nextval
      `;
      code = `FRT-${String(Number(seqResult[0].nextval)).padStart(4, "0")}`;
    } catch {
      const { customAlphabet } = await import("nanoid");
      const nano = customAlphabet("0123456789", 6);
      code = `FRT-${nano()}`;
    }

    const listing = await db.freightListing.create({
      data: {
        code,
        ownerId: actor!,
        ownerName: input.owner_name,
        phone: input.phone,
        photoUrl: input.photo_url || null,
        vehicleNumber: input.vehicle_number,
        vehicleType: input.vehicle_type,
        capacityTons: input.capacity_tons,
        origin: input.origin,
        destination: input.destination || null,
        ratePerKm: input.rate_per_km ?? null,
        expectedRate: input.expected_rate ?? null,
        description: input.description,
      },
    });

    void capture(actor!, "freight_listing_created", {
      listing_id: listing.id,
      vehicle_type: listing.vehicleType,
      origin: listing.origin,
    });

    return NextResponse.json({ success: true, data: serializeListing(listing, actor) }, { status: 201 });
  } catch (e) {
    return internalError("freight:create", e);
  }
}
