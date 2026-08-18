/**
 * @tyre/api/loads — service layer for the loads domain.
 *
 * BE-C1 fix: business logic extracted from frontend/web/app/api/v1/loads/route.ts.
 * Route handlers become thin transport layers: parse → call service → serialize.
 *
 * This service is framework-agnostic (no Next.js imports) so it can be:
 * - Unit tested without spinning up a Next.js server
 * - Reused by future workers, CLI tools, or other entry points
 * - Migrated to a separate microservice without rewrite
 */
import { db } from "@tyre/db";
import type { LoadCreateInput, LoadListQuery, LoadAssignInput, LoadMatchInput } from "./schemas.js";
export { serializeLoad, type SerializedLoad } from "./serializer.js";

/**
 * Generate a race-safe tyreCode using a Postgres sequence.
 * Falls back to nanoid if the sequence doesn't exist (dev).
 */
async function generateTyreCode(): Promise<string> {
  try {
    const seqResult = await db.$queryRaw<[{ nextval: bigint }]>`
      SELECT nextval('tyre_load_seq')::bigint AS nextval
    `;
    const seq = Number(seqResult[0].nextval);
    return `TYRE-${String(seq).padStart(4, "0")}`;
  } catch {
    const { customAlphabet } = await import("nanoid");
    const nano = customAlphabet("0123456789", 6);
    return `TYRE-${nano()}`;
  }
}

/**
 * List loads with optional filters and cursor pagination.
 */
export async function listLoads(query: LoadListQuery): Promise<{
  loads: SerializedLoad[];
  next_cursor: string | null;
}> {
  const { status, broker_id, limit, cursor } = query;

  const loads = await db.load.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(broker_id ? { broker: { brokerCode: broker_id } } : {}),
      ...(cursor ? { id: { gt: cursor } } : {}),
    },
    include: { broker: true, assignedTruck: true },
    orderBy: { id: "asc" },
    take: limit + 1,  // fetch one extra to determine if there's a next page
  });

  const hasMore = loads.length > limit;
  const items = hasMore ? loads.slice(0, limit) : loads;
  const nextCursor = hasMore && items.length > 0 ? items[items.length - 1].id : null;

  return {
    loads: items.map(serializeLoad),
    next_cursor: nextCursor,
  };
}

/**
 * Create a new load.
 */
export async function createLoad(
  input: LoadCreateInput,
  orgId: string,
): Promise<SerializedLoad> {
  const tyreCode = await generateTyreCode();

  const broker = input.broker_id
    ? await db.broker.findFirst({ where: { brokerCode: input.broker_id } })
    : await db.broker.findFirst({ where: { brokerCode: "BRK-001" } });

  if (!broker) {
    throw new Error("Broker not found");
  }

  const load = await db.load.create({
    data: {
      tyreCode,
      orgId,
      brokerId: broker.id,
      origin: input.origin,
      originRegion: input.origin_region,
      destination: input.destination,
      destinationRegion: input.destination_region,
      distanceKm: input.distance_km,
      weightTons: input.weight_tons,
      truckTypeReq: input.truck_type_req,
      goodsType: input.goods_type,
      offeredRate: input.offered_rate,
      advanceOffered: input.advance_offered,
      status: "AVAILABLE",
      riskLevel: "LOW",
    },
    include: { broker: true, assignedTruck: true },
  });

  return serializeLoad(load);
}

/**
 * Get a single load by ID.
 */
export async function getLoad(id: string): Promise<SerializedLoad | null> {
  const load = await db.load.findUnique({
    where: { id },
    include: { broker: true, assignedTruck: true },
  });
  return load ? serializeLoad(load) : null;
}

/**
 * Get a single load by tyreCode (public-facing code).
 */
export async function getLoadByCode(tyreCode: string): Promise<SerializedLoad | null> {
  const load = await db.load.findUnique({
    where: { tyreCode },
    include: { broker: true, assignedTruck: true },
  });
  return load ? serializeLoad(load) : null;
}
