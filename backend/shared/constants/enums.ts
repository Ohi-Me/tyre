/**
 * TYRE shared enums.
 *
 * SH-C7 fix: enums are defined here as string union types for type safety.
 * The Prisma schema also defines these as database-level enums, but the TS
 * types are the canonical source for application code. The values match
 * the Prisma schema enum values exactly.
 *
 * Values are intentionally SCREAMING_SNAKE_CASE for DB + cross-language
 * interop. `UserRole` is the one exception — its values stay lowercase
 * (`driver`, `shipper`, ...) to match the existing DB rows and JWT claims
 * consumed by the Python ai-gateway.
 */

// ── String union types (canonical TS source of truth) ───────────────────────
// Values MUST match the Prisma schema enums exactly (backend/database/prisma/schema.prisma).
// Audit fix: previously these drifted from the Prisma enums (LoadStatus had
// AVAILABLE/EXPIRED instead of OPEN/NEGOTIATING; TruckStatus had AVAILABLE/OFFLINE;
// DriverStatus had RESTING; RfpStatus was completely wrong). All fixed to match.
export type UserRole = "admin" | "operator" | "broker" | "driver" | "shipper" | "fleet_manager" | "super_admin";
export type Region = "IN" | "BD" | "PK" | "NP" | "LK" | "NG" | "KE" | "GH" | "ZA" | "EG" | "BR" | "MX" | "CO" | "PE" | "AE" | "SA" | "ID" | "VN" | "TH" | "PH";
export type LoadStatus = "OPEN" | "NEGOTIATING" | "ASSIGNED" | "IN_TRANSIT" | "DELIVERED" | "CANCELLED";
export type TruckStatus = "IDLE" | "LOADING" | "IN_TRANSIT" | "UNLOADING" | "MAINTENANCE";
export type TripStatus = "PLANNED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
export type DriverStatus = "AVAILABLE" | "ON_TRIP" | "OFFLINE";
export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type PaymentStatus = "PENDING" | "ESCROW_HELD" | "ADVANCE_RELEASED" | "BALANCE_RELEASED" | "REFUNDED" | "DISPUTED";
export type NegotiationDecision = "ACCEPTED" | "COUNTER" | "REJECTED";
export type RfpStatus = "DRAFT" | "SUBMITTED" | "UNDER_REVIEW" | "AWARDED" | "REJECTED";
export type FraudRecommendation = "APPROVE" | "MONITOR" | "INVESTIGATE" | "BLOCK";
export type AgentName = "Dispatch" | "Pricing" | "Fraud" | "Payment" | "Trust" | "Negotiation" | "Compliance" | "Contract" | "Route" | "Copilot" | "Fleet" | "Bridge";
export type AgentStatus = "ACTIVE" | "IDLE" | "ERROR" | "DISABLED";
export type EscrowStatus = "PENDING" | "FUNDED" | "ADVANCE_RELEASED" | "BALANCE_RELEASED" | "COMPLETED" | "REFUNDED" | "FAILED";
export type TransactionType = "FUNDING" | "ADVANCE_RELEASE" | "BALANCE_RELEASE" | "REFUND" | "FEE";
export type TriggerType = "LOAD_ACCEPT" | "GPS_POD" | "CONSIGNEE_CONFIRM" | "MANUAL" | "CANCELLATION";

// Convenience: the canonical list of agents, for UI dropdowns and the
// orchestrator's registration table. Bridge is included (Week 2 of the
// WhatsApp↔Telegram bridge) even though it's not loaded by the orchestrator —
// it's used via direct `await BridgeAgent().run(...)` calls.
export const ALL_AGENTS: AgentName[] = [
  "Dispatch",
  "Pricing",
  "Fraud",
  "Negotiation",
  "Compliance",
  "Contract",
  "Payment",
  "Route",
  "Copilot",
  "Fleet",
  "Bridge",
];
