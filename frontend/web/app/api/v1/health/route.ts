/**
 * GET /api/v1/health — real liveness/readiness probe.
 *
 * Actually pings each dependency (Postgres, Redis, AI gateway) with a short
 * timeout and reports per-service status plus an aggregate. Used by
 * docker-compose / K8s probes AND by the public status page + footer badge.
 *
 * Each probe is independently time-boxed so the endpoint stays fast and never
 * hangs when a dependency is down — which is exactly what makes the whole stack
 * testable on localhost without the Docker datastores running.
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getRedis } from "@/lib/redis";
import { isStandalone } from "@/lib/dev-store";

export const dynamic = "force-dynamic";

const VERSION = process.env.TYRE_VERSION || process.env.npm_package_version || "3.2.0";

type Check = { name: string; status: "up" | "down"; latencyMs: number; detail?: string };

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`timeout after ${ms}ms`)), ms)),
  ]);
}

async function probe(name: string, fn: () => Promise<unknown>, ms = 1500): Promise<Check> {
  const t0 = Date.now();
  try {
    await withTimeout(fn(), ms);
    return { name, status: "up", latencyMs: Date.now() - t0 };
  } catch (err) {
    return { name, status: "down", latencyMs: Date.now() - t0, detail: (err as Error).message };
  }
}

export async function GET() {
  // Standalone dev: don't dial any infra — report healthy in in-memory mode.
  if (isStandalone()) {
    return NextResponse.json(
      {
        status: "healthy",
        service: "tyre-web",
        version: VERSION,
        mode: "standalone",
        checks: [
          { name: "postgres", status: "up", latencyMs: 0, detail: "in-memory (standalone)" },
          { name: "redis", status: "up", latencyMs: 0, detail: "in-memory (standalone)" },
          { name: "ai_gateway", status: "up", latencyMs: 0, detail: "mocked (standalone)" },
        ],
        timestamp: new Date().toISOString(),
        uptime: Math.round(process.uptime?.() ?? 0),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const aiUrl = process.env.AI_GATEWAY_URL || "http://localhost:8000";

  const checks = await Promise.all([
    probe("postgres", () => db.$queryRaw`SELECT 1`),
    probe("redis", async () => {
      const r = getRedis();
      if (r.status !== "ready" && r.status !== "connecting") await r.connect().catch(() => {});
      return r.ping();
    }),
    probe("ai_gateway", async () => {
      const res = await fetch(`${aiUrl}/health`, { signal: AbortSignal.timeout(1400) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return true;
    }),
  ]);

  const down = checks.filter((c: any) => c.status === "down");
  // Postgres + Redis are critical; the AI gateway degrades the service but the
  // BFF can still serve. Overall: healthy / degraded / down.
  const critical = new Set(["postgres", "redis"]);
  const criticalDown = down.some((c: any) => critical.has(c.name));
  const status = down.length === 0 ? "healthy" : criticalDown ? "down" : "degraded";

  return NextResponse.json(
    {
      status,
      service: "tyre-web",
      version: VERSION,
      checks,
      timestamp: new Date().toISOString(),
      uptime: Math.round(process.uptime?.() ?? 0),
    },
    {
      status: status === "down" ? 503 : 200,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
