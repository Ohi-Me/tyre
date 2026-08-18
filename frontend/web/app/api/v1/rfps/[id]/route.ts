import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole, rateLimitOrNull } from "@tyre/auth";
import { clientIp } from "@/lib/http";

export const dynamic = "force-dynamic";


// PATCH /api/v1/rfps/[id] — update RFP status (Award/Reject/Under Review)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const limited = await rateLimitOrNull("standard", clientIp(req));
  if (limited) return NextResponse.json(limited.body, { status: limited.status });

  // Awarding/rejecting an RFP is an operator decision, not the submitting shipper's.
  const { response } = requireRole(req, "rfp:award");
  if (response) return response;

  try {
    const { id } = await params;
    const { status } = await req.json();
    const validStatuses = ["DRAFT", "SUBMITTED", "UNDER_REVIEW", "AWARDED", "REJECTED"];
    if (!validStatuses.includes(status)) {
      return NextResponse.json({ success: false, error: "Invalid status" }, { status: 400 });
    }

    const rfp = await db.shipperRFP.update({
      where: { id },
      data: { status },
    });

    return NextResponse.json({
      success: true,
      data: {
        ...rfp,
        truck_types: JSON.parse(rfp.truckTypes),
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Internal error";
    if (process.env.NODE_ENV !== "production") console.error("[rfps/[id]]", msg);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
