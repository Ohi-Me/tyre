import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole, rateLimitOrNull } from "@tyre/auth";
import { clientIp } from "@/lib/http";

export const dynamic = "force-dynamic";


// GET /api/v1/agents — 10-agent activity monitor + recent negotiations
export async function GET(req: NextRequest) {
  const limited = await rateLimitOrNull("standard", clientIp(req));
  if (limited) return NextResponse.json(limited.body, { status: limited.status });

  const { user, response } = requireRole(req, "agents:read");
  if (response) return response;

  try {
    // Build agent activity from agentLog table
    const agentNames = ["Dispatch", "Pricing", "Fraud", "Negotiation", "Compliance", "Contract", "Payment", "Route", "Copilot", "Fleet"];
    const agentIcons: Record<string, string> = {
      Dispatch: "📡", Pricing: "💹", Fraud: "🛡", Negotiation: "🤝", Compliance: "📋",
      Contract: "📜", Payment: "💸", Route: "🗺", Copilot: "🎙", Fleet: "🚚",
    };
    const agentDescriptions: Record<string, string> = {
      Dispatch: "Vector-search load matching via Qdrant",
      Pricing: "RAG on historical lane rates + fuel/toll",
      Fraud: "GST verification + payment history scoring",
      Negotiation: "Game-theory counter-offers in 7 languages",
      Compliance: "E-way bill + CMVR + state permit automation",
      Contract: "Digital contract generation + e-sign",
      Payment: "UPI escrow release on GPS-verified POD",
      Route: "Optimal path with toll costs + traffic",
      Copilot: "Real-time driver voice assistance",
      Fleet: "Multi-truck optimization + backhaul pairing",
    };

    const allLogs = await db.agentLog.findMany({ orderBy: { createdAt: "desc" }, take: 500 });
    const agents = agentNames.map((name) => {
      const logs = allLogs.filter((l: any) => l.agentName === name);
      const eventsProcessed = logs.length;
      const successful = logs.filter((l: any) => l.success).length;
      const avgLatency = logs.length
        ? Math.round(logs.reduce((s: any, l: any) => s + l.latencyMs, 0) / logs.length)
        : 0;
      const successRate = eventsProcessed ? successful / eventsProcessed : 0;
      const recent = logs[0];
      const lastEvent = recent
        ? `${recent.eventType} on ${JSON.parse(recent.payload).loadId || "—"} (${recent.latencyMs}ms)`
        : "No events yet";
      // Determine status based on real activity
      let status: "active" | "processing" | "idle" | "error" = "idle";
      if (recent) {
        const ageMin = (Date.now() - recent.createdAt.getTime()) / 60000;
        if (ageMin < 60) status = name === "Negotiation" ? "processing" : "active";
      }
      return {
        name,
        status,
        icon: agentIcons[name],
        description: agentDescriptions[name],
        events_processed: eventsProcessed, // Real count, no random fallback
        avg_latency_ms: avgLatency, // Real avg, no random fallback
        success_rate: successRate, // Real rate, no random fallback
        last_event: lastEvent,
      };
    });

    const recentNegotiations = await db.negotiation.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
      include: { load: { include: { broker: true } } },
    });

    return NextResponse.json({
      success: true,
      data: {
        agents,
        recent_negotiations: recentNegotiations.map((n: any) => ({
          id: n.id,
          load_id: n.load.tyreCode,
          driver_phone: n.driverPhone,
          broker_offer: n.brokerOffer,
          counter_offer: n.counterOffer,
          final_rate: n.finalRate,
          decision: n.decision,
          rounds: n.rounds,
          message_hindi: n.messageHindi,
          timestamp: n.createdAt.toISOString(),
        })),
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Internal error";
    if (process.env.NODE_ENV !== "production") console.error("[agents]", msg);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
