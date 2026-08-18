import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { rateLimitOrNull } from "@tyre/auth";
import { clientIp } from "@/lib/http";
import { requireUser } from "@/lib/api/require-user";

export const dynamic = "force-dynamic";

const ReadSchema = z.object({
  ids: z.array(z.string().min(1).max(64)).max(500).optional(),
  all: z.boolean().optional(),
});

// POST /api/v1/notifications/read — mark { ids } or { all: true } as read.
// Only ever affects the caller's own inbox (personal + org-broadcast rows).
export async function POST(req: NextRequest) {
  const limited = await rateLimitOrNull("standard", clientIp(req));
  if (limited) return NextResponse.json(limited.body, { status: limited.status });

  const { user, response } = requireUser(req);
  if (response) return response;

  try {
    const parsed = ReadSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success || (!parsed.data.all && !parsed.data.ids?.length)) {
      return NextResponse.json({ success: false, error: "Provide ids[] or all:true" }, { status: 400 });
    }
    const scope: any = { OR: [{ userId: user!.sub }, { userId: null, orgId: user!.orgId }] };
    const where: any = { AND: [scope, { read: false }] };
    if (!parsed.data.all) where.AND.push({ id: { in: parsed.data.ids } });

    const result = await db.notification.updateMany({ where, data: { read: true, readAt: new Date() } });
    return NextResponse.json({ success: true, data: { updated: result.count } });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Internal error";
    if (process.env.NODE_ENV !== "production") console.error("[notifications:read]", msg);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
