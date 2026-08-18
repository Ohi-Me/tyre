/**
 * TYRE shared domain types.
 * Mirrors the Prisma schema in @tyre/db but uses camelCase + ISO date strings
 * for the API surface (frontend never touches Prisma directly).
 */

import type {
  LoadStatus,
  RiskLevel,
  TruckStatus,
  TripStatus,
  NegotiationDecision,
  
  

  PaymentStatus,
  RfpStatus,
  FraudRecommendation,
  
  UserRole,
} from "../constants/enums.js";

export interface Load {
  id: string;
  tyre_code: string;
  origin: string;
  origin_region: string;
  destination: string;
  destination_region: string;
  distance_km: number;
  weight_tons: number;
  truck_type_req: string;
  goods_type: string;
  offered_rate: number;
  ai_suggested_rate: number;
  advance_offered: number;
  currency: string; // ISO 4217: INR, NGN, BRL, MXN, AED, etc.
  status: LoadStatus;
  risk_level: RiskLevel;
  broker_id: string;
  broker_name?: string;
  broker_phone?: string;
  broker_risk_score?: number;
  assigned_truck_id?: string | null;
  assigned_truck_number?: string;
  created_at: string;
  updated_at?: string;
}

export interface Truck {
  id: string;
  vehicle_number: string;
  truck_type: string;
  driver_id?: string;
  driver_name: string;
  driver_phone: string;
  current_location: string;
  current_region: string;
  status: TruckStatus;
  utilization_pct: number;
  todays_km: number;
  total_km_this_month: number;
  fuel_efficiency_kmpl: number;
  next_maintenance_km: number;
  last_maintenance_date: string;
  predicted_breakdown_risk: RiskLevel;
  cargo_loaded: boolean;
  destination: string | null;
}

export interface Driver {
  id: string;
  name: string;
  phone: string;
  preferred_locale: string; // BCP-47: hi, sw, pt-BR, ar, etc.
  truck_type?: string;
  current_location?: string;
  current_region?: string;
  status: "AVAILABLE" | "ON_TRIP" | "OFFLINE";
  rating: number;
  total_trips: number;
  kyc_verified: boolean;
  upi_id?: string;       // India
  mobile_money_id?: string; // Africa (M-Pesa, etc.)
  pix_key?: string;       // Brazil
  created_at: string;
}

export interface Broker {
  id: string;
  broker_code: string;
  name: string;
  phone: string;
  gstin?: string;       // India
  tax_id?: string;      // Generic — used for non-India
  region: string;
  city?: string;
  risk_score: number;   // 0-100
  total_loads: number;
  payment_defaults: number;
  verified: boolean;
  created_at: string;
}

export interface Trip {
  id: string;
  load_id: string;
  tyre_code: string;
  truck_id: string;
  truck_number: string;
  driver_name: string;
  driver_phone: string;
  origin: string;
  destination: string;
  start_time?: string;
  end_time?: string;
  status: TripStatus;
  pod_verified: boolean;
  payment_status: PaymentStatus;
  advance_amount: number;
  balance_amount: number;
  currency: string;
}

export interface NegotiationEvent {
  id: string;
  load_id: string;
  driver_phone: string;
  broker_offer: number;
  counter_offer: number;
  final_rate: number;
  decision: NegotiationDecision;
  rounds: number;
  message_hindi?: string;
  message_translated?: string; // localized per driver's preferred_locale
  reasoning: string;
  confidence: number;
  timestamp: string;
}

export interface AgentActivity {
  name: string;
  status: string;
  icon: string;
  description: string;
  events_processed: number;
  avg_latency_ms: number;
  success_rate: number;
  last_event: string;
}

export interface ShipperRFP {
  id: string;
  rfp_code: string;
  company: string;
  region: string;
  lanes: number;
  monthly_volume_tons: number;
  truck_types: string[];
  expected_rate_per_km: number;
  currency: string;
  contract_duration_months: number;
  status: RfpStatus;
  submitted_at: string;
}

