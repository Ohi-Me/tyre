import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireInternalService } from "@tyre/auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/drivers/nearby?lat=&lng=&radius_km=&truck_type=&tyre_code=
 *
 * Internal-service route called by the broadcast service (Week 3 of the
 * WhatsApp↔Telegram bridge). Returns all AVAILABLE drivers within `radius_km`
 * of (lat, lng), sorted by distance ascending, each enriched with:
 *   - distance_km (haversine, computed server-side)
 *   - the broadcast load's destination/rate/advance (when `tyre_code` is
 *     provided) so the WhatsApp offer is self-contained
 *
 * Anti-spam: drivers who have received ≥5 broadcasts in the last hour are
 * filtered out (queried from BroadcastLog.outcomes JSON). This is the
 * per-driver rate limit; the per-load limit (≤3 broadcasts/10min) is enforced
 * by GET /api/v1/loads/[code]/broadcast-allowed.
 *
 * No PostGIS dependency — the query is a bounding-box pre-filter in SQL
 * (current_lat/current_lng BETWEEN min/max) followed by an in-app haversine
 * distance check. Correct for the 50km radii Y1 uses; PostGIS is the right
 * answer at 10K+ drivers.
 */

// Haversine distance in km between two lat/lng points.
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371; // Earth radius in km
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export async function GET(req: NextRequest) {
  const denied = requireInternalService(req);
  if (denied) return denied;

  const latStr = req.nextUrl.searchParams.get("lat");
  const lngStr = req.nextUrl.searchParams.get("lng");
  const radiusStr = req.nextUrl.searchParams.get("radius_km") || "50";
  const truckType = req.nextUrl.searchParams.get("truck_type") || undefined;
  const tyreCode = req.nextUrl.searchParams.get("tyre_code") || undefined;

  if (!latStr || !lngStr) {
    return NextResponse.json(
      { success: false, error: "lat and lng query params are required" },
      { status: 400 },
    );
  }
  const lat = parseFloat(latStr);
  const lng = parseFloat(lngStr);
  const radiusKm = Math.max(5, Math.min(200, parseInt(radiusStr, 10) || 50));
  if (Number.isNaN(lat) || Number.isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return NextResponse.json(
      { success: false, error: "lat/lng must be valid coordinates" },
      { status: 400 },
    );
  }

  // Bounding box: ±(radius_km / 111) degrees for lat, ±(radius_km / (111 * cos(lat))) for lng.
  // 111 km ≈ 1 degree of latitude. This is an approximation (ignores Earth's
  // ellipsoid shape) but is well within the 50km radii we use — the haversine
  // filter below removes false positives from the box edges.
  const latDelta = radiusKm / 111;
  const lngDelta = radiusKm / (111 * Math.cos((lat * Math.PI) / 180));
  const minLat = lat - latDelta;
  const maxLat = lat + latDelta;
  const minLng = lng - lngDelta;
  const maxLng = lng + lngDelta;

  // ── Fetch load context (if tyre_code provided) so we can enrich each driver ──
  let loadContext: {
    destination: string;
    offered_rate: number;
    advance_offered: number;
    truck_type_req: string;
  } | null = null;
  if (tyreCode) {
    const load = await db.load.findFirst({
      where: { tyreCode },
      select: {
        destination: true,
        offeredRate: true,
        advanceOffered: true,
        truckTypeReq: true,
      },
    });
    if (load) {
      loadContext = {
        destination: load.destination,
        offered_rate: load.offeredRate,
        advance_offered: load.advanceOffered,
        truck_type_req: load.truckTypeReq,
      };
    }
  }

  // ── Bounding-box pre-filter in SQL ──
  // Only AVAILABLE drivers with current_lat/lng inside the box. The composite
  // index on (status, current_lat, current_lng) backs this query.
  const candidates = await db.driver.findMany({
    where: {
      status: "AVAILABLE",
      deletedAt: null,
      currentLat: { gte: minLat, lte: maxLat },
      currentLng: { gte: minLng, lte: maxLng },
      ...(truckType ? { truckType: truckType } : {}),
    },
    select: {
      id: true,
      name: true,
      phone: true,
      preferredLang: true,
      truckType: true,
      currentLat: true,
      currentLng: true,
      rating: true,
      totalTrips: true,
    },
    take: 200, // hard cap on candidates — haversine filter narrows from here
  });

  // ── Haversine filter + distance sort ──
  const withDistance = candidates
    .map((d: any) => ({
      ...d,
      distance_km: haversineKm(lat, lng, d.currentLat!, d.currentLng!),
    }))
    .filter((d: any) => d.distance_km <= radiusKm)
    .sort((a: any, b: any) => a.distance_km - b.distance_km);

  // ── Per-driver anti-spam: ≤5 broadcasts/hour ──
  // Query BroadcastLog.outcomes for this driver's phone in the last hour.
  // Prisma can't query inside JSON portably, so we fetch recent broadcasts and
  // count phone occurrences in JS. The recent-broadcast window is small (1 hour,
  // typically <50 rows) so this is cheap.
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const recentBroadcasts = await db.broadcastLog.findMany({
    where: { createdAt: { gte: oneHourAgo } },
    select: { outcomes: true },
  });
  // Build a phone → count map from the outcomes JSON
  const phoneCounts = new Map<string, number>();
  for (const b of recentBroadcasts) {
    try {
      const outcomes = JSON.parse(b.outcomes || "[]") as Array<{
        phone?: string;
        status?: string;
      }>;
      for (const o of outcomes) {
        if (o.phone && o.status !== "skipped") {
          phoneCounts.set(o.phone, (phoneCounts.get(o.phone) || 0) + 1);
        }
      }
    } catch {
      // malformed outcomes JSON — skip this row
    }
  }
  const DRIVER_BROADCAST_HOURLY_LIMIT = 5;
  const filtered = withDistance.filter((d: any) => {
    const count = phoneCounts.get(d.phone) || 0;
    return count < DRIVER_BROADCAST_HOURLY_LIMIT;
  });

  // ── Enrich with load context + serialize ──
  const drivers = filtered.slice(0, 50).map((d: any) => ({
    id: d.id,
    name: d.name,
    phone: d.phone,
    preferred_lang: d.preferredLang,
    truck_type: d.truckType,
    rating: d.rating,
    total_trips: d.totalTrips,
    distance_km: Math.round(d.distance_km * 100) / 100, // 2 decimal places
    destination: loadContext?.destination ?? null,
    rate_inr: loadContext?.offered_rate ?? null,
    advance_inr: loadContext?.advance_offered ?? null,
    truck_type_req: loadContext?.truck_type_req ?? null,
  }));

  return NextResponse.json({
    success: true,
    data: {
      origin: { lat, lng, radius_km: radiusKm },
      truck_type_filter: truckType || null,
      tyre_code: tyreCode || null,
      candidates_in_box: candidates.length,
      drivers_after_haversine: withDistance.length,
      drivers_after_rate_limit: filtered.length,
      drivers: drivers,
    },
  });
}
