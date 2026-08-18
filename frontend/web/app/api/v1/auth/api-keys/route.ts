import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { issueApiKey, revokeApiKey, requireRole, rateLimitOrNull } from "@tyre/auth";
import { clientIp } from "@/lib/http";

export const dynamic = "force-dynamic";


/**
 * /api/v1/auth/api-keys — Phase 0 fix.
 *
 * `docs/ARCHITECTURE.md` §4.2: "ApiKey was added in the 3-repo merge but has no
 * issuance or verification code — it's a model waiting for an implementation." This is
 * the issuance/list/revoke surface, backed by `backend/shared/auth/src/api-key.ts`.
 * Admin-only — service API keys are an admin operation, gated by RBAC (`admin` /
 * `super_admin` are the only roles with `*` scope in the matrix).
 */
export async function POST(req: NextRequest) {
  const limited = await rateLimitOrNull("auth", clientIp(req));
  if (limited) return NextResponse.json(limited.body, { status: limited.status });

  const { response } = requireRole(req, "apikeys:create");
  if (response) return response;

  try {
    const { name, scopes, expires_in_days } = await req.json();
    if (!name || !Array.isArray(scopes)) {
      return NextResponse.json({ success: false, error: "name and scopes[] required" }, { status: 400 });
    }
    const issued = await issueApiKey(name, scopes, expires_in_days);
    return NextResponse.json({
      success: true,
      data: {
        id: issued.id,
        raw_key: issued.rawKey, // shown once — caller must store it now
        prefix: issued.prefix,
        name: issued.name,
        scopes: issued.scopes,
        expires_at: issued.expiresAt,
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Internal error";
    if (process.env.NODE_ENV !== "production") console.error("[auth/api-keys]", msg);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const { response } = requireRole(req, "apikeys:read");
  if (response) return response;

  const keys = await db.apiKey.findMany({
    select: { id: true, name: true, prefix: true, scopes: true, lastUsedAt: true, expiresAt: true, revoked: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ success: true, data: keys });
}

export async function DELETE(req: NextRequest) {
  const { response } = requireRole(req, "apikeys:revoke");
  if (response) return response;

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ success: false, error: "id required" }, { status: 400 });

  await revokeApiKey(id);
  return NextResponse.json({ success: true });
}
