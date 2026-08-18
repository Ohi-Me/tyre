"""
Trust Score Service — computes 0-1000 score per entity.

4 categories (per V2 PDF Part 3.2):
  - Verification (static): 30% = 300 points
  - Transaction history (dynamic): 40% = 400 points
  - Behavioral signals: 20% = 200 points
  - Peer ratings: 10% = 100 points

5 tiers (per V2 PDF Part 3.3):
  - Platinum: 800-1000
  - Gold: 600-799
  - Silver: 400-599
  - Bronze: 200-399
  - Unverified: 0-199
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import UTC, datetime
from enum import Enum

# Score decay (TYRE v1.1 item #10) — a driver who was Platinum 18 months ago and
# has gone quiet must not still read as Platinum once trust gates escrow funding
# (Phase 2) or lending (Phase 7). Only the transaction component decays: verification
# is a fact (KYC doesn't expire on a 90-day clock), so decaying it would be wrong.
DECAY_HALF_LIFE_DAYS = 90  # transaction_score halves after 90 days of no activity


def apply_transaction_decay(transaction_score: int, last_transaction_date: datetime | None) -> int:
    """Exponentially decay the transaction component toward 0 based on days since the
    entity's last transaction. Returns the decayed score (int, 0-400).

    decay_factor = 0.5 ** (days_since / HALF_LIFE). No transactions ever → no decay
    applied (nothing to decay from); a missing date is treated as "no activity known"
    and left untouched so a brand-new entity isn't penalised before its first trip.
    """
    if last_transaction_date is None:
        return transaction_score
    if last_transaction_date.tzinfo is None:
        last_transaction_date = last_transaction_date.replace(tzinfo=UTC)
    days_since = max(0, (datetime.now(UTC) - last_transaction_date).days)
    decay_factor = math.pow(0.5, days_since / DECAY_HALF_LIFE_DAYS)
    return int(round(transaction_score * decay_factor))


class TrustTier(str, Enum):
    PLATINUM = "Platinum"
    GOLD = "Gold"
    SILVER = "Silver"
    BRONZE = "Bronze"
    UNVERIFIED = "Unverified"


# Tier thresholds (per V2 PDF Part 3.3)
TIER_THRESHOLDS = {
    TrustTier.PLATINUM: (800, 1000),
    TrustTier.GOLD: (600, 799),
    TrustTier.SILVER: (400, 599),
    TrustTier.BRONZE: (200, 399),
    TrustTier.UNVERIFIED: (0, 199),
}

# Tier privileges (per V2 PDF Part 3.3)
TIER_PRIVILEGES = {
    TrustTier.PLATINUM: {
        "badge": "🟢 TYRE Platinum",
        "priority_matching": True,
        "advance_speed": "instant",
        "escrow_requirement_pct": 5,
        "max_active_loads": None,  # unlimited
        "can_post_loads": True,
        "advance_amount_pct": 18,
    },
    TrustTier.GOLD: {
        "badge": "🟡 TYRE Gold",
        "priority_matching": False,
        "advance_speed": "60_seconds",
        "escrow_requirement_pct": 18,
        "max_active_loads": 3,
        "can_post_loads": True,
        "advance_amount_pct": 18,
    },
    TrustTier.SILVER: {
        "badge": "⚪ TYRE Silver",
        "priority_matching": False,
        "advance_speed": "5_minutes",
        "escrow_requirement_pct": 25,
        "max_active_loads": 1,
        "can_post_loads": False,
        "advance_amount_pct": 10,
    },
    TrustTier.BRONZE: {
        "badge": "🟠 TYRE Bronze",
        "priority_matching": False,
        "advance_speed": "manual_review",
        "escrow_requirement_pct": 30,
        "max_active_loads": 0,  # must complete verifications first
        "can_post_loads": False,
        "advance_amount_pct": 0,  # no advance
    },
    TrustTier.UNVERIFIED: {
        "badge": "🔴 Unverified",
        "priority_matching": False,
        "advance_speed": "none",
        "escrow_requirement_pct": 100,
        "max_active_loads": 0,
        "can_post_loads": False,
        "advance_amount_pct": 0,
    },
}


@dataclass
class TrustScoreBreakdown:
    entity_id: str
    entity_type: str  # driver | broker | shipper | fleet
    total_score: int  # 0-1000
    tier: str
    badge: str
    verification_score: int  # 0-300
    transaction_score: int  # 0-400
    behavioral_score: int  # 0-200
    peer_rating_score: int  # 0-100
    privileges: dict
    computed_at: str


class TrustScoreService:
    """
    Computes the TYRE Trust Score for any entity.

    Score = verification (30%) + transaction (40%) + behavioral (20%) + peer (10%)
    """

    def compute_score(
        self,
        entity_id: str,
        entity_type: str,
        verification_points: int = 0,
        transaction_data: dict | None = None,
        behavioral_data: dict | None = None,
        peer_ratings: list | None = None,
        last_transaction_date: datetime | None = None,
    ) -> TrustScoreBreakdown:
        """Compute full Trust Score from all 4 categories.

        `last_transaction_date` (optional) enables time decay on the transaction
        component (TYRE v1.1 item #10) so stale activity yields a lower tier. If not
        provided, it's read from `transaction_data["last_transaction_date"]` when present.
        """
        import time

        # 1. Verification score (0-300)
        verification_score = min(verification_points, 300)

        # 2. Transaction score (0-400), with time decay applied
        transaction_score = self._compute_transaction_score(transaction_data or {})
        if last_transaction_date is None and transaction_data:
            last_transaction_date = transaction_data.get("last_transaction_date")
        transaction_score = apply_transaction_decay(transaction_score, last_transaction_date)

        # 3. Behavioral score (0-200)
        behavioral_score = self._compute_behavioral_score(behavioral_data or {})

        # 4. Peer rating score (0-100)
        peer_rating_score = self._compute_peer_rating_score(peer_ratings or [])

        # Total
        total = verification_score + transaction_score + behavioral_score + peer_rating_score
        total = max(0, min(1000, total))  # clamp 0-1000

        # Tier
        tier = self._get_tier(total)
        privileges = TIER_PRIVILEGES[tier]

        return TrustScoreBreakdown(
            entity_id=entity_id,
            entity_type=entity_type,
            total_score=total,
            tier=tier.value,
            badge=privileges["badge"],
            verification_score=verification_score,
            transaction_score=transaction_score,
            behavioral_score=behavioral_score,
            peer_rating_score=peer_rating_score,
            privileges=privileges,
            computed_at=str(int(time.time())),
        )

    def _compute_transaction_score(self, data: dict) -> int:
        """
        Transaction history → 0-400 points.

        Inputs:
          - loads_completed: int (capped at 200, +10 each)
          - on_time_delivery_rate: float 0-1 (max 100 points)
          - payment_timeliness: float 0-1 (max 50 points)
          - dispute_count: int (-50 per dispute, max -100)
          - payment_defaults: int (-100 per default)
        """
        score = 0

        # Completed loads: +10 each, capped at 200
        loads_completed = min(data.get("loads_completed", 0), 20)
        score += loads_completed * 10

        # On-time delivery rate: max 100 points
        on_time_rate = data.get("on_time_delivery_rate", 0)
        score += int(on_time_rate * 100)

        # Payment timeliness: max 50 points
        payment_timeliness = data.get("payment_timeliness", 0)
        score += int(payment_timeliness * 50)

        # Disputes: -50 each, max -100
        disputes = data.get("dispute_count", 0)
        score -= min(disputes * 50, 100)

        # Payment defaults: -100 each
        defaults = data.get("payment_defaults", 0)
        score -= defaults * 100

        return max(0, min(400, score))

    def _compute_behavioral_score(self, data: dict) -> int:
        """
        Behavioral signals → 0-200 points.

        Inputs:
          - gps_deviations: int (-20 each, max -60)
          - cancellations: int (-10 each, max -50)
          - avg_response_time_min: float (max 50 points for <5 min)
          - route_compliance: float 0-1 (max 80 points)
          - no_dispute_months: int (max 50 points)
        """
        score = 200  # start at max, deduct for bad behavior

        # GPS deviations: -20 each, max -60
        gps_dev = data.get("gps_deviations", 0)
        score -= min(gps_dev * 20, 60)

        # Cancellations: -10 each, max -50
        cancellations = data.get("cancellations", 0)
        score -= min(cancellations * 10, 50)

        # Response time: max 50 points for <5 min (already included in base 200)
        # If response time >5 min, deduct
        avg_response = data.get("avg_response_time_min", 5)
        if avg_response > 5:
            score -= min(int((avg_response - 5) * 5), 30)

        # No dispute months: +bonus (already in base, but add more)
        no_dispute_months = data.get("no_dispute_months", 0)
        if no_dispute_months >= 6:
            score += 0  # already at max
        elif no_dispute_months < 3:
            score -= 10  # recent disputes

        return max(0, min(200, score))

    def _compute_peer_rating_score(self, ratings: list) -> int:
        """
        Peer ratings → 0-100 points.

        Each rating: 1-5 stars.
        5-star = +20, 1-star = -20.
        Weighted by rater's own trust score (higher-trust rater = more weight).
        Capped at 0-100.
        """
        if not ratings:
            return 50  # neutral if no ratings

        score = 50  # start neutral
        for rating in ratings:
            stars = rating.get("stars", 3)
            rater_weight = rating.get("rater_trust_weight", 1.0)  # 0-1

            if stars == 5:
                score += int(20 * rater_weight)
            elif stars == 4:
                score += int(10 * rater_weight)
            elif stars == 3:
                score += 0
            elif stars == 2:
                score -= int(10 * rater_weight)
            elif stars == 1:
                score -= int(20 * rater_weight)

        return max(0, min(100, score))

    def _get_tier(self, score: int) -> TrustTier:
        """Map score to tier."""
        for tier, (low, high) in TIER_THRESHOLDS.items():
            if low <= score <= high:
                return tier
        return TrustTier.UNVERIFIED

    def get_tier_for_score(self, score: int) -> TrustTier:
        """Public API for tier lookup."""
        return self._get_tier(score)

    def get_privileges(self, tier: TrustTier) -> dict:
        """Get privileges for a tier."""
        return TIER_PRIVILEGES[tier]
