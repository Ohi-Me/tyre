import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole, rateLimitOrNull } from "@tyre/auth";
import { clientIp } from "@/lib/http";

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
    pdf_url: inv.pdfUrl,
    issued_at: inv.issuedAt ? new Date(inv.issuedAt).toISOString() : null,
    created_at: new Date(inv.createdAt).toISOString(),
    lines: inv.lines?.map((l: any) => ({ kind: l.kind, description: l.description, amount: l.amount })),
  };
}

// GET /api/v1/invoices/[id] — org-scoped invoice detail with lines.
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const limited = await rateLimitOrNull("standard", clientIp(req));
  if (limited) return NextResponse.json(limited.body, { status: limited.status });
  const { user, response } = requireRole(req, "billing:manage");
  if (response) return response;

  try {
    const { id } = await ctx.params;
    const inv = await db.invoice.findUnique({ where: { id }, include: { lines: true } });
    if (!inv || inv.orgId !== user!.orgId) {
      return NextResponse.json({ success: false, error: "Invoice not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: serialize(inv) });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Internal error";
    if (process.env.NODE_ENV !== "production") console.error("[invoices:get]", msg);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
