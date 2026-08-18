import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { signAccessToken, rotateRefreshToken, rateLimitOrNull } from "@tyre/auth";
import { refreshSchema } from "../validators";
import { clientIp } from "@/lib/http";

export const dynamic = "force-dynamic";


// POST /api/v1/auth/refresh — rotates the opaque refresh token, mints a new access token.
export async function POST(req: NextRequest) {
  const limited = await rateLimitOrNull("auth", clientIp(req));
  if (limited) return NextResponse.json(limited.body, { status: limited.status });

  try {
    const body = await req.json();
    const parsed = refreshSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: "refreshToken is required" }, { status: 400 });
    }

    const rotated = await rotateRefreshToken(parsed.data.refreshToken);
    if (!rotated) {
      return NextResponse.json({ success: false, error: "Invalid or expired refresh token" }, { status: 401 });
    }

    const user = await db.user.findUnique({ where: { id: rotated.userId } });
    if (!user || !user.isActive) {
      return NextResponse.json({ success: false, error: "User no longer active" }, { status: 401 });
    }

    const accessToken = signAccessToken({ sub: user.id, role: user.role as any, orgId: user.orgId, email: user.email, phone: user.phone });

    return NextResponse.json({ success: true, data: { accessToken, refreshToken: rotated.newRawToken } });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Internal error";
    if (process.env.NODE_ENV !== "production") console.error("[auth/refresh]", msg);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
