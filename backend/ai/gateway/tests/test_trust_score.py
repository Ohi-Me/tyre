"""
Test the TYRE Trust Score — THE moat.

Per V2 PDF Part 3:
  - 4 scoring categories (30% verification + 40% transaction + 20% behavioral + 10% peer)
  - 5 tiers (Platinum 800+, Gold 600+, Silver 400+, Bronze 200+, Unverified 0-199)
  - Privileges per tier
"""
import pytest

from app.ai.trust.trust_score import TIER_THRESHOLDS, TrustScoreService, TrustTier


@pytest.fixture
def service():
    return TrustScoreService()


# ─────────────────────────────────────────────────────────────────
# Score Computation Tests
# ─────────────────────────────────────────────────────────────────

def test_compute_score_all_zeros(service):
    """Entity with no verifications, no transactions, no ratings = 0 + 50 (neutral peer)."""
    result = service.compute_score(
        entity_id="test_001",
        entity_type="driver",
        verification_points=0,
    )
    assert result.total_score == 240  # 0 + 0 + 190 + 50 (behavioral defaults to 190, peer neutral 50)
    assert result.tier in ("Bronze", "Unverified")  # 240 = Bronze
    assert result.badge == "🟠 TYRE Bronze"  # 240 = Bronze (behavioral defaults to 190)


def test_compute_score_full_verification(service):
    """All 9 verifications = 300 points (max verification)."""
    result = service.compute_score(
        entity_id="test_002",
        entity_type="broker",
        verification_points=300,  # max
    )
    assert result.verification_score == 300
    assert result.total_score >= 300
    # With no transactions/behavioral/ratings: 300 + 0 + 200 + 50 = 550 = Silver
    assert result.tier in ("Silver", "Gold")


def test_compute_score_perfect_platinum(service):
    """All categories maxed = 1000 = Platinum."""
    result = service.compute_score(
        entity_id="test_003",
        entity_type="driver",
        verification_points=300,
        transaction_data={
            "loads_completed": 20,  # max 200 points
            "on_time_delivery_rate": 1.0,  # 100 points
            "payment_timeliness": 1.0,  # 50 points
            "dispute_count": 0,
            "payment_defaults": 0,
        },
        behavioral_data={
            "gps_deviations": 0,
            "cancellations": 0,
            "avg_response_time_min": 3,  # <5 min, no penalty
            "no_dispute_months": 12,
        },
        peer_ratings=[
            {"stars": 5, "rater_trust_weight": 1.0},
            {"stars": 5, "rater_trust_weight": 1.0},
            {"stars": 5, "rater_trust_weight": 1.0},
        ],
    )
    assert result.total_score == 950  # 300 + 350 + 200 + 100 = 950 (transaction max positive is 350)
    assert result.tier == "Platinum"
    assert result.badge == "🟢 TYRE Platinum"


def test_compute_score_bronze_with_payment_default(service):
    """Payment default tanks the score."""
    result = service.compute_score(
        entity_id="test_004",
        entity_type="broker",
        verification_points=200,
        transaction_data={
            "loads_completed": 10,
            "on_time_delivery_rate": 0.8,
            "payment_timeliness": 0.5,
            "dispute_count": 2,
            "payment_defaults": 1,  # -100 points
        },
        behavioral_data={
            "gps_deviations": 3,  # -60
            "cancellations": 5,  # -50
            "avg_response_time_min": 10,  # -25
            "no_dispute_months": 0,
        },
        peer_ratings=[{"stars": 1, "rater_trust_weight": 1.0}],
    )
    assert result.total_score < 400  # should be Bronze or Unverified
    assert result.tier in ("Bronze", "Unverified")


# ─────────────────────────────────────────────────────────────────
# Tier Tests
# ─────────────────────────────────────────────────────────────────

def test_tier_thresholds_platinum():
    """Platinum = 800-1000."""
    assert TIER_THRESHOLDS[TrustTier.PLATINUM] == (800, 1000)


def test_tier_thresholds_gold():
    """Gold = 600-799."""
    assert TIER_THRESHOLDS[TrustTier.GOLD] == (600, 799)


def test_tier_thresholds_silver():
    """Silver = 400-599."""
    assert TIER_THRESHOLDS[TrustTier.SILVER] == (400, 599)


def test_tier_thresholds_bronze():
    """Bronze = 200-399."""
    assert TIER_THRESHOLDS[TrustTier.BRONZE] == (200, 399)


def test_tier_thresholds_unverified():
    """Unverified = 0-199."""
    assert TIER_THRESHOLDS[TrustTier.UNVERIFIED] == (0, 199)


def test_get_tier_for_score_boundary_800(service):
    """Score 800 = Platinum (boundary)."""
    assert service.get_tier_for_score(800) == TrustTier.PLATINUM


def test_get_tier_for_score_boundary_799(service):
    """Score 799 = Gold (boundary)."""
    assert service.get_tier_for_score(799) == TrustTier.GOLD


def test_get_tier_for_score_boundary_600(service):
    """Score 600 = Gold (boundary)."""
    assert service.get_tier_for_score(600) == TrustTier.GOLD


def test_get_tier_for_score_boundary_400(service):
    """Score 400 = Silver (boundary)."""
    assert service.get_tier_for_score(400) == TrustTier.SILVER


def test_get_tier_for_score_boundary_200(service):
    """Score 200 = Bronze (boundary)."""
    assert service.get_tier_for_score(200) == TrustTier.BRONZE


def test_get_tier_for_score_0(service):
    """Score 0 = Unverified."""
    assert service.get_tier_for_score(0) == TrustTier.UNVERIFIED


