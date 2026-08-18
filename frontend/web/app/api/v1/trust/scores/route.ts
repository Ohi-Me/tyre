import { NextRequest, NextResponse } from "next/server";
// Read replica (TYRE v1.1 item #9): trust score lookups are reads — use the replica.
import { dbRead as db } from "@/lib/db";
import { rateLimitOrNull } from "@tyre/auth";
import { requireUser } from "@/lib/api/require-user";
import { clientIp } from "@/lib/http";

export const dynamic = "force-dynamic";


/**
 * GET /api/v1/trust/scores?ids=a,b,c — Phase 0 fix.
 *
 * `docs/ARCHITECTURE.md` §7.3: "Implementation C: the frontend ... renders trust scores
 * from hardcoded static numbers (trustScore: 91, 87, 95...). Does not fetch from
 * Implementation B. Does not read the TrustScore table." This route is what
 * `frontend/web/components/tyre/app/views/trust.tsx` now fetches instead — real persisted
 * rows from `POST /api/v1/trust/score`'s writes. If `ids` is omitted, returns the
 * highest-scoring entities network-wide (used for "Top trusted drivers").
 */
export async function GET(req: NextRequest) {
  const limited = await rateLimitOrNull("standard", clientIp(req));
  if (limited) return NextResponse.json(limited.body, { status: limited.status });

  // C1 (audit): the full network reputation list is not public — require a valid
  // user. Trust scores are cross-org reputation by design (TrustScore has no orgId),
  // so any authenticated participant may read them, but anonymous callers may not.
  const { response } = requireUser(req);
  if (response) return response;

  try {
    const idsParam = req.nextUrl.searchParams.get("ids");
    const entityType = (req.nextUrl.searchParams.get("entity_type") || undefined) as any;

    const scores = idsParam
      ? await db.trustScore.findMany({
          where: { entityId: { in: idsParam.split(",").filter(Boolean) }, ...(entityType ? { entityType } : {}) },
        })
      : await db.trustScore.findMany({
          where: entityType ? { entityType } : undefined,
          orderBy: { totalScore: "desc" },
          take: 50,
        });

    return NextResponse.json({
      success: true,
      data: scores.map((s: any) => ({
        entity_id: s.entityId,
        entity_type: s.entityType,
        total_score: s.totalScore,
        tier: s.tier,
        badge: s.badge,
        breakdown: {
          verification_score: s.verificationScore,
          transaction_score: s.transactionScore,
          behavioral_score: s.behavioralScore,
          peer_rating_score: s.peerRatingScore,
        },
        computed_at: s.computedAt,
        updated_at: s.updatedAt,
      })),
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Internal error";
    if (process.env.NODE_ENV !== "production") console.error("[trust/scores]", msg);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
