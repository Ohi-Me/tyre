import { NextRequest, NextResponse } from "next/server";
import { runPricingAgent } from "@/lib/tyre/ai-service";
import { requireRole, rateLimitOrNull } from "@tyre/auth";
import { clientIp } from "@/lib/http";

export const dynamic = "force-dynamic";


// POST /api/v1/pricing — standalone AI pricing calculation
export async function POST(req: NextRequest) {
  const limited = await rateLimitOrNull("ai", clientIp(req));
  if (limited) return NextResponse.json(limited.body, { status: limited.status });

  const { user, response } = requireRole(req, "pricing:read");
  if (response) return response;

  try {
    const body = await req.json();
    if (!body.origin || !body.destination || !body.distance_km) {
      return NextResponse.json(
        { success: false, error: "origin, destination, distance_km required" },
        { status: 400 },
      );
    }
    const result = await runPricingAgent({
      origin: body.origin,
      destination: body.destination,
      distance_km: Number(body.distance_km),
      truck_type: body.truck_type || "HXL (32ft)",
      weight_tons: Number(body.weight_tons) || 10,
      goods_type: body.goods_type || "General",
    });
    return NextResponse.json({ success: true, data: result });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Internal error";
    if (process.env.NODE_ENV !== "production") console.error("[pricing]", msg);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
