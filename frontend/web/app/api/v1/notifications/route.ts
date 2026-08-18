import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rateLimitOrNull } from "@tyre/auth";
import { clientIp } from "@/lib/http";
import { requireUser } from "@/lib/api/require-user";

export const dynamic = "force-dynamic";

function serialize(n: any) {
  return {
    id: n.id,
    org_id: n.orgId ?? null,
    user_id: n.userId ?? null,
    category: n.category,
    type: n.type,
    title: n.title,
    body: n.body,
    amount: n.amount ?? null,
    data: n.data ?? null,
    read: n.read,
    read_at: n.readAt ? new Date(n.readAt).toISOString() : null,
    created_at: new Date(n.createdAt).toISOString(),
  };
}

// GET /api/v1/notifications — the caller's inbox: personal rows + org broadcasts.
//   ?read=false  ?category=payment  ?limit=  ?offset=
export async function GET(req: NextRequest) {
  const limited = await rateLimitOrNull("standard", clientIp(req));
  if (limited) return NextResponse.json(limited.body, { status: limited.status });

  const { user, response } = requireUser(req);
  if (response) return response;

  try {
    const url = new URL(req.url);
    const readParam = url.searchParams.get("read");
    const category = url.searchParams.get("category");
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 20, 1), 100);
    const offset = Math.max(Number(url.searchParams.get("offset")) || 0, 0);

    // Inbox = notifications addressed to me OR broadcast to my org (userId null).
    const scope: any = {
      OR: [{ userId: user!.sub }, { userId: null, orgId: user!.orgId }],
    };
    const where: any = { AND: [scope] };
    if (readParam === "true" || readParam === "false") where.AND.push({ read: readParam === "true" });
    if (category) where.AND.push({ category });

    const [total, unread, rows] = await Promise.all([
      db.notification.count({ where }),
      db.notification.count({ where: { AND: [scope, { read: false }] } }),
      db.notification.findMany({ where, orderBy: { createdAt: "desc" }, skip: offset, take: limit }),
    ]);

    return NextResponse.json({
      success: true,
      data: rows.map(serialize),
      meta: { unread },
      pagination: { total, limit, offset, has_more: offset + rows.length < total },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Internal error";
    if (process.env.NODE_ENV !== "production") console.error("[notifications:list]", msg);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
