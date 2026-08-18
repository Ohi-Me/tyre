/**
 * POST /api/v1/leads — landing-page lead capture (waitlist / "talk to an operator").
 *
 * Rate-limited (standard tier). Validated server-side. Persisted to Redis:
 *   - tyre:leads            → capped list of recent leads (JSON), newest first
 *   - tyre:leads:phone:<p>  → de-dupe marker (24h) so one phone can't spam
 *   - tyre:leads:count      → lifetime counter
 *
 * Redis (not Postgres) keeps this a zero-migration, low-risk addition that still
 * gives the marketing team a real, queryable lead store.
 */
import { NextRequest, NextResponse } from "next/server";
import { rateLimitOrNull } from "@tyre/auth";
import { getRedis } from "@/lib/redis";
import { isStandalone, devStore } from "@/lib/dev-store";
import { clientIp } from "@/lib/http";

export const dynamic = "force-dynamic";

// GET /api/v1/leads — public, non-PII: how many operators have joined.
// Used for honest "X already joined" social proof on the landing page.
export async function GET() {
  if (isStandalone()) {
    const count = devStore().count();
    return NextResponse.json({ count, joined: count > 0, mode: "standalone" });
  }
  try {
    const redis = getRedis();
    const count = Number((await redis.get("tyre:leads:count")) ?? 0);
    return NextResponse.json(
      { count, joined: count > 0 },
      { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } },
    );
  } catch {
    return NextResponse.json({ count: devStore().count(), joined: false }, { status: 200 });
  }
}

const ROLES = ["driver", "fleet", "broker", "shipper", "other"] as const;
type Role = (typeof ROLES)[number];


// Indian mobile: 10 digits starting 6–9, optional +91 / 0 prefix.
const PHONE_RE = /^(?:\+?91|0)?[6-9]\d{9}$/;

export async function POST(req: NextRequest) {
  // Standalone dev skips the Redis-backed limiter; live mode keeps it.
  if (!isStandalone()) {
    const limited = await rateLimitOrNull("standard", clientIp(req));
    if (limited) return NextResponse.json(limited.body, { status: limited.status });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const name = String(body.name ?? "").trim();
  const phoneRaw = String(body.phone ?? "").replace(/[\s-]/g, "");
  const role = String(body.role ?? "").trim() as Role;
  const message = String(body.message ?? "").trim().slice(0, 500);

  const errors: Record<string, string> = {};
  if (name.length < 2) errors.name = "Please enter your name";
  if (!PHONE_RE.test(phoneRaw)) errors.phone = "Enter a valid Indian mobile number";
  if (!ROLES.includes(role)) errors.role = "Please choose who you are";
  if (Object.keys(errors).length) return NextResponse.json({ errors }, { status: 422 });

  const phone = phoneRaw.replace(/^(\+?91|0)/, "");
  const lead = { name, phone, role, message, ip: clientIp(req), ts: new Date().toISOString() };

  // Standalone dev: store in memory, no Redis dialing.
  if (isStandalone()) {
    const store = devStore();
    if (!store.setNX(`tyre:leads:phone:${phone}`, 86_400)) {
      return NextResponse.json({ ok: true, deduped: true }, { status: 200 });
    }
    return NextResponse.json({ ok: true, position: store.pushLead(lead), mode: "standalone" }, { status: 201 });
  }

  try {
    const redis = getRedis();
    const dedupeKey = `tyre:leads:phone:${phone}`;
    const isNew = await redis.set(dedupeKey, "1", "EX", 86_400, "NX");
    if (isNew === null) {
      return NextResponse.json({ ok: true, deduped: true }, { status: 200 });
    }

    await redis.lpush("tyre:leads", JSON.stringify(lead));
    await redis.ltrim("tyre:leads", 0, 999); // keep last 1000
    const total = await redis.incr("tyre:leads:count");

    return NextResponse.json({ ok: true, position: total }, { status: 201 });
  } catch (err) {
    // Redis unreachable → fall back to the in-memory store so the flow still works.
    console.warn("[leads] redis unavailable, using in-memory store");
    const store = devStore();
    if (!store.setNX(`tyre:leads:phone:${phone}`, 86_400)) {
      return NextResponse.json({ ok: true, deduped: true }, { status: 200 });
    }
    return NextResponse.json({ ok: true, position: store.pushLead(lead), mode: "memory" }, { status: 201 });
  }
}
