import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole, rateLimitOrNull } from "@tyre/auth";
import { clientIp } from "@/lib/http";
import { documentStatus } from "../route";

export const dynamic = "force-dynamic";

const DOC_TYPES = ["INSURANCE", "RC", "PERMIT", "FITNESS", "POLLUTION", "LICENSE", "OTHER"] as const;

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

const UpdateDocumentSchema = z.object({
  type: z.enum(DOC_TYPES).optional(),
  doc_number: z.string().max(80).nullish(),
  issuer: z.string().max(120).nullish(),
  file_url: z.string().max(500).nullish(),
  issue_date: z.coerce.date().nullish(),
  expiry_date: z.coerce.date().nullish(),
  notes: z.string().max(600).optional(),
});

// PATCH /api/v1/documents/[id] — update (org-scoped, fleet_manager/operator/admin).
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const limited = await rateLimitOrNull("standard", clientIp(req));
  if (limited) return NextResponse.json(limited.body, { status: limited.status });
  const { user, response } = requireRole(req, "documents:manage");
  if (response) return response;

  try {
    const { id } = await ctx.params;
    const existing = await db.document.findFirst({ where: { id, deletedAt: null } });
    if (!existing || existing.orgId !== user!.orgId) {
      return NextResponse.json({ success: false, error: "Document not found" }, { status: 404 });
    }
    const parsed = UpdateDocumentSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message || "Invalid input" },
        { status: 400 },
      );
    }
    const p = parsed.data;
    const updated = await db.document.update({
      where: { id },
      data: {
        ...(p.type !== undefined && { type: p.type }),
        ...(p.doc_number !== undefined && { docNumber: p.doc_number }),
        ...(p.issuer !== undefined && { issuer: p.issuer }),
        ...(p.file_url !== undefined && { fileUrl: p.file_url }),
        ...(p.issue_date !== undefined && { issueDate: p.issue_date }),
        ...(p.expiry_date !== undefined && { expiryDate: p.expiry_date }),
        ...(p.notes !== undefined && { notes: p.notes }),
      },
    });
    return NextResponse.json({ success: true, data: serialize(updated) });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Internal error";
    if (process.env.NODE_ENV !== "production") console.error("[documents:update]", msg);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}

// DELETE /api/v1/documents/[id] — soft delete (org-scoped).
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const limited = await rateLimitOrNull("standard", clientIp(req));
  if (limited) return NextResponse.json(limited.body, { status: limited.status });
  const { user, response } = requireRole(req, "documents:manage");
  if (response) return response;

  try {
    const { id } = await ctx.params;
    const existing = await db.document.findFirst({ where: { id, deletedAt: null } });
    if (!existing || existing.orgId !== user!.orgId) {
      return NextResponse.json({ success: false, error: "Document not found" }, { status: 404 });
    }
    await db.document.update({ where: { id }, data: { deletedAt: new Date() } });
    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Internal error";
    if (process.env.NODE_ENV !== "production") console.error("[documents:delete]", msg);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
