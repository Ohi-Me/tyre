import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireInternalService } from "@tyre/auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/loads/[code]/broadcast-allowed?broker_code=...
 *
 * Internal-service route called by the broadcast service before blasting.
 * Enforces the per-load anti-spam rule: a load can be broadcast at most
 * MAX_BROADCASTS_PER_LOAD_PER_WINDOW times in WINDOW_MINUTES.
 *
 * Returns:
 *   { allowed: bool, reason: str, recent_count: int, max: int, window_min: int }
 *
 * The per-driver rate limit (≤5 broadcasts/hour) is enforced separately inside
 * /drivers/nearby — drivers over the limit are filtered out before the blast,
 * so the broker can still broadcast the load, just not to those drivers.
 */
const MAX_BROADCASTS_PER_LOAD_PER_WINDOW = 3;
const WINDOW_MINUTES = 10;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const denied = requireInternalService(req);
  if (denied) return denied;

  const { code } = await params;
  const brokerCode = req.nextUrl.searchParams.get("broker_code");
  if (!code) {
    return NextResponse.json(
      { success: false, error: "load code is required" },
      { status: 400 },
    );
  }
  if (!brokerCode) {
    return NextResponse.json(
      { success: false, error: "broker_code query param is required" },
      { status: 400 },
    );
  }

  const windowStart = new Date(Date.now() - WINDOW_MINUTES * 60 * 1000);
  const recentCount = await db.broadcastLog.count({
    where: {
      tyreCode: code,
      brokerCode,
      createdAt: { gte: windowStart },
    },
  });

  const allowed = recentCount < MAX_BROADCASTS_PER_LOAD_PER_WINDOW;
  const reason = allowed
    ? "ok"
    : `rate_limited: ${recentCount} broadcasts in the last ${WINDOW_MINUTES} min (max ${MAX_BROADCASTS_PER_LOAD_PER_WINDOW})`;

  return NextResponse.json({
    success: true,
    data: {
      allowed,
      reason,
      recent_count: recentCount,
      max: MAX_BROADCASTS_PER_LOAD_PER_WINDOW,
      window_min: WINDOW_MINUTES,
    },
  });
}
