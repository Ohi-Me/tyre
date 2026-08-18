import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { runPricingAgent } from "@/lib/tyre/ai-service";
import { requireRole, rateLimitOrNull, recordAudit } from "@tyre/auth";

import { clientIp } from "@/lib/http";

export const dynamic = "force-dynamic";


// Transform Prisma Load (camelCase) → API Load (snake_case) for frontend contract
function serializeLoad(l: any) {
  return {
    id: l.id,
    tyre_code: l.tyreCode,
    origin: l.origin,
    // Week 3 broadcast: expose GPS coords so the dashboard can show them and
    // the broker bot can decide whether a broadcast is possible.
    origin_lat: l.originLat ?? null,
    origin_lng: l.originLng ?? null,
    destination: l.destination,
    destination_lat: l.destinationLat ?? null,
    destination_lng: l.destinationLng ?? null,
    distance_km: l.distanceKm,
    weight_tons: l.weightTons,
    truck_type_req: l.truckTypeReq,
    goods_type: l.goodsType,
    offered_rate: l.offeredRate,
    ai_suggested_rate: l.aiSuggestedRate,
    advance_offered: l.advanceOffered,
    status: l.status,
    risk_level: l.riskLevel,
    broker_id: l.broker?.brokerCode || "",
    broker_name: l.broker?.name || "Unknown",
    broker_phone: l.broker?.phone,
    broker_risk_score: l.broker?.riskScore || 0,
    // Derived 0-5 star rating for marketplace display: (100 - risk_score) / 20.
    // Lower risk = higher rating. Used by marketplace.tsx's star display.
    broker_rating: Math.max(0, Math.min(5, (100 - (l.broker?.riskScore || 0)) / 20)),
    assigned_truck_id: l.assignedTruckId,
    assigned_truck_number: l.assignedTruck?.vehicleNumber,
    created_at: l.createdAt.toISOString(),
    updated_at: l.updatedAt.toISOString(),
  };
}

// GET /api/v1/loads — list all loads with broker info
export async function GET(req: NextRequest) {
  const limited = await rateLimitOrNull("standard", clientIp(req));
  if (limited) return NextResponse.json(limited.body, { status: limited.status });

  try {
    // PERF-1: bound the previously unbounded findMany with pagination + optional status filter.
    const url = new URL(req.url);
    const status = url.searchParams.get("status") || "";
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 50, 1), 100);
    const offset = Math.max(Number(url.searchParams.get("offset")) || 0, 0);
    const where: any = {};
    if (status) where.status = status;

    const [total, loads] = await Promise.all([
      db.load.count({ where }),
      db.load.findMany({
        where,
        include: { broker: true, assignedTruck: true },
        orderBy: { createdAt: "desc" },
        skip: offset,
        take: limit,
      }),
    ]);
    return NextResponse.json({
      success: true,
      data: loads.map(serializeLoad),
      pagination: { total, limit, offset, has_more: offset + loads.length < total },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Internal error";
    if (process.env.NODE_ENV !== "production") console.error("[loads]", msg);
    return NextResponse.json(
      { success: false, error: "Internal error" },
      { status: 500 },
    );
  }
}

