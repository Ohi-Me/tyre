import { NextRequest, NextResponse } from "next/server";
// Read replica (TYRE v1.1 item #9): hourly stats are analytics reads — use the replica.
import { dbRead as db } from "@/lib/db";
import { rateLimitOrNull, requireRole } from "@tyre/auth";
import { clientIp } from "@/lib/http";

export const dynamic = "force-dynamic";


// GET /api/v1/stats/hourly — REAL hourly agent activity for charts
// Returns last 24 hours of agent events grouped by hour.
// C1 (audit): reveals platform-wide agent volume/latency; gated to operator/admin
// ("admin:metrics"). AgentLog has no orgId, so this stays a cross-org metrics view.
export async function GET(req: NextRequest) {
  const limited = await rateLimitOrNull("standard", clientIp(req));
  if (limited) return NextResponse.json(limited.body, { status: limited.status });

  const { response } = requireRole(req, "admin:metrics");
  if (response) return response;

  try {
    // Get all agent logs from last 24h
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const logs = await db.agentLog.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: "asc" },
    });

    // Group by hour
    const hourlyBuckets: Record<string, {
      hour: string;
      label: string;
      events: number;
      avg_latency_ms: number;
      successful: number;
      failed: number;
    }> = {};

    // Pre-create buckets for the last 24 hours so the chart shows zeros for empty hours
    for (let i = 23; i >= 0; i--) {
      const d = new Date(Date.now() - i * 60 * 60 * 1000);
      const hourKey = d.toISOString().slice(0, 13); // YYYY-MM-DDTHH
      const label = `${d.getHours().toString().padStart(2, "0")}:00`;
      hourlyBuckets[hourKey] = {
        hour: hourKey,
        label,
        events: 0,
        avg_latency_ms: 0,
        successful: 0,
        failed: 0,
      };
    }

    // Fill buckets with real data
    const latenciesByHour: Record<string, number[]> = {};
    for (const log of logs) {
      const hourKey = log.createdAt.toISOString().slice(0, 13);
      const bucket = hourlyBuckets[hourKey];
      if (bucket) {
        bucket.events += 1;
        if (log.success) bucket.successful += 1;
        else bucket.failed += 1;
        (latenciesByHour[hourKey] ??= []).push(log.latencyMs);
      }
    }

    // Compute avg latency per hour
    for (const [hourKey, lats] of Object.entries(latenciesByHour)) {
      const bucket = hourlyBuckets[hourKey];
      if (bucket) {
        bucket.avg_latency_ms = lats.length
          ? Math.round(lats.reduce((s: any, l: any) => s + l, 0) / lats.length)
          : 0;
      }
    }

    const result = Object.values(hourlyBuckets);

    // Agent breakdown by name (real)
    const agentBreakdown: Record<string, number> = {};
    for (const log of logs) {
      agentBreakdown[log.agentName] = (agentBreakdown[log.agentName] || 0) + 1;
    }

    return NextResponse.json({
      success: true,
      data: {
        hourly: result,
        agent_breakdown: agentBreakdown,
        total_events_24h: logs.length,
        avg_latency_24h: logs.length
          ? Math.round(logs.reduce((s: number, l: any) => s + (l.latencyMs || 0), 0) / logs.length)
          : 0,
        success_rate_24h: logs.length
          ? logs.filter((l: { success: boolean }) => l.success).length / logs.length
          : 0,
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Internal error";
    if (process.env.NODE_ENV !== "production") console.error("[stats/hourly]", msg);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
