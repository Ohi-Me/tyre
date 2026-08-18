import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireInternalService } from "@tyre/auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/loads/[code]/broadcasts — history of broadcasts for a load.
 *
 * Internal-service route used by:
 *   - the broker bot's /loads view (to show "📢 3 broadcasts · 47 drivers
 *     notified" next to each load)
 *   - the dashboard's broadcast history page
 *
 * Returns the most recent 50 BroadcastLog rows for the load, newest first.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const denied = requireInternalService(req);
  if (denied) return denied;

  const { code } = await params;
  if (!code) {
    return NextResponse.json(
      { success: false, error: "load code is required" },
      { status: 400 },
    );
  }

  const logs = await db.broadcastLog.findMany({
    where: { tyreCode: code },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const serialized = logs.map((l: any) => ({
    id: l.id,
    tyre_code: l.tyreCode,
    broker_code: l.brokerCode,
    origin_label: l.originLabel,
    radius_km: l.radiusKm,
    truck_type_filter: l.truckTypeFilter,
    drivers_found: l.driversFound,
    drivers_notified: l.driversNotified,
    drivers_failed: l.driversFailed,
    outcomes: l.outcomes,
    initiated_by: l.initiatedBy,
    created_at: l.createdAt.toISOString(),
  }));

  // Summary stats for the broker bot's compact display
  const totalBroadcasts = logs.length;
  const totalDriversNotified = logs.reduce((sum: number, l: any) => sum + l.driversNotified, 0);
  const lastBroadcastAt = logs[0]?.createdAt.toISOString() ?? null;

  return NextResponse.json({
    success: true,
    data: {
      tyre_code: code,
      total_broadcasts: totalBroadcasts,
      total_drivers_notified: totalDriversNotified,
      last_broadcast_at: lastBroadcastAt,
      broadcasts: serialized,
    },
  });
}