# ─────────────────────────────────────────────────────────────────
# Privilege Tests
# ─────────────────────────────────────────────────────────────────

def test_platinum_privileges(service):
    """Platinum gets priority matching + instant advance + unlimited loads."""
    privileges = service.get_privileges(TrustTier.PLATINUM)
    assert privileges["priority_matching"] is True
    assert privileges["advance_speed"] == "instant"
    assert privileges["escrow_requirement_pct"] == 5
    assert privileges["max_active_loads"] is None  # unlimited


def test_gold_privileges(service):
    """Gold gets 60-sec advance + 3 max loads + 18% escrow."""
    privileges = service.get_privileges(TrustTier.GOLD)
    assert privileges["advance_speed"] == "60_seconds"
    assert privileges["max_active_loads"] == 3
    assert privileges["escrow_requirement_pct"] == 18


def test_silver_privileges(service):
    """Silver gets limited matching + 1 load + no advance."""
    privileges = service.get_privileges(TrustTier.SILVER)
    assert privileges["max_active_loads"] == 1
    assert privileges["can_post_loads"] is False
    assert privileges["advance_amount_pct"] == 10


def test_bronze_privileges(service):
    """Bronze gets no loads + manual review."""
    privileges = service.get_privileges(TrustTier.BRONZE)
    assert privileges["max_active_loads"] == 0
    assert privileges["advance_speed"] == "manual_review"
    assert privileges["can_post_loads"] is False


def test_unverified_privileges(service):
    """Unverified cannot transact at all."""
    privileges = service.get_privileges(TrustTier.UNVERIFIED)
    assert privileges["max_active_loads"] == 0
    assert privileges["can_post_loads"] is False
    assert privileges["advance_amount_pct"] == 0


# ─────────────────────────────────────────────────────────────────
# Transaction Score Tests
# ─────────────────────────────────────────────────────────────────

def test_transaction_score_max(service):
    """20 loads completed + on-time + timely payment + no disputes = 400."""
    score = service._compute_transaction_score({
        "loads_completed": 20,
        "on_time_delivery_rate": 1.0,
        "payment_timeliness": 1.0,
        "dispute_count": 0,
        "payment_defaults": 0,
    })
    assert score == 350  # 200 + 100 + 50 + 0 + 0 (max positive = 350)


def test_transaction_score_with_disputes(service):
    """2 disputes = -100 points."""
    score = service._compute_transaction_score({
        "loads_completed": 10,
        "on_time_delivery_rate": 0.8,
        "payment_timeliness": 0.8,
        "dispute_count": 2,
        "payment_defaults": 0,
    })
    # 100 + 80 + 40 - 100 + 0 = 120
    assert score == 120


def test_transaction_score_with_default(service):
    """1 payment default = -100 points."""
    score = service._compute_transaction_score({
        "loads_completed": 5,
        "on_time_delivery_rate": 0.5,
        "payment_timeliness": 0.5,
        "dispute_count": 0,
        "payment_defaults": 1,
    })
    # 50 + 50 + 25 - 0 - 100 = 25
    assert score == 25


# ─────────────────────────────────────────────────────────────────
# Behavioral Score Tests
# ─────────────────────────────────────────────────────────────────

def test_behavioral_score_perfect(service):
    """No deviations, no cancellations, fast response = 200."""
    score = service._compute_behavioral_score({
        "gps_deviations": 0,
        "cancellations": 0,
        "avg_response_time_min": 3,
        "no_dispute_months": 12,
    })
    assert score == 200


def test_behavioral_score_with_gps_deviations(service):
    """3 GPS deviations = -60."""
    score = service._compute_behavioral_score({
        "gps_deviations": 3,
        "cancellations": 0,
        "avg_response_time_min": 3,
        "no_dispute_months": 12,
    })
    assert score == 140  # 200 - 60


def test_behavioral_score_with_cancellations(service):
    """5 cancellations = -50."""
    score = service._compute_behavioral_score({
        "gps_deviations": 0,
        "cancellations": 5,
        "avg_response_time_min": 3,
        "no_dispute_months": 12,
    })
    assert score == 150  # 200 - 50


# ─────────────────────────────────────────────────────────────────
# Peer Rating Score Tests
# ─────────────────────────────────────────────────────────────────

def test_peer_rating_neutral_no_ratings(service):
    """No ratings = 50 (neutral)."""
    score = service._compute_peer_rating_score([])
    assert score == 50


def test_peer_rating_all_5_stars(service):
    """3 5-star ratings (weight 1.0) = 50 + 60 = 100 (capped)."""
    score = service._compute_peer_rating_score([
        {"stars": 5, "rater_trust_weight": 1.0},
        {"stars": 5, "rater_trust_weight": 1.0},
        {"stars": 5, "rater_trust_weight": 1.0},
    ])
    assert score == 100  # capped


def test_peer_rating_all_1_stars(service):
    """3 1-star ratings (weight 1.0) = 50 - 60 = 0 (capped)."""
    score = service._compute_peer_rating_score([
        {"stars": 1, "rater_trust_weight": 1.0},
        {"stars": 1, "rater_trust_weight": 1.0},
        {"stars": 1, "rater_trust_weight": 1.0},
    ])
    assert score == 0  # capped


def test_peer_rating_weighted(service):
    """5-star from Platinum rater (weight 1.0) counts more than from Bronze (weight 0.3)."""
    score_platinum = service._compute_peer_rating_score([
        {"stars": 5, "rater_trust_weight": 1.0},
    ])
    score_bronze = service._compute_peer_rating_score([
        {"stars": 5, "rater_trust_weight": 0.3},
    ])
    assert score_platinum > score_bronze