export interface FraudAlert {
  id: string;
  broker_id: string;
  broker_name: string;
  risk_score: number;
  flags: string[];
  recommendation: FraudRecommendation;
  detected_at: string;
  status: "OPEN" | "INVESTIGATING" | "BLOCKED" | "CLEARED";
}

export interface FleetMetric {
  date: string;
  region: string;
  utilization: number;
  revenue: number;
  trips: number;
  empty_return_pct: number;
}

// ============================================================
// Voice pipeline types
// ============================================================

export interface VoiceRequest {
  audio_base64?: string;       // raw audio
  transcript?: string;          // pre-transcribed
  driver_locale: string;        // BCP-47
  driver_phone: string;
  region: string;
  intent_hint?: string;
}

export interface VoiceIntentResult {
  intent: string;
  current_location: string;
  destination: string;
  vehicle_type: string;
  language: string;
  transcript_original: string;    // driver's language
  transcript_english: string;     // for ops/audit
  confidence: number;
  detected_locale: string;
}

export interface VoiceResponse {
  intent: VoiceIntentResult;
  reply_text_localized: string;   // driver's language
  reply_text_english: string;     // for ops
  audio_base64?: string;          // TTS output (optional)
  actions_taken: string[];        // e.g. ["dispatch.search", "pricing.compute"]
  processing_time_ms: number;
}

// ============================================================
// User & Auth
// ============================================================

export interface User {
  id: string;
  phone: string;
  name: string;
  email?: string;
  role: UserRole;
  region: string;
  preferred_locale: string;
  org_id: string;
  kyc_verified: boolean;
  created_at: string;
}

export interface Organization {
  id: string;
  name: string;
  region: string;
  default_currency: string;
  default_locale: string;
  plan: "free" | "growth" | "enterprise";
}

// ============================================================
// AI agent I/O contracts
// These mirror the JSON the Python ai-gateway agents emit
// (backend/ai/gateway/app/agents/{pricing,dispatch,negotiation,fraud}.py) and the
// in-process fallback in @tyre/ai-client/fallback. Keeping them here is the single
// source of truth so the TS client and the Python service never drift.
// ============================================================

export interface PricingCostBreakdown {
  fuel: number;
  tolls: number;
  driver_allowance: number;
  maintenance: number;
  misc: number;
  total_cost: number;
}

export interface PricingResult {
  min_safe_rate: number;
  expected_rate: number;
  premium_rate: number;
  cost_breakdown: PricingCostBreakdown;
  reasoning: string;
}

export interface DispatchLoadCandidate {
  id: string;
  origin: string;
  destination: string;
  distance_km: number;
  rate: number;
  goods_type: string;
  weight_tons: number;
  truck_type_req: string;
}

export interface DispatchInput {
  driver_phone: string;
  driver_location: string;
  destination: string;
  truck_type: string;
  available_loads: DispatchLoadCandidate[];
}

export interface DispatchMatch {
  load_id: string;
  score: number;
  reasoning: string;
}

export interface DispatchResult {
  ranked_matches: DispatchMatch[];
  voice_response_hindi: string;
}

export interface NegotiationRound {
  offer: number;
  counter: number;
  // Decision comes straight from the DB (Prisma String) so it is kept loose here.
  decision: string;
}

export interface NegotiationInput {
  load_id: string;
  origin: string;
  destination: string;
  distance_km: number;
  truck_type: string;
  weight_tons: number;
  goods_type: string;
  broker_offer: number;
  ai_min_safe_rate: number;
  ai_expected_rate: number;
  round: number;
  previous_rounds: NegotiationRound[];
  // Prisma stores riskLevel as a String column; kept loose to avoid casts at call sites.
  broker_risk_level: string;
}

export interface NegotiationResult {
  decision: NegotiationDecision;
  counter_offer: number;
  message_hindi: string;
  reasoning: string;
  confidence: number;
}

export interface FraudInput {
  broker_id: string;
  broker_name: string;
  gstin: string;
  verified: boolean;
  payment_defaults: number;
  total_loads: number;
  risk_score: number;
  existing_flags: string[];
}

export interface FraudResult {
  risk_score: number;
  flags: string[];
  recommendation: FraudRecommendation;
  reasoning: string;
}
