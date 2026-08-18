/**
 * @tyre/auth/api-key — issuance + verification for the `ApiKey` model.
 *
 * Phase 0 fix (`docs/ARCHITECTURE.md` §4.2): `ApiKey` was added to the schema in the
 * 3-repo merge "but has no issuance or verification code — it's a model waiting for an
 * implementation." This is that implementation: opaque, prefixed keys
 * (`tyre_live_<32 hex chars>`), hashed with SHA-256 before storage (never store a raw
 * key, same pattern as `issueRefreshToken` in `./jwt.ts`), with scopes validated against
 * the same RBAC action strings used everywhere else (`./index.ts`'s `RBAC`).
 *
 * Used by Phase 10's "Open Trust Network & Platform API" eventually, but issuance and
 * verification need to exist now so service integrations (the WhatsApp webhook, the
 * Razorpay webhook handler, any future partner integration) have something real to
 * authenticate against instead of reusing the internal-service shared secret for
 * everything.
 */

import crypto from "node:crypto";
import { db } from "@tyre/db";

const KEY_PREFIX = "tyre_live_";
const PREFIX_VISIBLE_CHARS = 12; // shown to the user once, for their own reference

export interface IssuedApiKey {
  id: string;
  rawKey: string; // shown exactly once — caller must store it; we never can again
  prefix: string;
  name: string;
  scopes: string[];
  expiresAt: Date | null;
}

/** Generates and persists a new API key. Returns the raw key — store it nowhere else. */
export async function issueApiKey(
  name: string,
  scopes: string[],
  expiresInDays?: number,
): Promise<IssuedApiKey> {
  const raw = `${KEY_PREFIX}${crypto.randomBytes(24).toString("hex")}`;
  const keyHash = crypto.createHash("sha256").update(raw).digest("hex");
  const prefix = raw.slice(0, PREFIX_VISIBLE_CHARS);
  const expiresAt = expiresInDays ? new Date(Date.now() + expiresInDays * 86_400_000) : null;

  const record = await db.apiKey.create({
    data: {
      name,
      keyHash,
      prefix,
      scopes: JSON.stringify(scopes),
      expiresAt,
    },
  });

  return { id: record.id, rawKey: raw, prefix, name, scopes, expiresAt };
}

export interface VerifiedApiKey {
  id: string;
  name: string;
  scopes: string[];
}

/** Verifies a raw API key from an `x-api-key` header. Returns null if invalid/revoked/expired. */
export async function verifyApiKey(rawKey: string): Promise<VerifiedApiKey | null> {
  if (!rawKey || !rawKey.startsWith(KEY_PREFIX)) return null;

  const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");
  const record = await db.apiKey.findUnique({ where: { keyHash } });

  if (!record || record.revoked) return null;
  if (record.expiresAt && record.expiresAt < new Date()) return null;

  // Fire-and-forget — last-used tracking shouldn't block the calling request.
  db.apiKey.update({ where: { id: record.id }, data: { lastUsedAt: new Date() } }).catch(() => {});

  return { id: record.id, name: record.name, scopes: JSON.parse(record.scopes) as string[] };
}

export function apiKeyCan(key: VerifiedApiKey, action: string): boolean {
  if (key.scopes.includes("*")) return true;
  return key.scopes.some((s) => s === action || s === `${action.split(":")[0]}:*`);
}

export async function revokeApiKey(id: string): Promise<void> {
  await db.apiKey.update({ where: { id }, data: { revoked: true } });
}

/**
 * SH-C2 fix: requireApiKey — route-handler guard for API-key auth.
 *
 * Usage:
 *   import { requireApiKey } from "@tyre/auth";
 *
 *   export async function GET(req: NextRequest) {
 *     const { key, response } = await requireApiKey(req, "loads:read");
 *     if (response) return response;
 *     // key is VerifiedApiKey — use key.id, key.name, key.scopes
 *     ...
 *   }
 *
 * Returns { key, response }:
 *   - If the request has a valid `x-api-key` header with the required scope,
 *     `key` is set and `response` is null.
 *   - Otherwise, `key` is null and `response` is a 401/403 NextResponse.
 *
 * This allows API consumers (Phase 10 Open Trust Network, partner integrations)
 * to authenticate via API keys instead of JWT bearer tokens.
 */
export async function requireApiKey(
  req: Request,
  requiredScope: string,
): Promise<{ key: VerifiedApiKey | null; response: Response | null }> {
  const rawKey = req.headers.get("x-api-key") || "";
  if (!rawKey) {
    return {
      key: null,
      response: new Response(
        JSON.stringify({ success: false, error: "Missing x-api-key header" }),
        { status: 401, headers: { "content-type": "application/json" } },
      ),
    };
  }
  const verified = await verifyApiKey(rawKey);
  if (!verified) {
    return {
      key: null,
      response: new Response(
        JSON.stringify({ success: false, error: "Invalid or revoked API key" }),
        { status: 401, headers: { "content-type": "application/json" } },
      ),
    };
  }
  if (!apiKeyCan(verified, requiredScope)) {
    return {
      key: null,
      response: new Response(
        JSON.stringify({ success: false, error: `API key lacks scope '${requiredScope}'` }),
        { status: 403, headers: { "content-type": "application/json" } },
      ),
    };
  }
  return { key: verified, response: null };
}
