/**
 * POST /api/v1/subscribe — newsletter / product-updates capture.
 * GET  /api/v1/subscribe — public subscriber count (non-PII) for social proof.
 *
 * Stores in Redis in prod; falls back to the in-memory dev store so the whole
 * flow works standalone (no Docker). Validated + de-duped server-side.
 */
import { NextRequest, NextResponse } from "next/server";
import { getRedis } from "@/lib/redis";
import { isStandalone, devStore } from "@/lib/dev-store";

export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function GET() {
  if (isStandalone()) {
    const count = devStore().subscriberCount();
    return NextResponse.json({ count, mode: "standalone" });
  }
  try {
    const count = Number((await getRedis().get("tyre:subs:count")) ?? 0);
    return NextResponse.json({ count });
  } catch {
    return NextResponse.json({ count: devStore().subscriberCount() });
  }
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email = String(body.email ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 254) {
    return NextResponse.json({ errors: { email: "Enter a valid email" } }, { status: 422 });
  }

  // Standalone → in-memory.
  if (isStandalone()) {
    const store = devStore();
    if (!store.addSubscriber(email)) return NextResponse.json({ ok: true, deduped: true });
    return NextResponse.json({ ok: true, count: store.subscriberCount(), mode: "standalone" }, { status: 201 });
  }

  try {
    const redis = getRedis();
    const isNew = await redis.sadd("tyre:subs", email);
    if (isNew === 0) return NextResponse.json({ ok: true, deduped: true });
    const count = await redis.incr("tyre:subs:count");
    return NextResponse.json({ ok: true, count }, { status: 201 });
  } catch {
    const store = devStore();
    store.addSubscriber(email);
    return NextResponse.json({ ok: true, count: store.subscriberCount(), mode: "memory" }, { status: 201 });
  }
}
