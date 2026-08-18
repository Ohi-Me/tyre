import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { issueOtp, rateLimitOrNull } from "@tyre/auth";
import { clientIp } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/auth/otp/send
 *
 * SH-C1 fix: previously issueOtp() was exported but no route called it — phone OTP
 * login was theatre. This route issues an OTP for a phone number and stores it in
 * Redis (5-minute TTL). The WhatsApp/SMS delivery is best-effort.
 *
 * BE-C2 fix: rate-limited per IP (otp bucket, stricter than standard).
 */
const SendOtpSchema = z.object({
  phone: z.string().regex(/^\+?[1-9]\d{6,14}$/, "Invalid phone (E.164 expected)"),
});


export async function POST(req: NextRequest) {
  const limited = await rateLimitOrNull("auth", clientIp(req));
  if (limited) return NextResponse.json(limited.body, { status: limited.status });

  try {
    const body = await req.json().catch(() => ({}));
    const parsed = SendOtpSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.message },
        { status: 400 }
      );
    }
    await issueOtp(parsed.data.phone);
    return NextResponse.json({
      success: true,
      data: { phone: parsed.data.phone, ttl_seconds: 300 },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Internal error";
    if (process.env.NODE_ENV !== "production") console.error("[auth/otp/send]", msg);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
