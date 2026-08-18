import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole, rateLimitOrNull } from "@tyre/auth";
import { clientIp } from "@/lib/http";

export const dynamic = "force-dynamic";

const DOC_TYPES = ["INSURANCE", "RC", "PERMIT", "FITNESS", "POLLUTION", "LICENSE", "OTHER"] as const;

// Status is derived from expiry_date at read time (never stored), so it is always
// correct without a cron job flipping rows. "Expiring" window = 30 days.
export type DocStatus = "VALID" | "EXPIRING" | "EXPIRED" | "UNKNOWN";
export function documentStatus(expiry: Date | null | undefined): DocStatus {
  if (!expiry) return "UNKNOWN";
  const days = (new Date(expiry).getTime() - Date.now()) / 86_400_000;
  if (days < 0) return "EXPIRED";
  if (days <= 30) return "EXPIRING";
  return "VALID";
}

function serialize(d: any) {
  return {
    id: d.id,
    org_id: d.orgId,
    truck_id: d.truckId,
    driver_id: d.driverId,
    type: d.type,
    doc_number: d.docNumber,
    issuer: d.issuer,
    file_url: d.fileUrl,
    issue_date: d.issueDate ? new Date(d.issueDate).toISOString() : null,
    expiry_date: d.expiryDate ? new Date(d.expiryDate).toISOString() : null,
    notes: d.notes,
    status: documentStatus(d.expiryDate),
    created_at: new Date(d.createdAt).toISOString(),
    updated_at: new Date(d.updatedAt).toISOString(),
  };
}

const CreateDocumentSchema = z
  .object({
    type: z.enum(DOC_TYPES),
    truck_id: z.string().min(1).max(64).nullish(),
    driver_id: z.string().min(1).max(64).nullish(),
    doc_number: z.string().max(80).nullish(),
    issuer: z.string().max(120).nullish(),
    file_url: z.string().max(500).nullish(),
    issue_date: z.coerce.date().nullish(),
    expiry_date: z.coerce.date().nullish(),
    notes: z.string().max(600).optional().default(""),
  })
  .refine((v) => v.truck_id || v.driver_id, {
    message: "A document must be linked to a truck_id or a driver_id",
  });

// GET /api/v1/documents — list non-deleted documents (with derived status).
//   ?truck_id= / ?driver_id= / ?type= / ?status=EXPIRING|EXPIRED|VALID
export async function GET(req: NextRequest) {
  const limited = await rateLimitOrNull("standard", clientIp(req));
  if (limited) return NextResponse.json(limited.body, { status: limited.status });

  try {
    const url = new URL(req.url);
    const truckId = url.searchParams.get("truck_id");
    const driverId = url.searchParams.get("driver_id");
    const type = url.searchParams.get("type");
    const status = url.searchParams.get("status");

    const where: any = { deletedAt: null };
    if (truckId) where.truckId = truckId;
    if (driverId) where.driverId = driverId;
    if (type) where.type = type;

    const rows = await db.document.findMany({ where, orderBy: { expiryDate: "asc" }, take: 500 });
    let data = rows.map(serialize);
    // Status is derived, so filter it in-memory after computing.
    if (status) data = data.filter((d) => d.status === status.toUpperCase());

    const summary = {
      valid: data.filter((d) => d.status === "VALID").length,
      expiring: data.filter((d) => d.status === "EXPIRING").length,
      expired: data.filter((d) => d.status === "EXPIRED").length,
      unknown: data.filter((d) => d.status === "UNKNOWN").length,
    };

    return NextResponse.json({ success: true, data, summary });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Internal error";
    if (process.env.NODE_ENV !== "production") console.error("[documents:list]", msg);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}

// POST /api/v1/documents — create (fleet_manager/operator/admin).
export async function POST(req: NextRequest) {
  const limited = await rateLimitOrNull("standard", clientIp(req));
  if (limited) return NextResponse.json(limited.body, { status: limited.status });

  const { user, response } = requireRole(req, "documents:manage");
  if (response) return response;

  try {
    const parsed = CreateDocumentSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message || "Invalid input" },
        { status: 400 },
      );
    }
    const b = parsed.data;
    const doc = await db.document.create({
      data: {
        orgId: user!.orgId,
        type: b.type,
        truckId: b.truck_id ?? null,
        driverId: b.driver_id ?? null,
        docNumber: b.doc_number ?? null,
        issuer: b.issuer ?? null,
        fileUrl: b.file_url ?? null,
        issueDate: b.issue_date ?? null,
        expiryDate: b.expiry_date ?? null,
        notes: b.notes,
      },
    });
    return NextResponse.json({ success: true, data: serialize(doc) }, { status: 201 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Internal error";
    if (process.env.NODE_ENV !== "production") console.error("[documents:create]", msg);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
