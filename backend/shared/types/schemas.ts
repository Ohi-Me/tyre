/**
 * Zod schemas — used by both the Next.js API routes and the AI gateway
 * (via a generated Python dataclass mirror — see scripts/gen-python-schemas.py).
 */

import { z } from "zod";

export const LoadCreateSchema = z.object({
  origin: z.string().min(2),
  origin_region: z.enum(["IN", "BD", "PK", "NP", "LK", "NG", "KE", "GH", "ZA", "EG", "BR", "MX", "CO", "PE", "AE", "SA", "ID", "VN", "TH", "PH"]),
  destination: z.string().min(2),
  destination_region: z.enum(["IN", "BD", "PK", "NP", "LK", "NG", "KE", "GH", "ZA", "EG", "BR", "MX", "CO", "PE", "AE", "SA", "ID", "VN", "TH", "PH"]),
  distance_km: z.number().int().positive(),
  weight_tons: z.number().positive(),
  truck_type_req: z.string(),
  goods_type: z.string(),
  offered_rate: z.number().positive(),
  currency: z.string().length(3), // ISO 4217
  advance_offered: z.number().min(0),
  broker_id: z.string().min(1),
});

export const LoadMatchSchema = z.object({
  driver_phone: z.string().min(1),
  driver_locale: z.string().min(2),
  location: z.string().min(2),
  destination: z.string().optional(),
  truck_type: z.string(),
  region: z.enum(["IN", "BD", "PK", "NP", "LK", "NG", "KE", "GH", "ZA", "EG", "BR", "MX", "CO", "PE", "AE", "SA", "ID", "VN", "TH", "PH"]),
});

export const NegotiateSchema = z.object({
  load_id: z.string().min(1),
  broker_offer: z.number().positive(),
  round: z.number().int().min(1).max(5),
  driver_phone: z.string().optional(),
  driver_locale: z.string().default("hi"),
});

export const VoiceProcessSchema = z.object({
  audio_base64: z.string().optional(),
  transcript: z.string().optional(),
  driver_locale: z.string().min(2).default("hi"),
  driver_phone: z.string().min(1),
  region: z.enum(["IN", "BD", "PK", "NP", "LK", "NG", "KE", "GH", "ZA", "EG", "BR", "MX", "CO", "PE", "AE", "SA", "ID", "VN", "TH", "PH"]),
  intent_hint: z.enum(["FIND_LOAD", "CHECK_RATE", "REPORT_ISSUE", "NAVIGATE", "STATUS", "ACCEPT_LOAD", "REQUEST_ADVANCE", "UPLOAD_POD"]).optional(),
}).refine((d) => d.audio_base64 || d.transcript, {
  message: "Either audio_base64 or transcript is required",
});

export const PricingSchema = z.object({
  origin: z.string(),
  destination: z.string(),
  distance_km: z.number().positive(),
  truck_type: z.string(),
  weight_tons: z.number().positive(),
  goods_type: z.string(),
  region: z.enum(["IN", "BD", "PK", "NP", "LK", "NG", "KE", "GH", "ZA", "EG", "BR", "MX", "CO", "PE", "AE", "SA", "ID", "VN", "TH", "PH"]),
  currency: z.string().length(3).default("INR"),
});

export const FraudCheckSchema = z.object({
  broker_id: z.string().min(1),
  broker_name: z.string(),
  gstin: z.string().optional(),
  tax_id: z.string().optional(),
  verified: z.boolean(),
  payment_defaults: z.number().int().min(0),
  total_loads: z.number().int().min(0),
  risk_score: z.number().min(0).max(100),
  existing_flags: z.array(z.string()).default([]),
  region: z.enum(["IN", "BD", "PK", "NP", "LK", "NG", "KE", "GH", "ZA", "EG", "BR", "MX", "CO", "PE", "AE", "SA", "ID", "VN", "TH", "PH"]),
});

export const CopilotChatSchema = z.object({
  message: z.string().min(1).max(4000),
  history: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string(),
  })).max(20).default([]),
  user_locale: z.string().default("en"),
  user_role: z.enum(["driver", "shipper", "broker", "fleet_manager", "operator", "admin", "super_admin"]).default("operator"),
  region: z.enum(["IN", "BD", "PK", "NP", "LK", "NG", "KE", "GH", "ZA", "EG", "BR", "MX", "CO", "PE", "AE", "SA", "ID", "VN", "TH", "PH"]).default("IN"),
});

export type LoadCreateInput = z.infer<typeof LoadCreateSchema>;
export type LoadMatchInput = z.infer<typeof LoadMatchSchema>;
export type NegotiateInput = z.infer<typeof NegotiateSchema>;
export type VoiceProcessInput = z.infer<typeof VoiceProcessSchema>;
export type PricingInput = z.infer<typeof PricingSchema>;
export type FraudCheckInput = z.infer<typeof FraudCheckSchema>;
export type CopilotChatInput = z.infer<typeof CopilotChatSchema>;
