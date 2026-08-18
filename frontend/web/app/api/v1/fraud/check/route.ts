import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { runFraudAgent } from "@/lib/tyre/ai-service";
import { requireRole, rateLimitOrNull } from "@tyre/auth";
import { clientIp } from "@/lib/http";

export const dynamic = "force-dynamic";


// POST /api/v1/fraud/check — check broker fraud risk via AI agent
export async function POST(req: NextRequest) {
  const limited = await rateLimitOrNull("ai", clientIp(req));
  if (limited) return NextResponse.json(limited.body, { status: limited.status });

  const { response } = requireRole(req, "fraud:check");
  if (response) return response;

  try {
    const body = await req.json();
    const brokerCode = body.broker_id || body.broker_code;
    if (!brokerCode) {
      return NextResponse.json({ success: false, error: "broker_id required" }, { status: 400 });
    }

    const broker = await db.broker.findFirst({
      where: { OR: [{ brokerCode }, { id: brokerCode }] },
    });
    if (!broker) {
      return NextResponse.json({ success: false, error: "Broker not found" }, { status: 404 });
    }

    // Run AI fraud agent
    const existingAlerts = await db.fraudAlert.findMany({
      where: { brokerId: broker.id },
      orderBy: { detectedAt: "desc" },
      take: 5,
    });
    const existingFlags = existingAlerts.flatMap((a: any) => JSON.parse(a.flags) as string[]);

    const result = await runFraudAgent({
      broker_id: broker.brokerCode,
      broker_name: broker.name,
      gstin: broker.gstin || "UNKNOWN",
      verified: broker.verified,
      payment_defaults: broker.paymentDefaults,
      total_loads: broker.totalLoads,
      risk_score: broker.riskScore,
      existing_flags: existingFlags,
    });

    // Update broker risk score
    await db.broker.update({
      where: { id: broker.id },
      data: { riskScore: result.risk_score },
    });

    // Create a new fraud alert if risk is high
    let alert = null;
    if (result.recommendation === "BLOCK" || result.recommendation === "INVESTIGATE") {
      alert = await db.fraudAlert.create({
        data: {
          brokerId: broker.id,
          riskScore: result.risk_score,
          flags: JSON.stringify(result.flags),
          status: result.recommendation === "BLOCK" ? "BLOCKED" : "INVESTIGATING",
        },
      });
    }

    // Log fraud agent event
    await db.agentLog.create({
      data: {
        agentName: "Fraud",
        eventType: "VERIFY",
        payload: JSON.stringify({ brokerId: broker.brokerCode, risk: result.risk_score }),
        latencyMs: 412,
        success: true,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        broker_id: broker.brokerCode,
        broker_name: broker.name,
        risk_score: result.risk_score,
        flags: result.flags,
        recommendation: result.recommendation,
        reasoning: result.reasoning,
        alert_id: alert?.id || null,
        alert_status: alert?.status || null,
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Internal error";
    if (process.env.NODE_ENV !== "production") console.error("[fraud/check]", msg);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
