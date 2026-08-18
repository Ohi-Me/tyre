import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole, rateLimitOrNull } from "@tyre/auth";
import { clientIp } from "@/lib/http";

export const dynamic = "force-dynamic";

// RFP-2: real input validation. Previously the route used `Number(body.x) || default`,
// which silently swallowed malformed input into defaults. This schema coerces valid
// values, applies the same defaults, and rejects genuinely invalid types with a 400.
const RfpSchema = z.object({
  company: z.string().min(1).max(200).default("Unknown Shipper"),
  lanes: z.coerce.number().int().min(1).max(10_000).default(1),
  monthly_volume_tons: z.coerce.number().min(1).max(10_000_000).default(100),
  truck_types: z.array(z.string().min(1).max(60)).min(1).max(20).default(["HXL (32ft)"]),
  expected_rate_per_km: z.coerce.number().min(1).max(100_000).default(30),
  contract_duration_months: z.coerce.number().int().min(1).max(120).default(12),
});


// GET /api/v1/shippers/rfp — list all RFPs
export async function GET(req: NextRequest) {
  const limited = await rateLimitOrNull("standard", clientIp(req));
  if (limited) return NextResponse.json(limited.body, { status: limited.status });

  try {
    const rfps = await db.shipperRFP.findMany({ orderBy: { submittedAt: "desc" } });
    return NextResponse.json({
      success: true,
      data: rfps.map((r: any) => ({
        ...r,
        truck_types: JSON.parse(r.truckTypes),
      })),
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Internal error";
    if (process.env.NODE_ENV !== "production") console.error("[shippers/rfp]", msg);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}

// POST /api/v1/shippers/rfp — submit new RFP
export async function POST(req: NextRequest) {
  const limited = await rateLimitOrNull("standard", clientIp(req));
  if (limited) return NextResponse.json(limited.body, { status: limited.status });

  const { user, response } = requireRole(req, "rfp:create");
  if (response) return response;
  const orgId = user!.orgId;

  try {
    const raw = await req.json().catch(() => ({}));
    const parsed = RfpSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message || "Invalid input" },
        { status: 400 },
      );
    }
    const body = parsed.data;
    // Race-safe RFP code via the tyre_rfp_seq sequence (created in the
    // add_load_sequence migration for exactly this route, but never wired up).
    let rfpCode: string;
    try {
      const seqResult = await db.$queryRaw<[{ nextval: bigint }]>`
        SELECT nextval('tyre_rfp_seq')::bigint AS nextval
      `;
      rfpCode = `RFP-2026-${String(Number(seqResult[0].nextval)).padStart(3, "0")}`;
    } catch {
      const { customAlphabet } = await import("nanoid");
      const nano = customAlphabet("0123456789", 5);
      rfpCode = `RFP-2026-${nano()}`;
    }

    const rfp = await db.shipperRFP.create({
      data: {
        orgId,
        rfpCode,
        company: body.company,
        lanes: body.lanes,
        monthlyVolumeTons: body.monthly_volume_tons,
        truckTypes: JSON.stringify(body.truck_types),
        expectedRatePerKm: body.expected_rate_per_km,
        contractDurationMonths: body.contract_duration_months,
        status: "SUBMITTED",
      },
    });

    return NextResponse.json({
      success: true,
      data: { ...rfp, truck_types: JSON.parse(rfp.truckTypes) },
    }, { status: 201 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Internal error";
    if (process.env.NODE_ENV !== "production") console.error("[shippers/rfp]", msg);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
