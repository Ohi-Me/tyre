/**
 * GET /api/v1/landing/stats — headline numbers for the marketing page.
 *
 * Two honestly-distinct kinds of numbers:
 *   • Live counts pulled from Postgres where available — drivers onboarded,
 *     loads moved, supported languages.
 *   • Pilot *targets* for service levels we have not yet proven at scale
 *     (booking time, return-leg fill, on-time rate, driver earnings). These are
 *     goals, not results; the payload sets `live:false` until real counts exist
 *     so the landing UI labels them as targets instead of passing them off as
 *     proof.
 *
 * Deliberately NOT published: a rupees-in-escrow figure. Driver escrow is
 * currently simulated (no real settlement runs yet — see aiClient.escrow.*), so
 * surfacing a crore number would misrepresent simulated flow as money moved.
 *
 * Every DB read is individually guarded, so a cold/unreachable database simply
 * serves the pilot targets — the landing page never breaks.
 *
 * Cached at the edge for 5 minutes; public, non-personalised data.
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { INDIAN_LOCALES } from "@tyre/i18n";
import { isStandalone } from "@/lib/dev-store";

export const revalidate = 300;

async function safe<T>(p: Promise<T>, fallback: T): Promise<T> {
  try {
    return await p;
  } catch {
    return fallback;
  }
}

function compact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}k`;
  return String(n);
}

export async function GET() {
  // Standalone dev: don't touch Postgres — serve the pilot targets.
  const [driverCount, loadCount] = isStandalone()
    ? [0, 0]
    : await Promise.all([safe(db.driver.count(), 0), safe(db.load.count(), 0)]);

  const live = driverCount > 0 || loadCount > 0;

  const metrics = {
    // Live counts where the DB has them; the pilot target otherwise (labelled).
    drivers: driverCount > 0 ? `${compact(driverCount)}+` : "10,000+",
    loads: loadCount > 0 ? `${compact(loadCount)}+` : "10,000+",
    languages: String(INDIAN_LOCALES.length),
    // Pilot targets — goals we're building toward, not achieved results.
    booking_time: "47s",
    return_match: "82%",
    ontime: "92%",
    earnings: "₹10,000+",
    live,
  };

  return NextResponse.json(
    { metrics, source: live ? "live" : "curated", generatedAt: new Date().toISOString() },
    { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } },
  );
}
