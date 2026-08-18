/**
 * @tyre/auth/internal — service-to-service auth for ai-gateway -> BFF calls.
 *
 * Phase 0 fix: `backend/ai/gateway`'s "real impl: db.X.create(...)" comments scattered
 * across `upi_escrow.py`, `trust_score.py`-adjacent endpoints, `voice_onboarding.py`,
 * and `fastag/service.py` were never implemented because there was no authenticated
 * channel for the Python service to call back into the BFF and ask it to write.
 *
 * This is that channel: a single shared-secret bearer token
 * (`TYRE_INTERNAL_SERVICE_TOKEN`, generated once at deploy time, rotated like any other
 * secret) that only `backend/ai/gateway` holds. It is intentionally NOT a per-user JWT —
 * these are service calls with no end-user session attached (e.g. "persist this
 * just-computed trust score"), so RBAC's per-role matrix doesn't apply to them. Every
 * `/api/v1/_internal-style` write route below calls `requireInternalService(req)` first.
 */

import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";

const INTERNAL_TOKEN = process.env.TYRE_INTERNAL_SERVICE_TOKEN || "";

export function requireInternalService(req: NextRequest): NextResponse | null {
  if (!INTERNAL_TOKEN) {
    // Fail closed in any environment that has bothered to deploy this route at all —
    // an unconfigured secret should not silently accept every caller as trusted.
    return NextResponse.json(
      { success: false, error: "Internal service auth not configured" },
      { status: 503 },
    );
  }

  const header = req.headers.get("authorization") || "";
  const provided = header.startsWith("Bearer ") ? header.slice(7) : "";

  if (!provided || !timingSafeEqual(provided, INTERNAL_TOKEN)) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

function timingSafeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}