// POST /api/v1/loads — create a new load
export async function POST(req: NextRequest) {
  const limited = await rateLimitOrNull("standard", clientIp(req));
  if (limited) return NextResponse.json(limited.body, { status: limited.status });

  const { user, response } = requireRole(req, "loads:create");
  if (response) return response;
  // Past the guard, `user` is the verified token payload — org-scope the writes.
  const orgId = user!.orgId;

  try {
    const body = await req.json();

    // BE-C10 fix: validate input with Zod before processing
    const LoadCreateSchema = z.object({
      broker_id: z.string().min(1).max(50),
      origin: z.string().min(2).max(200),
      destination: z.string().min(2).max(200),
      // Week 3 broadcast: optional origin/destination GPS coords. When
      // provided, the nearby-driver broadcast can query drivers around the
      // origin. When absent, broadcasts fail gracefully with "no_origin_gps".
      origin_lat: z.number().min(-90).max(90).optional(),
      origin_lng: z.number().min(-180).max(180).optional(),
      destination_lat: z.number().min(-90).max(90).optional(),
      destination_lng: z.number().min(-180).max(180).optional(),
      distance_km: z.number().int().positive().max(10000),
      weight_tons: z.number().positive().max(100),
      truck_type_req: z.string().min(1).max(50),
      goods_type: z.string().min(1).max(100),
      offered_rate: z.number().positive().max(1_000_000),
      advance_offered: z.number().nonnegative().max(1_000_000).optional().default(0),
    });
    const parsed = LoadCreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: `Validation failed: ${parsed.error.message}` },
        { status: 400 }
      );
    }
    // FE-C11 fix: use Postgres sequence for race-safe tyreCode generation
    let tyreCode: string;
    try {
      const seqResult = await db.$queryRaw<[{ nextval: bigint }]>`
        SELECT nextval('tyre_load_seq')::bigint AS nextval
      `;
      const seq = Number(seqResult[0].nextval);
      tyreCode = `TYRE-${String(seq).padStart(4, "0")}`;
    } catch {
      const { customAlphabet } = await import("nanoid");
      const nano = customAlphabet("0123456789", 6);
      tyreCode = `TYRE-${nano()}`;
    }

    // Find or create broker
    let broker = body.broker_id
      ? await db.broker.findFirst({ where: { brokerCode: body.broker_id } })
      : await db.broker.findFirst({ where: { brokerCode: "BRK-001" } });
    if (!broker) {
      broker = await db.broker.create({
        data: {
          brokerCode: `BRK-${String(Math.floor(Math.random() * 900) + 100)}`,
          name: body.broker_name || "Unknown Broker",
          phone: body.broker_phone || "+910000000000",
        },
      });
    }

    // Compute AI-suggested rate via Pricing Agent if not provided
    let aiSuggestedRate = body.ai_suggested_rate ? Number(body.ai_suggested_rate) : null;
    if (aiSuggestedRate === null) {
      try {
        const pricing = await runPricingAgent({
          origin: body.origin,
          destination: body.destination,
          distance_km: Number(body.distance_km) || 500,
          truck_type: body.truck_type_req || "HXL (32ft)",
          weight_tons: Number(body.weight_tons) || 10,
          goods_type: body.goods_type || "General",
        });
        aiSuggestedRate = pricing.expected_rate;
      } catch {
        aiSuggestedRate = Number(body.offered_rate) * 1.06;
      }
    }

    const load = await db.load.create({
      data: {
        orgId,
        tyreCode,
        origin: body.origin,
        // Week 3 broadcast: persist origin/destination GPS when provided.
        // Nullable in the schema so existing callers (and seed data) that
        // don't pass them are unaffected.
        originLat: body.origin_lat ?? null,
        originLng: body.origin_lng ?? null,
        destination: body.destination,
        destinationLat: body.destination_lat ?? null,
        destinationLng: body.destination_lng ?? null,
        distanceKm: Number(body.distance_km) || 500,
        weightTons: Number(body.weight_tons) || 10,
        truckTypeReq: body.truck_type_req || "HXL (32ft)",
        goodsType: body.goods_type || "General",
        offeredRate: Number(body.offered_rate),
        aiSuggestedRate,
        advanceOffered: Number(body.advance_offered || 0),
        status: "OPEN",
        riskLevel: body.risk_level || (broker.riskScore > 50 ? "HIGH" : broker.riskScore > 30 ? "MEDIUM" : "LOW"),
        brokerId: broker.id,
      },
      include: { broker: true, assignedTruck: true },
    });

    // BE-C8: audit the load-creation write (money-moving route).
    await recordAudit({
      action: "load.create",
      userId: user!.sub,
      ipAddress: clientIp(req),
      entityType: "Load",
      entityId: load.id,
      metadata: { tyreCode: load.tyreCode, origin: load.origin, destination: load.destination, offeredRate: load.offeredRate },
    }).catch((e: unknown) => {
      // audit log failure should NOT fail the request
      console.error("[audit] recordAudit failed (load.create)", e);
    });

    return NextResponse.json(
      { success: true, data: serializeLoad(load) },
      { status: 201 },
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Internal error";
    if (process.env.NODE_ENV !== "production") console.error("[loads]", msg);
    return NextResponse.json(
      { success: false, error: "Internal error" },
      { status: 500 },
    );
  }
}
