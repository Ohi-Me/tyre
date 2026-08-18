import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireInternalService, recordAudit } from "@tyre/auth";
import { clientIp } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/trust/score — Phase 0 fix.
 *
 * `docs/ARCHITECTURE.md` §7.2: "Implementation B: the API endpoint (POST /wedge/trust/score)
 * ... Stateless: computes and returns, never writes to the TrustScore Postgres table."
 *
 * This route is the write side that closes that gap. `backend/ai/gateway`'s
 * `POST /wedge/trust/score` calls `TrustScoreService.compute_score()` (the correct
 * algorithm, kept as-is per ARCHITECTURE.md §7.4) and then calls this route via
 * `app/clients/bff_client.persist_trust_score()` to upsert the result — so a driver's
 * score from yesterday is no longer gone the next time it's computed.
 */
export async function POST(req: NextRequest) {
  const denied = requireInternalService(req);
  if (denied) return denied;

  try {
    const body = await req.json();
    const {
      entity_id, entity_type, total_score, verification_score,
      transaction_score, behavioral_score, peer_rating_score, tier, badge,
    } = body;

    if (!entity_id || !entity_type || total_score === undefined) {
      return NextResponse.json(
        { success: false, error: "entity_id, entity_type, total_score required" },
        { status: 400 },
      );
    }

    const record = await db.trustScore.upsert({
      where: { entityId_entityType: { entityId: entity_id, entityType: entity_type } },
      create: {
        entityId: entity_id,
        entityType: entity_type,
        totalScore: total_score,
        verificationScore: verification_score ?? 0,
        transactionScore: transaction_score ?? 0,
        behavioralScore: behavioral_score ?? 0,
        peerRatingScore: peer_rating_score ?? 0,
        tier: tier ?? "Unverified",
        badge: badge ?? "🔴 Unverified",
      },
      update: {
        totalScore: total_score,
        verificationScore: verification_score ?? 0,
        transactionScore: transaction_score ?? 0,
        behavioralScore: behavioral_score ?? 0,
        peerRatingScore: peer_rating_score ?? 0,
        tier: tier ?? "Unverified",
        badge: badge ?? "🔴 Unverified",
      },
    });

    // BE-C8: audit the trust-score update. The caller is an internal service
    // (the ai-gateway's bff_client), not a user, so userId is null. The audit
    // helper centralises the auditLog write + failure handling.
    await recordAudit({
      action: "trust.score.update",
      userId: null,
      ipAddress: clientIp(req),
      entityType: entity_type,
      entityId: entity_id,
      metadata: { totalScore: total_score, tier, badge },
    }).catch((e: unknown) => {
      console.error("[audit] recordAudit failed (trust.score.update)", e);
    });

    return NextResponse.json({ success: true, data: { id: record.id, updatedAt: record.updatedAt } });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Internal error";
    if (process.env.NODE_ENV !== "production") console.error("[trust/score]", msg);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
