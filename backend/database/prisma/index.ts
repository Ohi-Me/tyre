/**
 * @tyre/db — Prisma client singleton.
 * Used by both frontend/web (Next.js API routes) and backend/ai/gateway (Python via HTTP).
 *
 * The Python ai-gateway never opens a DB connection directly — it always goes
 * through frontend/web's API or a dedicated read replica via the BFF.
 */

import { PrismaClient } from "@prisma/client";
import { piiEncryptionExtension } from "./pii-encryption";

declare global {
  // eslint-disable-next-line no-var
  var __tyrePrisma: PrismaClient | undefined;
  // eslint-disable-next-line no-var
  var __tyrePrismaRo: PrismaClient | undefined;
}

const basePrisma =
  globalThis.__tyrePrisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.__tyrePrisma = basePrisma;
}

// Phase 0 fix (ARCHITECTURE.md §9.4): transparently encrypt/decrypt PII columns
// (UPI IDs, GSTIN, license numbers, ...) at the Prisma boundary. See ./pii-encryption.ts.
export const db = piiEncryptionExtension(basePrisma) as PrismaClient;

// ── Read replica (TYRE v1.1 item #9) ─────────────────────────────────────────
// Analytics / metrics reads (admin/metrics, trust/scores, stats/hourly) run against
// the CloudNativePG replica (k8s service `tyre-pg-ro`) so they don't compete with
// write-critical escrow paths on the primary. If TYRE_DATABASE_URL_READONLY is unset
// (local dev / single-node), this transparently falls back to the primary client.
const readonlyUrl = process.env.TYRE_DATABASE_URL_READONLY;

const baseReadPrisma = readonlyUrl
  ? globalThis.__tyrePrismaRo ??
    new PrismaClient({
      log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
      datasources: { db: { url: readonlyUrl } },
    })
  : basePrisma;

if (process.env.NODE_ENV !== "production" && readonlyUrl) {
  globalThis.__tyrePrismaRo = baseReadPrisma;
}

/** Read-only client for analytics queries. Falls back to the primary when no replica
 *  URL is configured. Never use for writes. */
export const dbRead = piiEncryptionExtension(baseReadPrisma) as PrismaClient;

export * from "@prisma/client";
export { encryptField, decryptField } from "./pii-encryption";
