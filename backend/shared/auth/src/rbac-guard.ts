/**
 * @tyre/auth/rbac-guard — server-side RBAC enforcement for Next.js route handlers.
 *
 * Phase 0 fix (`docs/ARCHITECTURE.md` §9.2 / §8): the RBAC matrix in `./index.ts`
 * (`RBAC`, `can()`) was correct but unused — grep for `RBAC.can(` or `can(` across
 * `frontend/web/app/api` before this file returned zero hits. Any authenticated user could
 * hit `/api/v1/loads/assign` (releases a real UPI advance as of this same Phase 0 pass)
 * regardless of role.
 *
 * `requireRole(req, action)` extracts the bearer token the same way the rest of the
 * stateless API layer does (`verifyAccessToken`, see `./jwt.ts`), checks it against the
 * RBAC matrix, and returns a ready-to-send 401/403 NextResponse or null (proceed) —
 * the same calling convention as `rateLimitOrNull`, so route handlers compose both with
 * one extra `if` each.
 *
 * Browser sessions (NextAuth cookies) are out of scope here on purpose: the writes this
 * guards (`loads:assign`, `trips:*`, `trucks:*`, ...) are reached via the bearer-token
 * `/api/v1/*` surface documented in `docs/ARCHITECTURE.md` §9.1, which is also what
 * mobile clients and the WhatsApp-driven flows use. Cookie-session routes under
 * `app/[locale]` continue to rely on NextAuth's own session check.
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyAccessToken, type AccessTokenPayload } from "./jwt";
import { can } from "./index";

export interface RbacCheckResult {
  response: NextResponse | null;
  user: AccessTokenPayload | null;
}

/**
 * Verifies the bearer token and checks `can(role, action)`.
 * Returns `{ response: null, user }` if allowed — `user` is then available to the
 * caller for audit logging / org-scoping the query, exactly the kind of follow-on use
 * `docs/ARCHITECTURE.md` §9.2 describes ("only operator/admin should hit
 * /api/v1/loads/assign").
 */
export function requireRole(req: NextRequest, action: string): RbacCheckResult {
  const header = req.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return {
      user: null,
      response: NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 }),
    };
  }

  let payload: AccessTokenPayload;
  try {
    payload = verifyAccessToken(token);
  } catch {
    return {
      user: null,
      response: NextResponse.json({ success: false, error: "Invalid or expired token" }, { status: 401 }),
    };
  }

  if (!can(payload.role, action)) {
    return {
      user: payload,
      response: NextResponse.json(
        { success: false, error: `Forbidden: role '${payload.role}' cannot '${action}'` },
        { status: 403 },
      ),
    };
  }

  return { user: payload, response: null };
}
