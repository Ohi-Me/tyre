import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { runDispatchAgent, runPricingAgent, type DispatchInput } from "@/lib/tyre/ai-service";
import { rateLimitOrNull, requireRole, requireInternalService } from "@tyre/auth";
import { clientIp } from "@/lib/http";

export const dynamic = "force-dynamic";


// POST /api/v1/loads/match — AI dispatch agent matches loads for a driver
// Called by both the app UI and the WhatsApp bot (app/ai/whatsapp/driver_bot.py via
// app/clients/bff_client.match_loads) — "ai" tier since it invokes the Dispatch agent.
export async function POST(req: NextRequest) {
  const limited = await rateLimitOrNull("ai", clientIp(req));
  if (limited) return NextResponse.json(limited.body, { status: limited.status });

  // C1 (audit): previously anonymous — it leaked the open-load board (broker names,
  // rates, advance, risk levels) and let anyone burn AI-dispatch compute. Accept
  // EITHER the internal service token (the WhatsApp/Telegram bot calls via bff_client
  // with `Bearer <TYRE_INTERNAL_SERVICE_TOKEN>`) OR a user JWT carrying `loads:match`
  // (the driver app). Matching stays cross-org on purpose — the open-load board is a
  // marketplace surface, so it is intentionally not org-scoped here.
  if (requireInternalService(req)) {
    const { response } = requireRole(req, "loads:match");
    if (response) return response;
  }

  try {
    const body = await req.json();
    const location = body.location || "Patna";
    const destination = body.destination || "";
    const truckType = body.truck_type || "12-wheeler";

    // Fetch all open loads from DB
    const openLoads = await db.load.findMany({
      where: { status: { in: ["OPEN", "NEGOTIATING"] } },
      include: { broker: true },
      take: 10,
    });

    if (openLoads.length === 0) {
      return NextResponse.json({
        success: true,
        data: {
          matches: [],
          voice_response_hindi: `कोई लोड उपलब्ध नहीं है।`,
          ai_breakdown: { dispatch_confidence: 0, pricing_variance: "0%", fraud_clear: true, negotiation_predicted_rounds: 0 },
        },
      });
    }

    // Call AI dispatch agent to rank matches
    const dispatchInput: DispatchInput = {
      driver_phone: body.driver_phone || "",
      driver_location: location,
      destination,
      truck_type: truckType,
      available_loads: openLoads.map((l: any) => ({
        id: l.tyreCode,
        origin: l.origin,
        destination: l.destination,
        distance_km: l.distanceKm,
        rate: l.aiSuggestedRate,
        goods_type: l.goodsType,
        weight_tons: l.weightTons,
        truck_type_req: l.truckTypeReq,
      })),
    };

    const dispatchResult = await runDispatchAgent(dispatchInput);

    // Build enriched matches with pricing breakdown for top 3
    const topMatches = dispatchResult.ranked_matches.slice(0, 3).map((m: any) => {
      const load = openLoads.find((l: any) => l.tyreCode === m.load_id);
      if (!load) return null;
      return {
        load_id: load.id,
        tyre_code: load.tyreCode,
        origin: load.origin,
        destination: load.destination,
        distance_km: load.distanceKm,
        rate: load.aiSuggestedRate,
        ai_match_score: m.score,
        match_reasoning: m.reasoning,
        estimated_profit: Math.round(load.aiSuggestedRate * 0.18),
        advance: load.advanceOffered,
        broker_name: load.broker.name,
        broker_id: load.broker.brokerCode,
        broker_risk: load.riskLevel,
        goods_type: load.goodsType,
        weight_tons: load.weightTons,
        truck_type_req: load.truckTypeReq,
      };
    }).filter((m: any): m is NonNullable<typeof m> => m !== null);

    // Top match drives the AI breakdown summary. `match.load_id` holds the DB id,
    // so look the load back up by id (not tyreCode).
    const top = topMatches[0];
    const topLoad = top ? openLoads.find((l: any) => l.id === top.load_id) : undefined;
    const topOfferedRate = topLoad?.offeredRate || 0;

    return NextResponse.json({
      success: true,
      data: {
        matches: topMatches,
        voice_response_hindi: dispatchResult.voice_response_hindi,
        ai_breakdown: {
          dispatch_confidence: top?.ai_match_score || 0,
          // REAL pricing variance — computed from the top match's load vs broker offer
          pricing_variance: top
            ? `${(((top.rate - topOfferedRate) / Math.max(topOfferedRate, 1)) * 100).toFixed(1)}%`
            : "0%",
          // REAL fraud clearance — based on the load's broker risk level
          fraud_clear: top ? top.broker_risk !== "HIGH" : true,
          negotiation_predicted_rounds: 2,
        },
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Internal error";
    if (process.env.NODE_ENV !== "production") console.error("[loads/match]", msg);
    return NextResponse.json(
      { success: false, error: "Internal error" },
      { status: 500 },
    );
  }
}
