/**
 * frontend/web/lib/tyre/ai-service.ts
 *
 * Server-side wrapper the v1 API routes call to reach the TYRE AI agents.
 *
 * - When AI_GATEWAY_URL is set (docker / prod), calls route to the Python
 *   ai-gateway (FastAPI) via @tyre/ai-client.
 * - Otherwise (bare `next dev` with no gateway), the in-process fallback in
 *   @tyre/ai-client/fallback is used so the app still works locally. The fallback
 *   uses Groq if GROQ_API_KEY is set, else deterministic rule-based logic.
 *
 * This indirection keeps the route handlers agnostic to where the agents run.
 */
import { aiClient } from "@tyre/ai-client";
import { fallbackClient } from "@tyre/ai-client/fallback";
import type {
  PricingResult,
  DispatchInput,
  DispatchResult,
  NegotiationInput,
  NegotiationResult,
  FraudInput,
  FraudResult,

} from "@tyre/shared";

// Routes import these to type their inputs.
export type { DispatchInput, NegotiationInput, FraudInput } from "@tyre/shared";

const useGateway = Boolean(process.env.AI_GATEWAY_URL);

/** Pricing inputs as the routes supply them — region/currency default to the IN wedge. */
export interface PricingAgentInput {
  origin: string;
  destination: string;
  distance_km: number;
  truck_type: string;
  weight_tons: number;
  goods_type: string;
  region?: string;
  currency?: string;
}

export async function runPricingAgent(input: PricingAgentInput): Promise<PricingResult> {
  const full = { region: "IN" as any, currency: "INR", ...input };
  return useGateway ? aiClient.pricing(full) : fallbackClient.pricing(full);
}

export async function runDispatchAgent(input: DispatchInput): Promise<DispatchResult> {
  return useGateway ? aiClient.dispatch(input) : fallbackClient.dispatch(input);
}

export async function runNegotiationAgent(input: NegotiationInput): Promise<NegotiationResult> {
  return useGateway ? aiClient.negotiate(input) : fallbackClient.negotiate(input);
}

export async function runFraudAgent(input: FraudInput): Promise<FraudResult> {
  return useGateway ? aiClient.fraud(input) : fallbackClient.fraud(input);
}

// ────────────────────────────────────────────────────────────────────────────
// Voice intent extraction
//
// The /api/v1/voice/process route does a lightweight, text-only NLU pass (the
// full audio STT→TTS pipeline lives in the ai-gateway). This rule-based extractor
// handles the Y1 Hindi/Bhojpuri/English driver phrasings deterministically so the
// route works without an LLM key. It recognises patterns like:
//   "हम पटना में हैं, दिल्ली जाना है, 12 चक्का है"
//   "I'm in Patna, going to Delhi, 12 wheeler"
// ────────────────────────────────────────────────────────────────────────────

export interface VoiceIntentExtraction {
  intent: string;
  current_location: string;
  destination: string;
  vehicle_type: string;
  language: string;
  confidence: number;
}

const HAS_DEVANAGARI = /[ऀ-ॿ]/;

// Common origin/destination cities in the Bihar–Jharkhand–UP wedge + major hubs.
const KNOWN_CITIES: Record<string, string> = {
  पटना: "Patna",
  patna: "Patna",
  दिल्ली: "Delhi",
  delhi: "Delhi",
  रांची: "Ranchi",
  ranchi: "Ranchi",
  गया: "Gaya",
  gaya: "Gaya",
  मुंबई: "Mumbai",
  mumbai: "Mumbai",
  कोलकाता: "Kolkata",
  kolkata: "Kolkata",
  लखनऊ: "Lucknow",
  lucknow: "Lucknow",
  कानपुर: "Kanpur",
  kanpur: "Kanpur",
  धनबाद: "Dhanbad",
  dhanbad: "Dhanbad",
  जमशेदपुर: "Jamshedpur",
  jamshedpur: "Jamshedpur",
};

function findCities(text: string): string[] {
  const lower = text.toLowerCase();
  const found: string[] = [];
  for (const [key, canonical] of Object.entries(KNOWN_CITIES)) {
    const needle = key.toLowerCase();
    if (lower.includes(needle) && !found.includes(canonical)) {
      found.push(canonical);
    }
  }
  return found;
}

function detectVehicleType(text: string): string {
  const lower = text.toLowerCase();
  if (/(१०|10)\s*(चक्का|wheeler|wheel)/.test(text) || lower.includes("10 wheeler")) return "10-wheeler";
  if (/(१२|12)\s*(चक्का|wheeler|wheel)/.test(text) || lower.includes("12 wheeler")) return "12-wheeler";
  if (/(६|6)\s*(चक्का|wheeler|wheel)/.test(text) || lower.includes("6 wheeler")) return "6-wheeler";
  if (lower.includes("hxl") || text.includes("32")) return "HXL (32ft)";
  if (lower.includes("lcv")) return "LCV";
  if (text.includes("चक्का") || lower.includes("wheeler")) return "12-wheeler";
  return "";
}

function detectIntent(text: string): string {
  const lower = text.toLowerCase();
  if (/रेट|भाड़ा|किराया|rate|price|fare/.test(lower)) return "CHECK_RATE";
  if (/समस्या|दिक्कत|खराब|problem|issue|breakdown/.test(lower)) return "REPORT_ISSUE";
  if (/रास्ता|नक्शा|route|navigate|map/.test(lower)) return "NAVIGATE";
  if (/स्थिति|status|कहाँ|kahan|where/.test(lower)) return "STATUS";
  if (/एडवांस|advance|पैसा|paisa/.test(lower)) return "REQUEST_ADVANCE";
  // Default for "I'm here, going there" phrasings is a load search.
  return "FIND_LOAD";
}

export async function runVoiceIntentExtractor(
  transcript: string,
): Promise<VoiceIntentExtraction> {
  const cities = findCities(transcript);
  const language = HAS_DEVANAGARI.test(transcript) ? "hi" : "en";
  const vehicle = detectVehicleType(transcript);
  const intent = detectIntent(transcript);

  // First city mentioned is treated as the current location, second as destination.
  const current_location = cities[0] || "";
  const destination = cities[1] || "";

  // Confidence reflects how much we actually extracted.
  let confidence = 0.5;
  if (current_location) confidence += 0.2;
  if (destination) confidence += 0.15;
  if (vehicle) confidence += 0.1;

  return {
    intent,
    current_location,
    destination,
    vehicle_type: vehicle,
    language,
    confidence: Math.min(confidence, 0.95),
  };
}
