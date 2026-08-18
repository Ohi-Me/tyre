/**
 * @tyre/api/trips — service layer.
 * BE-C1 fix: extracted from frontend/web/app/api/v1/trips/route.ts.
 */
import { db } from "@tyre/db";
import type { TripListQuery } from "./schemas.js";

export interface SerializedTrip {
  id: string;
  load_id: string;
  truck_id: string;
  driver_id: string | null;
  driver_name: string | null;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  advance_released: number;
  balance_released: number;
  created_at: string;
  updated_at: string;
}

export function serializeTrip(t: any): SerializedTrip {
  return {
    id: t.id,
    load_id: t.loadId,
    truck_id: t.truckId,
    driver_id: t.truck?.driverId ?? null,
    driver_name: t.truck?.driver?.name ?? null,
    status: t.status,
    started_at: t.startedAt?.toISOString() ?? null,
    completed_at: t.completedAt?.toISOString() ?? null,
    advance_released: t.advanceReleased ?? 0,
    balance_released: t.balanceReleased ?? 0,
    created_at: t.createdAt.toISOString(),
    updated_at: t.updatedAt.toISOString(),
  };
}

export async function listTrips(query: TripListQuery): Promise<{
  trips: SerializedTrip[];
  next_cursor: string | null;
}> {
  const { status, driver_id, load_id, limit, cursor } = query;
  const trips = await db.trip.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(driver_id ? { truck: { driverId: driver_id } } : {}),
      ...(load_id ? { loadId: load_id } : {}),
      ...(cursor ? { id: { gt: cursor } } : {}),
    },
    include: { truck: { include: { driver: true } } },
    orderBy: { id: "asc" },
    take: limit + 1,
  });
  const hasMore = trips.length > limit;
  const items = hasMore ? trips.slice(0, limit) : trips;
  return {
    trips: items.map(serializeTrip),
    next_cursor: hasMore && items.length > 0 ? items[items.length - 1].id : null,
  };
}

export async function getTrip(id: string): Promise<SerializedTrip | null> {
  const trip = await db.trip.findUnique({
    where: { id },
    include: { truck: { include: { driver: true } } },
  });
  return trip ? serializeTrip(trip) : null;
}

export async function startTrip(id: string): Promise<SerializedTrip | null> {
  const trip = await db.trip.update({
    where: { id },
    data: { status: "IN_PROGRESS", startedAt: new Date() },
    include: { truck: { include: { driver: true } } },
  });
  return serializeTrip(trip);
}

export async function completeTrip(id: string): Promise<SerializedTrip | null> {
  const trip = await db.trip.update({
    where: { id },
    data: { status: "COMPLETED", completedAt: new Date() },
    include: { truck: { include: { driver: true } } },
  });
  return serializeTrip(trip);
}
