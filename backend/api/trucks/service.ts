/**
 * @tyre/api/trucks — service layer.
 * BE-C1 fix: extracted from frontend/web/app/api/v1/trucks/route.ts.
 */
import { db } from "@tyre/db";
import type { TruckListQuery, TruckUpdateInput } from "./schemas.js";

export interface SerializedTruck {
  id: string;
  vehicle_number: string;
  truck_type: string | null;
  capacity_tons: number;
  status: string;
  current_location: string | null;
  destination: string | null;
  cargo_loaded: boolean;
  driver_id: string | null;
  driver_name: string | null;
  driver_phone: string | null;
  created_at: string;
  updated_at: string;
}

export function serializeTruck(t: any): SerializedTruck {
  return {
    id: t.id,
    vehicle_number: t.vehicleNumber,
    truck_type: t.truckType ?? null,
    capacity_tons: t.capacityTons,
    status: t.status,
    current_location: t.currentLocation ?? null,
    destination: t.destination ?? null,
    cargo_loaded: t.cargoLoaded ?? false,
    driver_id: t.driverId ?? null,
    driver_name: t.driver?.name ?? null,
    driver_phone: t.driver?.phone ?? null,
    created_at: t.createdAt.toISOString(),
    updated_at: t.updatedAt.toISOString(),
  };
}

export async function listTrucks(query: TruckListQuery): Promise<{
  trucks: SerializedTruck[];
  next_cursor: string | null;
}> {
  const { status, driver_id, limit, cursor } = query;
  const trucks = await db.truck.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(driver_id ? { driverId: driver_id } : {}),
      ...(cursor ? { id: { gt: cursor } } : {}),
    },
    include: { driver: true },
    orderBy: { id: "asc" },
    take: limit + 1,
  });
  const hasMore = trucks.length > limit;
  const items = hasMore ? trucks.slice(0, limit) : trucks;
  return {
    trucks: items.map(serializeTruck),
    next_cursor: hasMore && items.length > 0 ? items[items.length - 1].id : null,
  };
}

export async function getTruck(id: string): Promise<SerializedTruck | null> {
  const truck = await db.truck.findUnique({ where: { id }, include: { driver: true } });
  return truck ? serializeTruck(truck) : null;
}

export async function updateTruck(id: string, input: TruckUpdateInput): Promise<SerializedTruck | null> {
  const truck = await db.truck.update({
    where: { id },
    data: {
      ...(input.status ? { status: input.status } : {}),
      ...(input.current_location ? { currentLocation: input.current_location } : {}),
      ...(input.destination ? { destination: input.destination } : {}),
      ...(input.cargo_loaded !== undefined ? { cargoLoaded: input.cargo_loaded } : {}),
    },
    include: { driver: true },
  });
  return serializeTruck(truck);
}
