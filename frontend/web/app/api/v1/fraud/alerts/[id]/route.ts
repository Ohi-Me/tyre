import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole, rateLimitOrNull } from "@tyre/auth";
import { clientIp } from "@/lib/http";

export const dynamic = "force-dynamic";


// PATCH /api/v1/fraud/alerts/[id] — update fraud alert status
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const limited = await rateLimitOrNull("standard", clientIp(req));
  if (limited) return NextResponse.json(limited.body, { status: limited.status });

  const { response } = requireRole(req, "fraud:resolve");
  if (response) return response;

  try {
    const { id } = await params;
    const { status } = await req.json();
    const validStatuses = ["OPEN", "INVESTIGATING", "BLOCKED", "CLEARED"];
    if (!validStatuses.includes(status)) {
      return NextResponse.json({ success: false, error: "Invalid status" }, { status: 400 });
    }

    const alert = await db.fraudAlert.update({
      where: { id },
      data: { status },
      include: { broker: true },
    });

    return NextResponse.json({
      success: true,
      data: {
        id: alert.id,
        broker_id: alert.broker.brokerCode,
        broker_name: alert.broker.name,
        risk_score: alert.riskScore,
        flags: JSON.parse(alert.flags),
        detected_at: alert.detectedAt.toISOString(),
        status: alert.status,
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Internal error";
    if (process.env.NODE_ENV !== "production") console.error("[fraud/alerts/[id]]", msg);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
