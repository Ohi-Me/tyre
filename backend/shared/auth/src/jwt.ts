/**
 * @tyre/auth/jwt — stateless bearer-token layer.
 *
 * Ported from the axle-platform (Express/Prisma) backend's `auth.service.ts`
 * during the 3-repo consolidation (see /MERGE_REPORT.md, section "Auth").
 * That implementation was the most production-ready of the three source
 * repos: bcrypt password hashing, signed short-lived access tokens, and
 * opaque rotating refresh tokens stored hashed (never raw) in Postgres so
 * individual sessions can be revoked without invalidating a whole JWT
 * family.
 *
 * Why TYRE needs this in addition to NextAuth (see ./index.ts):
 *   - NextAuth issues a cookie-bound session for the browser app.
 *   - The voice pipeline opens a direct browser → backend/ai/gateway SSE
 *     connection (`/voice/sessions/{id}/events`) that does not carry
 *     Next.js cookies across origins in production (separate subdomain /
 *     mTLS boundary per docs/ARCHITECTURE.md). It needs a portable bearer
 *     token instead.
 *   - Mobile clients and service-to-service calls (BFF → AI gateway,
 *     webhook replays) also need stateless bearer auth.
 *
 * backend/ai/gateway verifies the same HS256 token independently — see
 * backend/ai/gateway/app/security/jwt_auth.py — using the shared
 * TYRE_JWT_ACCESS_SECRET.
 */

import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import { db } from "@tyre/db";
import type { UserRole } from "@tyre/shared";

const SALT_ROUNDS = 12;

const INSECURE_FALLBACK_SECRET = "dev-insecure-secret-change-me";
const ACCESS_SECRET = process.env.TYRE_JWT_ACCESS_SECRET || process.env.NEXTAUTH_SECRET || INSECURE_FALLBACK_SECRET;
const ACCESS_EXPIRY = process.env.TYRE_JWT_ACCESS_EXPIRY || "15m";
const REFRESH_EXPIRY = process.env.TYRE_JWT_REFRESH_EXPIRY || "30d";

/**
 * SEC-1 (hardened, audit C0): refuse to sign or verify tokens with the insecure
 * dev fallback anywhere except an EXPLICIT development/test environment.
 *
 * The original check only fired when `NODE_ENV === "production"`. That left a
 * fail-open gap: standalone Node entrypoints (seed scripts, the BFF→AI-gateway
 * service calls, webhook replay workers) and any "staging" deployment frequently
 * run with `NODE_ENV` unset or set to something other than "production" — Next.js
 * injects it for the web app, but nothing guarantees it for those processes. In
 * that state the source-visible fallback secret was accepted and every token
 * became forgeable. We now fail-closed by default: the fallback is tolerated ONLY
 * when NODE_ENV is explicitly "development" or "test".
 *
 * Checked lazily (first sign/verify) rather than at import so a `next build`
 * without the secret present doesn't crash the build — it fails fast on the first
 * real auth attempt at runtime instead, with a clear message.
 */
function assertSecureSecret(): void {
  if (ACCESS_SECRET !== INSECURE_FALLBACK_SECRET) return;
  const env = process.env.NODE_ENV;
  if (env === "development" || env === "test") return;
  throw new Error(
    "TYRE_JWT_ACCESS_SECRET (or NEXTAUTH_SECRET) must be set outside development/test " +
      `(NODE_ENV=${env ?? "unset"}). Refusing to use the insecure dev fallback secret ` +
      "for token signing/verification.",
  );
}

export interface AccessTokenPayload {
  sub: string; // user id
  role: UserRole;
  orgId: string;
  phone?: string | null;
  email?: string | null;
}

// ── Passwords ────────────────────────────────────────────────────────────

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

// ── Access tokens (short-lived, signed, stateless) ──────────────────────

export function signAccessToken(payload: AccessTokenPayload): string {
  assertSecureSecret();
  return jwt.sign(payload, ACCESS_SECRET, {
    expiresIn: ACCESS_EXPIRY as jwt.SignOptions["expiresIn"],
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  assertSecureSecret();
  return jwt.verify(token, ACCESS_SECRET) as AccessTokenPayload;
}

// ── Refresh tokens (opaque, rotating, DB-hashed) ─────────────────────────

export async function issueRefreshToken(userId: string): Promise<string> {
  const raw = crypto.randomBytes(48).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(raw).digest("hex");
  const expiresAt = new Date(Date.now() + parseExpiryMs(REFRESH_EXPIRY));

  await db.refreshToken.create({ data: { userId, tokenHash, expiresAt } });

  return raw;
}

/** Rotation prevents replay: every refresh revokes the old token and mints a new one. */
export async function rotateRefreshToken(
  rawToken: string
): Promise<{ userId: string; newRawToken: string } | null> {
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
  const existing = await db.refreshToken.findUnique({ where: { tokenHash } });

  if (!existing || existing.revoked || existing.expiresAt < new Date()) {
    return null;
  }

  await db.refreshToken.update({ where: { id: existing.id }, data: { revoked: true } });
  const newRawToken = await issueRefreshToken(existing.userId);

  return { userId: existing.userId, newRawToken };
}

export async function revokeRefreshToken(rawToken: string): Promise<void> {
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
  await db.refreshToken.updateMany({ where: { tokenHash }, data: { revoked: true } });
}

export async function revokeAllUserSessions(userId: string): Promise<void> {
  await db.refreshToken.updateMany({ where: { userId, revoked: false }, data: { revoked: true } });
}

function parseExpiryMs(expiry: string): number {
  const match = expiry.match(/^(\d+)([smhd])$/);
  if (!match) return 7 * 24 * 60 * 60 * 1000; // default 7d
  const [, num, unit] = match;
  const n = Number(num);
  const multipliers: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return n * (multipliers[unit ?? "d"] ?? 86_400_000);
}
