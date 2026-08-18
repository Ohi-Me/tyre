"use client";

import Link from "next/link";
import { useHealth, HEALTH_LABEL, HEALTH_COLOR } from "@/lib/tyre/use-health";
import { ArrowLeft, RefreshCw } from "lucide-react";

const SERVICE_LABELS: Record<string, { name: string; desc: string }> = {
  postgres: { name: "Postgres", desc: "Primary datastore — drivers, loads, escrow" },
  redis: { name: "Redis", desc: "Rate limiting, sessions, lead capture" },
  ai_gateway: { name: "AI Gateway", desc: "Voice, dispatch, pricing & fraud agents" },
};

export default function StatusPage() {
  const { health, loading } = useHealth(15_000);
  const status = health?.status ?? (loading ? "healthy" : "down");

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="max-w-3xl mx-auto px-5 sm:px-8 py-16 sm:py-24">
        <Link href="/" className="inline-flex items-center gap-2 text-[13px] text-[var(--muted-foreground)] hover:text-[var(--tyre-ink)] transition-colors mb-10">
          <ArrowLeft className="w-4 h-4" />
          Back to TYRE
        </Link>

        {/* Overall */}
        <div className="tyre-card p-7 sm:p-9">
          <div className="flex items-center gap-3">
            <span className="relative flex h-3 w-3">
              <span className="absolute inline-flex h-full w-full rounded-full opacity-60 animate-ping" style={{ background: HEALTH_COLOR[status] }} />
              <span className="relative inline-flex rounded-full h-3 w-3" style={{ background: HEALTH_COLOR[status] }} />
            </span>
            <h1 className="tyre-display text-[clamp(1.8rem,1.4rem+1.5vw,2.6rem)] text-[var(--tyre-ink)]">
              {HEALTH_LABEL[status]}
            </h1>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-[13px] text-[var(--muted-foreground)]">
            {health?.version && <span>Version v{health.version}</span>}
            {typeof health?.uptime === "number" && <span>Uptime {formatUptime(health.uptime)}</span>}
            {health?.timestamp && (
              <span className="inline-flex items-center gap-1.5">
                <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
                Checked {new Date(health.timestamp).toLocaleTimeString()}
              </span>
            )}
          </div>
        </div>

        {/* Per-service */}
        <div className="mt-5 grid gap-3">
          {(health?.checks ?? []).map((c) => {
            const meta = SERVICE_LABELS[c.name] ?? { name: c.name, desc: "" };
            const color = c.status === "up" ? HEALTH_COLOR.healthy : HEALTH_COLOR.down;
            return (
              <div key={c.name} className="tyre-card p-5 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2.5">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
                    <span className="text-[15px] font-semibold text-[var(--tyre-ink)]">{meta.name}</span>
                  </div>
                  <div className="text-[12.5px] text-[var(--muted-foreground)] mt-1 ml-[18px]">{meta.desc}</div>
                  {c.detail && c.status === "down" && (
                    <div className="text-[11.5px] text-[#FF5A5F] mt-1 ml-[18px] font-mono truncate">{c.detail}</div>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <div className="text-[13px] font-semibold" style={{ color }}>
                    {c.status === "up" ? "Operational" : "Down"}
                  </div>
                  <div className="text-[11px] text-[var(--muted-foreground)] font-mono mt-0.5">{c.latencyMs}ms</div>
                </div>
              </div>
            );
          })}
          {!health && !loading && (
            <div className="tyre-card p-5 text-[13px] text-[var(--muted-foreground)]">
              Could not reach the health endpoint.
            </div>
          )}
        </div>

        <p className="text-[12px] text-[var(--muted-foreground)] mt-8 leading-relaxed">
          This page reads <code className="text-[var(--tyre-green-deep)]">/api/v1/health</code> live and refreshes
          every 15s. Postgres and Redis are critical; the AI gateway degrades (not fails) the service.
        </p>
      </div>
    </main>
  );
}

function formatUptime(s: number): string {
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}
