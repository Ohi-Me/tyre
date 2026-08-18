import { NextRequest, NextResponse } from "next/server";
import { revokeRefreshToken } from "@tyre/auth";

export const dynamic = "force-dynamic";

// POST /api/v1/auth/logout — revokes a single refresh token (one session).
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body?.refreshToken) {
      return NextResponse.json({ success: false, error: "refreshToken is required" }, { status: 400 });
    }
    await revokeRefreshToken(body.refreshToken);
    return NextResponse.json({ success: true, data: { message: "Logged out" } });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Internal error";
    if (process.env.NODE_ENV !== "production") console.error("[auth/logout]", msg);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
