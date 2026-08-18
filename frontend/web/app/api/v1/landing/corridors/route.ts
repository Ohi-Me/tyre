/**
 * GET /api/v1/landing/corridors — active freight corridors shown on the landing.
 *
 * The flagship lane and its highway/distance live here so the marketing visuals
 * (route card, lanes list) read from one server-owned source instead of being
 * hardcoded in components. Pure config today; no datastore required.
 */
import { NextResponse } from "next/server";

export const revalidate = 600;

export type Corridor = {
  from: string;
  to: string;
  highway: string;
  km: number;
  onTimePct: number;
  flagship: boolean;
};

const CORRIDORS: Corridor[] = [
  { from: "Patna", to: "Delhi", highway: "NH-19", km: 1040, onTimePct: 92, flagship: true },
  { from: "Ranchi", to: "Kolkata", highway: "NH-33", km: 410, onTimePct: 90, flagship: false },
  { from: "Varanasi", to: "Lucknow", highway: "NH-31", km: 320, onTimePct: 94, flagship: false },
];

export async function GET() {
  return NextResponse.json(
    { corridors: CORRIDORS, flagship: CORRIDORS.find((c: any) => c.flagship) },
    { headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=3600" } },
  );
}
