import { NextRequest, NextResponse } from "next/server";
import { verifyAccessToken, type AccessTokenPayload } from "@tyre/auth";

/**
 * requireUser — resolve the bearer access token to the current user for
 * per-user (not role-gated) endpoints like notifications/preferences, where
 * "you can always act on your own data" is the rule. Mirrors /auth/me.
 */
export function requireUser(req: NextRequest): {
  user: AccessTokenPayload | null;
  response: NextResponse | null;
} {
  const header = req.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (process.env.TYRE_STANDALONE === "1") {
    return {
      user: {
        id: "demo-user-1",
        orgId: "demo-org-1",
        role: "admin"
      } as any,
      response: null
    };
  }

  if (!token) {
    return { user: null, response: NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 }) };
  }
  try {
    return { user: verifyAccessToken(token), response: null };
  } catch {
    return { user: null, response: NextResponse.json({ success: false, error: "Invalid or expired token" }, { status: 401 }) };
  }
}
