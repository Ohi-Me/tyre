"use client";

import { useEffect, useState } from "react";

export type LandingMetrics = {
  /** Live network counts — real when the DB is reachable and populated. */
  drivers: string;
  loads: string;
  languages: string;
  /**
   * Pilot *targets* we're building toward — not yet-proven results. The UI
   * labels these so they read as goals, not achievements. Kept beside the live
   * counts so the target values never drift between fallback and live payload.
   */
  booking_time: string;
  return_match: string;
  ontime: string;
  earnings: string;
  /** True once `drivers`/`loads` reflect real DB counts (vs. pre-launch goals). */
  live: boolean;
};

// Shown instantly to avoid layout shift, then replaced by GET /api/v1/landing/stats.
// Counts default to the pilot targets and are marked non-live, so the landing UI
// labels them as targets until the API returns real DB numbers.
const FALLBACK: LandingMetrics = {
  drivers: "10,000+",
  loads: "10,000+",
  languages: "—",
  booking_time: "47s",
  return_match: "82%",
  ontime: "92%",
  earnings: "₹10,000+",
  live: false,
};

export function useLandingStats(): LandingMetrics {
  const [metrics, setMetrics] = useState<LandingMetrics>(FALLBACK);

  useEffect(() => {
    let alive = true;
    fetch("/api/v1/landing/stats")
      .then((r) => r.json())
      .then((d) => {
        if (alive && d?.metrics) setMetrics({ ...FALLBACK, ...d.metrics });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  return metrics;
}
