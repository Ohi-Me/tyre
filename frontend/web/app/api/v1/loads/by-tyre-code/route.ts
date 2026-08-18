import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireInternalService } from "@tyre/auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/loads/by-tyre-code?code=TYRE-0001
 *
 * Internal-service route called by the bridge agent to resolve which broker
 * (and broker Telegram chat) is on the other side of a load. Used for driver
 * WhatsApp events that already have a tyre_code (e.g. driver_status_reached
 * after the driver has accepted a load).
 *
 * Returns the load row joined with:
 *   - broker_code, broker_name, broker_phone
 *   - broker_telegram_chat_id (null if broker hasn't linked Telegram — bridge
 *     treats that as a no-op push rather than an error)
 *   - origin, destination, offered_rate, advance_offered, status
 *   - assigned truck number + driver phone (if assigned)
 */
export async function GET(req: NextRequest) {
  const denied = requireInternalService(req);
  if (denied) return denied;

  const code = req.nextUrl.searchParams.get("code");
  if (!code) {
    return NextResponse.json(
      { success: false, error: "code query param is required" },
      { status: 400 },
    );
  }

  const load = await db.load.findFirst({
    where: { tyreCode: code },
    include: {
      broker: true,
      assignedTruck: { include: { driver: true } },
    },
  });

  if (!load) {
    return NextResponse.json(
      { success: false, error: "load_not_found", message: `No load with code ${code}` },
      { status: 404 },
    );
  }

  return NextResponse.json({
    success: true,
    data: {
      id: load.id,
      tyre_code: load.tyreCode,
      origin: load.origin,
      // Week 3 broadcast: origin GPS coords. Nullable because pre-Week 3 loads
      // and seed data don't have them. The broadcast service fails gracefully
      // with a clear "set origin GPS from the dashboard" message when missing.
      origin_lat: load.originLat ?? null,
      origin_lng: load.originLng ?? null,
      destination: load.destination,
      destination_lat: load.destinationLat ?? null,
      destination_lng: load.destinationLng ?? null,
      distance_km: load.distanceKm,
      weight_tons: load.weightTons,
      truck_type_req: load.truckTypeReq,
      goods_type: load.goodsType,
      offered_rate: load.offeredRate,
      ai_suggested_rate: load.aiSuggestedRate,
      advance_offered: load.advanceOffered,
      status: load.status,
      risk_level: load.riskLevel,
      broker_code: load.broker.brokerCode,
      broker_name: load.broker.name,
      broker_phone: load.broker.phone,
      broker_telegram_chat_id: load.broker.telegramChatId,
      assigned_truck_number: load.assignedTruck?.vehicleNumber ?? null,
      driver_phone: load.assignedTruck?.driver?.phone ?? null,
      driver_name: load.assignedTruck?.driver?.name ?? null,
      created_at: load.createdAt.toISOString(),
    },
  });
}
