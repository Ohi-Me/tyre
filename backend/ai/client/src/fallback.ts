/**
 * @tyre/ai-client/fallback — in-process Groq fallback for dev/local.
 * Same shape as the gateway client but calls Groq directly from the Next.js process.
 * DO NOT use in production — always set AI_GATEWAY_URL in prod.
 */

import Groq from "groq-sdk";
import type {
  VoiceRequest, VoiceResponse, NegotiationInput, NegotiationResult,
  PricingInput, PricingResult, DispatchInput, DispatchResult,
  FraudInput, FraudResult,
} from "@tyre/shared";

let client: Groq | null = null;
function getClient(): Groq {
  if (!client) {
    const key = process.env.GROQ_API_KEY;
    if (!key) throw new Error("GROQ_API_KEY missing");
    client = new Groq({ apiKey: key });
  }
  return client;
}

async function chat(system: string, user: string, json = false): Promise<string> {
  const c = getClient();
  const completion = await c.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    temperature: 0.4,
    max_tokens: 1024,
    ...(json ? { response_format: { type: "json_object" } } : {}),
  });
  return completion.choices?.[0]?.message?.content || "";
}

// ... implement each agent with try/catch + rule-based fallback.
// (kept identical to v2.1 ai-service.ts logic — see backend/ai/gateway for the canonical impl)

export const fallbackClient = {
  async negotiate(input: NegotiationInput): Promise<NegotiationResult> {
    try {
      const system = `You are the TYRE Negotiation Agent. Respond JSON only: {decision, counter_offer, message_hindi, reasoning, confidence}`;
      const user = JSON.stringify(input);
      return JSON.parse(await chat(system, user, true));
    } catch {
      return ruleNegotiate(input);
    }
  },
  async pricing(input: PricingInput): Promise<PricingResult> {
    // rule-based fallback identical to v2.1
    const mileage = input.truck_type.includes("HXL") ? 3.5 : input.truck_type.includes("LCV") ? 5.0 : 4.0;
    const fuel = Math.round((input.distance_km / mileage) * 92);
    const tolls = Math.round(input.distance_km * 3.5);
    const driverAllowance = Math.round((input.distance_km / 500) * 500);
    const maintenance = input.distance_km * 2;
    const misc = Math.round((fuel + tolls + driverAllowance) * 0.05);
    const total = fuel + tolls + driverAllowance + maintenance + misc;
    return {
      min_safe_rate: Math.round((total * 1.08) / 500) * 500,
      expected_rate: Math.round((total * 1.18) / 500) * 500,
      premium_rate: Math.round((total * 1.30) / 500) * 500,
      cost_breakdown: { fuel, tolls, driver_allowance: driverAllowance, maintenance, misc, total_cost: total },
      reasoning: `Fallback: diesel ₹92/L, mileage ${mileage}km/L, toll ₹3.5/km.`,
    };
  },
  async dispatch(input: DispatchInput): Promise<DispatchResult> {
    const matches = input.available_loads.slice(0, 3).map((l, i) => ({
      load_id: l.id, score: 0.94 - i * 0.07, reasoning: `Match for ${input.driver_location}.`,
    }));
    return { ranked_matches: matches, voice_response_hindi: `${input.driver_location} से ${matches.length} लोड मिले।` };
  },
  async fraud(input: FraudInput): Promise<FraudResult> {
    return {
      risk_score: input.risk_score,
      flags: input.existing_flags,
      recommendation: input.risk_score > 70 ? "BLOCK" : input.risk_score > 50 ? "INVESTIGATE" : "APPROVE",
      reasoning: "Fallback: based on existing risk score.",
    };
  },
  async voice(_req: VoiceRequest): Promise<VoiceResponse> {
    throw new Error("Voice pipeline requires ai-gateway — set AI_GATEWAY_URL");
  },
};

function ruleNegotiate(input: NegotiationInput): NegotiationResult {
  if (input.broker_offer >= input.ai_min_safe_rate && input.round >= 2) {
    return {
      decision: "ACCEPTED", counter_offer: input.broker_offer,
      message_hindi: `ठीक है भाई, ₹${Math.round(input.broker_offer).toLocaleString("en-IN")} में मंज़ूर है।`,
      reasoning: "Broker offer meets min safe rate.", confidence: 0.88,
    };
  }
  if (input.broker_offer < input.ai_min_safe_rate * 0.8 && input.round >= 3) {
    return { decision: "REJECTED", counter_offer: 0, message_hindi: `भाई, आपका रेट बहुत कम है।`, reasoning: "Below 80% of min after 3 rounds.", confidence: 0.82 };
  }
  const margin = input.round === 1 ? 0.1 : input.round === 2 ? 0.06 : 0.03;
  const counter = Math.round((input.broker_offer * (1 + margin)) / 500) * 500;
  return {
    decision: "COUNTER", counter_offer: counter,
    message_hindi: `भाई, ₹${counter.toLocaleString("en-IN")} से कम में नहीं होगा।`,
    reasoning: `Countering at ${margin * 100}% above offer (round ${input.round}).`, confidence: 0.85,
  };
}
