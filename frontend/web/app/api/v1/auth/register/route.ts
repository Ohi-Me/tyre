import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hashPassword, signAccessToken, issueRefreshToken, recordAudit, rateLimitOrNull } from "@tyre/auth";
import { registerSchema } from "../validators";
import { clientIp } from "@/lib/http";

export const dynamic = "force-dynamic";


function publicUser(u: { id: string; name: string; email: string | null; phone: string; role: string; orgId: string }) {
  return { id: u.id, name: u.name, email: u.email, phone: u.phone, role: u.role, org_id: u.orgId };
}

// POST /api/v1/auth/register — stateless bearer-token registration (mobile/API clients).
// Browser sessions should prefer NextAuth phone-OTP via /api/auth/signin.
export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  const limited = await rateLimitOrNull("auth", ip);
  if (limited) return NextResponse.json(limited.body, { status: limited.status });

  try {
    const body = await req.json();
    const parsed = registerSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    const input = parsed.data;

    const existing = input.email
      ? await db.user.findFirst({ where: { email: input.email } })
      : await db.user.findUnique({ where: { phone: input.phone! } });
    if (existing) {
      return NextResponse.json({ success: false, error: "An account with this email/phone already exists" }, { status: 409 });
    }

    const org =
      (input.orgSlug ? await db.organization.findUnique({ where: { slug: input.orgSlug } }) : null) ??
      (await db.organization.findFirst());
    if (!org) {
      return NextResponse.json({ success: false, error: "No organization available — run the seed script first" }, { status: 500 });
    }

    const passwordHash = await hashPassword(input.password);
    const user = await db.user.create({
      data: {
        name: input.name,
        role: input.role,
        email: input.email,
        phone: input.phone ?? `pending-${Date.now()}`,
        passwordHash,
        orgId: org.id,
      },
    });

    await recordAudit({ userId: user.id, action: "USER_REGISTERED", entityType: "User", entityId: user.id, ipAddress: ip });

    const accessToken = signAccessToken({ sub: user.id, role: user.role as any, orgId: user.orgId, email: user.email, phone: user.phone });
    const refreshToken = await issueRefreshToken(user.id);

    return NextResponse.json({ success: true, data: { user: publicUser(user), accessToken, refreshToken } }, { status: 201 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Internal error";
    if (process.env.NODE_ENV !== "production") console.error("[auth/register]", msg);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
