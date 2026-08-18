import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { runNegotiationAgent, runPricingAgent, type NegotiationInput } from "@/lib/tyre/ai-service";
import { requireRole, rateLimitOrNull } from "@tyre/auth";
import { clientIp } from "@/lib/http";

export const dynamic = "force-dynamic";


// POST /api/v1/negotiate — AI negotiation agent runs a round
export async function POST(req: NextRequest) {
  const limited = await rateLimitOrNull("ai", clientIp(req));
  if (limited) return NextResponse.json(limited.body, { status: limited.status });

  const { user, response } = requireRole(req, "negotiate:create");
  if (response) return response;

  try {
    const body = await req.json();
    const loadId = body.load_id;
    const brokerOffer = Number(body.broker_offer);
    const round = Number(body.round) || 1;

    if (!loadId || !brokerOffer) {
      return NextResponse.json(
        { success: false, error: "load_id and broker_offer required" },
        { status: 400 },
      );
    }

    const load = await db.load.findUnique({
      where: { id: loadId },
      include: { broker: true },
    });
    if (!load) {
      return NextResponse.json({ success: false, error: "Load not found" }, { status: 404 });
    }

    // Compute AI min safe + expected rate via Pricing agent (synchronous fallback if LLM fails)
    const pricing = await runPricingAgent({
      origin: load.origin,
      destination: load.destination,
      distance_km: load.distanceKm,
      truck_type: load.truckTypeReq,
      weight_tons: load.weightTons,
      goods_type: load.goodsType,
    });

    // Fetch previous rounds for this load
    const previousRounds = await db.negotiation.findMany({
      where: { loadId },
      orderBy: { createdAt: "asc" },
    });

    const negotiationInput: NegotiationInput = {
      load_id: load.tyreCode,
      origin: load.origin,
      destination: load.destination,
      distance_km: load.distanceKm,
      truck_type: load.truckTypeReq,
      weight_tons: load.weightTons,
      goods_type: load.goodsType,
      broker_offer: brokerOffer,
      ai_min_safe_rate: pricing.min_safe_rate,
      ai_expected_rate: pricing.expected_rate,
      round,
      previous_rounds: previousRounds.map((n: any) => ({
        offer: n.brokerOffer,
        counter: n.counterOffer,
        decision: n.decision,
      })),
      broker_risk_level: load.riskLevel,
    };

    const result = await runNegotiationAgent(negotiationInput);

    // Persist negotiation record + load status change atomically, so a failure
    // can't leave a saved negotiation whose decision was never reflected on the load.
    const nextLoadStatus =
      result.decision === "ACCEPTED" ? "ASSIGNED" : result.decision === "COUNTER" ? "NEGOTIATING" : null;

    const writes: any[] = [
      db.negotiation.create({
        data: {
          loadId,
          driverPhone: body.driver_phone || "+919876543210",
          brokerOffer,
          counterOffer: result.counter_offer,
          finalRate: result.decision === "ACCEPTED" ? brokerOffer : 0,
          decision: result.decision,
          rounds: round,
          messageHindi: result.message_hindi,
          aiConfidence: result.confidence,
        },
      }),
    ];
    if (nextLoadStatus) {
      writes.push(db.load.update({ where: { id: loadId }, data: { status: nextLoadStatus } }));
    }
    const [negotiation] = await db.$transaction(writes);

    return NextResponse.json({
      success: true,
      data: {
        decision: result.decision,
        counter_offer: result.counter_offer,
        message_hindi: result.message_hindi,
        reasoning: result.reasoning,
        round,
        min_safe_rate: pricing.min_safe_rate,
        expected_rate: pricing.expected_rate,
        confidence: result.confidence,
        negotiation_id: negotiation.id,
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Internal error";
    if (process.env.NODE_ENV !== "production") console.error("[negotiate]", msg);
    return NextResponse.json(
      { success: false, error: "Internal error" },
      { status: 500 },
    );
  }
}
