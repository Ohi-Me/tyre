import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyAccessToken } from "@tyre/auth";

export const dynamic = "force-dynamic";

// GET /api/v1/auth/me — resolves the bearer access token to the current user.
export async function GET(req: NextRequest) {
  const header = req.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) {
    return NextResponse.json({ success: false, error: "Missing or malformed Authorization header" }, { status: 401 });
  }

  try {
    const payload = verifyAccessToken(header.slice(7));
    const user = await db.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.isActive) {
      return NextResponse.json({ success: false, error: "User no longer active" }, { status: 401 });
    }
    return NextResponse.json({
      success: true,
      data: { id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role, org_id: user.orgId },
    });
  } catch {
    return NextResponse.json({ success: false, error: "Invalid or expired access token" }, { status: 401 });
  }
}
