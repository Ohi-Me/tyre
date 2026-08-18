import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole, rateLimitOrNull } from "@tyre/auth";
import { clientIp } from "@/lib/http";
import { computeSettlement, financialYear, type PlaceOfSupply } from "@/lib/billing/settlement";

export const dynamic = "force-dynamic";

function serialize(inv: any) {
  return {
    id: inv.id,
    invoice_no: inv.invoiceNo,
    org_id: inv.orgId,
    trip_id: inv.tripId,
    load_code: inv.loadCode,
    place_of_supply: inv.placeOfSupply,
    currency: inv.currency,
    gross_freight: inv.grossFreight,
    gst_total: inv.gstTotal,
    commission_total: inv.commissionTotal,
    tds_total: inv.tdsTotal,
    invoice_total: inv.invoiceTotal,
    carrier_net_payout: inv.carrierNetPayout,
    status: inv.status,
    financial_year: inv.financialYear,
    issued_at: inv.issuedAt ? new Date(inv.issuedAt).toISOString() : null,
    created_at: new Date(inv.createdAt).toISOString(),
    lines: inv.lines?.map((l: any) => ({ kind: l.kind, description: l.description, amount: l.amount })),
  };
}

// GET /api/v1/invoices — org-scoped list. ?status= ?financial_year= ?limit= ?offset=
export async function GET(req: NextRequest) {
  const limited = await rateLimitOrNull("standard", clientIp(req));
  if (limited) return NextResponse.json(limited.body, { status: limited.status });
  const { user, response } = requireRole(req, "billing:manage");
  if (response) return response;

  try {
    const url = new URL(req.url);
    const status = url.searchParams.get("status");
    const fy = url.searchParams.get("financial_year");
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 20, 1), 100);
    const offset = Math.max(Number(url.searchParams.get("offset")) || 0, 0);

    const where: any = { orgId: user!.orgId };
    if (status) where.status = status;
    if (fy) where.financialYear = fy;

    const [total, rows] = await Promise.all([
      db.invoice.count({ where }),
      db.invoice.findMany({ where, include: { lines: true }, orderBy: { createdAt: "desc" }, skip: offset, take: limit }),
    ]);
    return NextResponse.json({
      success: true,
      data: rows.map(serialize),
      pagination: { total, limit, offset, has_more: offset + rows.length < total },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Internal error";
    if (process.env.NODE_ENV !== "production") console.error("[invoices:list]", msg);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}

const GenerateSchema = z.object({
  trip_id: z.string().min(1).max(64),
  place_of_supply: z.enum(["intra", "inter"]).optional(),
  gst_rate_pct: z.coerce.number().min(0).max(28).optional(),
  tds_rate_pct: z.coerce.number().min(0).max(10).optional(),
  commission_rate_pct: z.coerce.number().min(0).max(30).optional(),
});

// POST /api/v1/invoices — generate the invoice for a completed trip (idempotent per trip).
export async function POST(req: NextRequest) {
  const limited = await rateLimitOrNull("standard", clientIp(req));
  if (limited) return NextResponse.json(limited.body, { status: limited.status });
  const { user, response } = requireRole(req, "billing:manage");
  if (response) return response;

  try {
    const parsed = GenerateSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message || "Invalid input" },
        { status: 400 },
      );
    }
    const input = parsed.data;

    // Idempotent: one invoice per trip.
    const existing = await db.invoice.findUnique({ where: { tripId: input.trip_id }, include: { lines: true } });
    if (existing) return NextResponse.json({ success: true, data: serialize(existing), idempotent: true });

    const trip = await db.trip.findUnique({ where: { id: input.trip_id }, include: { load: true } });
    if (!trip) return NextResponse.json({ success: false, error: "Trip not found" }, { status: 404 });
    if (trip.orgId !== user!.orgId) {
      return NextResponse.json({ success: false, error: "Trip belongs to another org" }, { status: 403 });
    }
    if (trip.status !== "COMPLETED") {
      return NextResponse.json({ success: false, error: "Trip must be COMPLETED before invoicing" }, { status: 409 });
    }

    const grossFreight = trip.load?.aiSuggestedRate ?? trip.load?.offeredRate ?? 0;
    if (grossFreight <= 0) {
      return NextResponse.json({ success: false, error: "Trip has no billable freight amount" }, { status: 422 });
    }

    const placeOfSupply: PlaceOfSupply = input.place_of_supply ?? "inter";
    const settlement = computeSettlement({
      grossFreight,
      placeOfSupply,
      gstRatePct: input.gst_rate_pct,
      tdsRatePct: input.tds_rate_pct,
      commissionRatePct: input.commission_rate_pct,
    });

    const now = new Date();
    const fy = financialYear(now);
    // Gap-free invoice number via Postgres sequence.
    let invoiceNo: string;
    try {
      const seq = await db.$queryRaw<[{ nextval: bigint }]>`SELECT nextval('tyre_invoice_seq')::bigint AS nextval`;
      invoiceNo = `INV-${fy}-${String(Number(seq[0].nextval)).padStart(4, "0")}`;
    } catch {
      const { customAlphabet } = await import("nanoid");
      invoiceNo = `INV-${fy}-${customAlphabet("0123456789", 6)()}`;
    }

    const created = await db.$transaction(async (tx) => {
      const inv = await tx.invoice.create({
        data: {
          invoiceNo,
          orgId: user!.orgId,
          tripId: trip.id,
          loadCode: trip.load?.tyreCode ?? null,
          placeOfSupply,
          currency: "INR",
          grossFreight: settlement.freight,
          gstTotal: settlement.gst.total,
          commissionTotal: settlement.commission.total,
          tdsTotal: settlement.tds.amount,
          invoiceTotal: settlement.invoiceTotal,
          carrierNetPayout: settlement.carrierNetPayout,
          status: "ISSUED",
          financialYear: fy,
          issuedAt: now,
        },
      });
      await tx.invoiceLine.createMany({
        data: settlement.lines.map((l) => ({
          invoiceId: inv.id,
          kind: l.kind,
          description: l.description,
          amount: l.amount,
        })),
      });
      return tx.invoice.findUnique({ where: { id: inv.id }, include: { lines: true } });
    });

    return NextResponse.json({ success: true, data: serialize(created) }, { status: 201 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Internal error";
    if (process.env.NODE_ENV !== "production") console.error("[invoices:create]", msg);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
