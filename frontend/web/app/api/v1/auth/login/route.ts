import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyPassword, signAccessToken, issueRefreshToken, recordAudit, rateLimitOrNull } from "@tyre/auth";
import { loginSchema } from "../validators";
import { clientIp } from "@/lib/http";

export const dynamic = "force-dynamic";


function publicUser(u: { id: string; name: string; email: string | null; phone: string; role: string; orgId: string }) {
  return { id: u.id, name: u.name, email: u.email, phone: u.phone, role: u.role, org_id: u.orgId };
}

// POST /api/v1/auth/login — email/phone + password bearer-token login.
export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  const limited = await rateLimitOrNull("auth", ip);
  if (limited) return NextResponse.json(limited.body, { status: limited.status });

  try {
    const body = await req.json();
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    const { email, phone, password } = parsed.data;

    const user = email
      ? await db.user.findFirst({ where: { email } })
      : phone
        ? await db.user.findUnique({ where: { phone } })
        : null;

    if (!user || !user.isActive || !user.passwordHash) {
      return NextResponse.json({ success: false, error: "Invalid credentials" }, { status: 401 });
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      return NextResponse.json({ success: false, error: "Invalid credentials" }, { status: 401 });
    }

    await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await recordAudit({ userId: user.id, action: "USER_LOGIN", entityType: "User", entityId: user.id, ipAddress: ip });

    const accessToken = signAccessToken({ sub: user.id, role: user.role as any, orgId: user.orgId, email: user.email, phone: user.phone });
    const refreshToken = await issueRefreshToken(user.id);

    return NextResponse.json({ success: true, data: { user: publicUser(user), accessToken, refreshToken } });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Internal error";
    if (process.env.NODE_ENV !== "production") console.error("[auth/login]", msg);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
