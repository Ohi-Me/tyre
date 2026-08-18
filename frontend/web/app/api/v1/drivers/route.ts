import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole, rateLimitOrNull } from "@tyre/auth";
import { clientIp } from "@/lib/http";

export const dynamic = "force-dynamic";

const CreateDriverSchema = z.object({
  name: z.string().min(2).max(80),
  phone: z.string().regex(/^(\+91)?[6-9]\d{9}$/, "Enter a valid Indian mobile number"),
  preferred_lang: z.string().min(2).max(20).optional().default("hindi"),
  truck_type: z.string().max(40).nullish(),
  current_location: z.string().max(120).nullish(),
});


function serializeDriver(d: any) {
  return {
    id: d.id,
    name: d.name,
    phone: d.phone,
    preferred_lang: d.preferredLang,
    truck_type: d.truckType,
    current_location: d.currentLocation,
    status: d.status,
    rating: d.rating,
    total_trips: d.totalTrips,
    truck: d.trucks?.[0]
      ? {
          id: d.trucks[0].id,
          vehicle_number: d.trucks[0].vehicleNumber,
          truck_type: d.trucks[0].truckType,
          status: d.trucks[0].status,
        }
      : null,
  };
}

// GET /api/v1/drivers
export async function GET(req: NextRequest) {
  const limited = await rateLimitOrNull("standard", clientIp(req));
  if (limited) return NextResponse.json(limited.body, { status: limited.status });

  try {
    const drivers = await db.driver.findMany({
      include: { trucks: true },
      orderBy: { rating: "desc" },
    });
    return NextResponse.json({ success: true, data: drivers.map(serializeDriver) });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Internal error";
    if (process.env.NODE_ENV !== "production") console.error("[drivers]", msg);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}

// POST /api/v1/drivers — register a new driver
export async function POST(req: NextRequest) {
  const limited = await rateLimitOrNull("standard", clientIp(req));
  if (limited) return NextResponse.json(limited.body, { status: limited.status });

  const { response } = requireRole(req, "drivers:manage");
  if (response) return response;

  try {
    const parsed = CreateDriverSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message || "Invalid input" },
        { status: 400 },
      );
    }
    const body = parsed.data;
    const driver = await db.driver.create({
      data: {
        name: body.name,
        phone: body.phone,
        preferredLang: body.preferred_lang,
        truckType: body.truck_type ?? null,
        currentLocation: body.current_location ?? null,
      },
      include: { trucks: true },
    });
    return NextResponse.json({ success: true, data: serializeDriver(driver) }, { status: 201 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Internal error";
    if (process.env.NODE_ENV !== "production") console.error("[drivers]", msg);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
