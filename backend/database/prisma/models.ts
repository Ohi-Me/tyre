/**
 * @tyre/db/models — Prisma model type re-exports.
 *
 * SH-C7 fix: re-exports Prisma-generated model types so route handlers
 * and services use the single source of truth (the Prisma schema).
 *
 * Enum types are NOT re-exported here — they live in @tyre/shared/constants/enums.ts
 * as string union types, which is more portable across build contexts.
 *
 * Usage:
 *   import type { Load, Truck, Trip, User } from "@tyre/db/models";
 *
 * For payload types with includes:
 *   import type { Prisma } from "@tyre/db/models";
 *   type LoadWithBroker = Prisma.LoadGetPayload<{ include: { broker: true } }>;
 */

export type {
  User,
  Driver,
  Broker,
  Organization,
  Load,
  Truck,
  Trip,
  GpsPing,
  ShipperRFP,
  Negotiation,
  AgentLog,
  AuditLog,
  TrustScore,
  UpiEscrowAccount,
  UpiEscrowTransaction,
  ApiKey,
  RefreshToken,
  ConsigneeConfirmation,
  VoiceOnboarding,
  Verification,
  FastagWallet,
  FastagTransaction,
} from "@prisma/client";

// Re-export Prisma namespace for GetPayload types
import type { Prisma as PrismaNS } from "@prisma/client";
export type { PrismaNS as Prisma };
