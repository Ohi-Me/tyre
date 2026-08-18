import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireInternalService } from "@tyre/auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/brokers/[code]/loads — list a broker's loads.
 *
 * Internal-service route used by the Telegram broker bot's `/loads` command.
 * Returns all OPEN / NEGOTIATING / ASSIGNED / IN_TRANSIT loads for the broker,
 * sorted newest first. The broker bot formats the top 8 as inline-button
 * messages in Telegram.
 *
 * `code` is the broker_code (e.g. BRK-PAT-001), NOT the broker row id —
 * Telegram brokers don't know their internal cuid.
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
      { success: false, error: "broker code is required" },
      { status: 400 },
    );
  }

  const broker = await db.broker.findFirst({ where: { brokerCode: code } });
  if (!broker) {
    return NextResponse.json(
      { success: false, error: "broker_not_found", message: `No broker with code ${code}` },
      { status: 404 },
    );
  }

  const loads = await db.load.findMany({
    where: { brokerId: broker.id },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { assignedTruck: true },
  });

  // Same shape as the public /api/v1/loads route (snake_case) so the broker
  // bot doesn't need a separate serializer.
  const serialized = loads.map((l: any) => ({
    id: l.id,
    tyre_code: l.tyreCode,
    origin: l.origin,
    destination: l.destination,
    distance_km: l.distanceKm,
    weight_tons: l.weightTons,
    truck_type_req: l.truckTypeReq,
    goods_type: l.goodsType,
    offered_rate: l.offeredRate,
    ai_suggested_rate: l.aiSuggestedRate,
    advance_offered: l.advanceOffered,
    status: l.status,
    risk_level: l.riskLevel,
    assigned_truck_number: l.assignedTruck?.vehicleNumber ?? null,
    created_at: l.createdAt.toISOString(),
  }));

  return NextResponse.json({
    success: true,
    data: {
      broker_code: broker.brokerCode,
      broker_name: broker.name,
      loads: serialized,
    },
  });
}
