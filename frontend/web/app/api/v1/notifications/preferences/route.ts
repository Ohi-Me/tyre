import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { rateLimitOrNull } from "@tyre/auth";
import { clientIp } from "@/lib/http";
import { requireUser } from "@/lib/api/require-user";
import { NOTIFICATION_CATEGORIES, NOTIFICATION_CHANNELS } from "@/lib/notifications/notify";

export const dynamic = "force-dynamic";

// GET /api/v1/notifications/preferences — the caller's channel prefs by category.
// A missing (category, channel) pair defaults to enabled=true.
export async function GET(req: NextRequest) {
  const limited = await rateLimitOrNull("standard", clientIp(req));
  if (limited) return NextResponse.json(limited.body, { status: limited.status });
  const { user, response } = requireUser(req);
  if (response) return response;

  try {
    const rows = await db.notificationPreference.findMany({ where: { userId: user!.sub } });
    const set = new Map(rows.map((r) => [`${r.category}:${r.channel}`, r.enabled]));
    const matrix = NOTIFICATION_CATEGORIES.map((category) => ({
      category,
      channels: Object.fromEntries(
        NOTIFICATION_CHANNELS.map((channel) => [channel, set.get(`${category}:${channel}`) ?? true]),
      ),
    }));
    return NextResponse.json({ success: true, data: matrix });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Internal error";
    if (process.env.NODE_ENV !== "production") console.error("[notifications:prefs:get]", msg);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}

const PutSchema = z.object({
  updates: z
    .array(
      z.object({
        category: z.enum(NOTIFICATION_CATEGORIES),
        channel: z.enum(NOTIFICATION_CHANNELS),
        enabled: z.boolean(),
      }),
    )
    .min(1)
    .max(100),
});

// PUT /api/v1/notifications/preferences — upsert a batch of channel toggles.
export async function PUT(req: NextRequest) {
  const limited = await rateLimitOrNull("standard", clientIp(req));
  if (limited) return NextResponse.json(limited.body, { status: limited.status });
  const { user, response } = requireUser(req);
  if (response) return response;

  try {
    const parsed = PutSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message || "Invalid input" },
        { status: 400 },
      );
    }
    await db.$transaction(
      parsed.data.updates.map((u) =>
        db.notificationPreference.upsert({
          where: { userId_category_channel: { userId: user!.sub, category: u.category, channel: u.channel } },
          create: { userId: user!.sub, category: u.category, channel: u.channel, enabled: u.enabled },
          update: { enabled: u.enabled },
        }),
      ),
    );
    return NextResponse.json({ success: true, data: { updated: parsed.data.updates.length } });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Internal error";
    if (process.env.NODE_ENV !== "production") console.error("[notifications:prefs:put]", msg);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
