"use client";

import { useEffect, useState } from "react";

export type HealthCheck = { name: string; status: "up" | "down"; latencyMs: number; detail?: string };
export type Health = {
  status: "healthy" | "degraded" | "down";
  version: string;
  checks: HealthCheck[];
  timestamp: string;
  uptime: number;
};

/** Polls the real /api/v1/health endpoint. Returns null until first load. */
export function useHealth(pollMs = 30_000): { health: Health | null; loading: boolean } {
  const [health, setHealth] = useState<Health | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch("/api/v1/health", { cache: "no-store" });
        const data = (await res.json()) as Health;
        if (alive) setHealth(data);
      } catch {
        if (alive) setHealth(null);
      } finally {
        if (alive) setLoading(false);
      }
    };
    load();
    const id = setInterval(load, pollMs);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [pollMs]);

  return { health, loading };
}

export const HEALTH_LABEL: Record<string, string> = {
  healthy: "All systems operational",
  degraded: "Partial degradation",
  down: "Service disruption",
};

export const HEALTH_COLOR: Record<string, string> = {
  healthy: "var(--tyre-green)",
  degraded: "#F5A623",
  down: "#FF5A5F",
};
