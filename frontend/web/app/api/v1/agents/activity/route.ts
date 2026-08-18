import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rateLimitOrNull, requireRole } from "@tyre/auth";
import { clientIp } from "@/lib/http";

export const dynamic = "force-dynamic";


// GET /api/v1/agents/activity — real-time stream of recent agent events.
// C1 (audit): AgentLog payloads include driverPhone + advance amounts written by
// /loads/assign, and AgentLog has no orgId to scope by, so this is gated to
// operator/admin via "admin:metrics" (the only metrics-grade permission operator
// holds; "agents:read" would restrict it to admin alone). Bearer token required.
export async function GET(req: NextRequest) {
  const limited = await rateLimitOrNull("standard", clientIp(req));
  if (limited) return NextResponse.json(limited.body, { status: limited.status });

  const { response } = requireRole(req, "admin:metrics");
  if (response) return response;

  try {
    const logs = await db.agentLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 25,
    });

    return NextResponse.json({
      success: true,
      data: logs.map((l: any) => ({
        id: l.id,
        agent_name: l.agentName,
        event_type: l.eventType,
        payload: JSON.parse(l.payload),
        latency_ms: l.latencyMs,
        success: l.success,
        timestamp: l.createdAt.toISOString(),
      })),
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Internal error";
    if (process.env.NODE_ENV !== "production") console.error("[agents/activity]", msg);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
