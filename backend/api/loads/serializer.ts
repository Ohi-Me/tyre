/**
 * @tyre/api/loads/serializer — pure serialization functions.
 *
 * Split from service.ts so it can be unit-tested without a db connection.
 * (service.ts imports @tyre/db which instantiates PrismaClient at import time.)
 */

export interface SerializedLoad {
  id: string;
  tyre_code: string;
  origin: string;
  destination: string;
  distance_km: number;
  weight_tons: number;
  truck_type_req: string;
  goods_type: string;
  offered_rate: number;
  ai_suggested_rate: number | null;
  advance_offered: number;
  status: string;
  risk_level: string;
  broker_id: string;
  broker_name: string;
  broker_phone: string | null;
  broker_risk_score: number;
  assigned_truck_id: string | null;
  assigned_truck_number: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Serialize a Prisma Load (camelCase) → API Load (snake_case) for frontend contract.
 */
export function serializeLoad(l: any): SerializedLoad {
  return {
    id: l.id,
    tyre_code: l.tyreCode,
    origin: l.origin,
    destination: l.destination,
    distance_km: l.distanceKm,
    weight_tons: l.weightTons,
    truck_type_req: l.truckTypeReq,
    goods_type: l.goodsType,
    offered_rate: l.offeredRate,
    ai_suggested_rate: l.aiSuggestedRate ?? null,
    advance_offered: l.advanceOffered,
    status: l.status,
    risk_level: l.riskLevel,
    broker_id: l.broker?.brokerCode || "",
    broker_name: l.broker?.name || "Unknown",
    broker_phone: l.broker?.phone ?? null,
    broker_risk_score: l.broker?.riskScore || 0,
    assigned_truck_id: l.assignedTruckId ?? null,
    assigned_truck_number: l.assignedTruck?.vehicleNumber ?? null,
    created_at: l.createdAt.toISOString(),
    updated_at: l.updatedAt.toISOString(),
  };
}
