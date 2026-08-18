"""
Test the Penalty & Reward Service — 15 actions.

The source `PenaltyService.apply_action` is async (uses Redis-backed
consecutive-action tracking via `await self._get_consecutive`), so all tests
that call `apply_action` must be `@pytest.mark.asyncio` and `await` the result.
"""
import pytest

from app.ai.trust.penalties import (
    ACTION_SCORE_CHANGES,
    AUTO_BAN_ACTIONS,
    PenaltyService,
    TrustAction,
)


@pytest.fixture
def service():
    return PenaltyService()


# ─────────────────────────────────────────────────────────────────
# Score Change Tests
# ─────────────────────────────────────────────────────────────────

def test_load_completed_on_time_is_plus_10():
    """On-time load completion = +10."""
    assert ACTION_SCORE_CHANGES[TrustAction.LOAD_COMPLETED_ON_TIME] == 10


def test_five_star_rating_is_plus_20():
    """5-star rating = +20."""
    assert ACTION_SCORE_CHANGES[TrustAction.FIVE_STAR_RATING] == 20


def test_one_star_rating_is_minus_20():
    """1-star rating = -20."""
    assert ACTION_SCORE_CHANGES[TrustAction.ONE_STAR_RATING] == -20


def test_payment_default_is_minus_200():
    """Payment default = -200."""
    assert ACTION_SCORE_CHANGES[TrustAction.PAYMENT_DEFAULT] == -200


def test_fake_load_is_minus_300():
    """Fake load = -300."""
    assert ACTION_SCORE_CHANGES[TrustAction.FAKE_LOAD] == -300


def test_fake_pod_is_minus_400():
    """Fake POD = -400 (highest penalty)."""
    assert ACTION_SCORE_CHANGES[TrustAction.FAKE_POD] == -400


def test_twelve_months_no_disputes_is_plus_100():
    """12 months clean = +100 (highest reward)."""
    assert ACTION_SCORE_CHANGES[TrustAction.TWELVE_MONTHS_NO_DISPUTES] == 100


# ─────────────────────────────────────────────────────────────────
# Auto-Ban Tests
# ─────────────────────────────────────────────────────────────────

def test_fake_load_triggers_auto_ban():
    """Fake load = auto-ban."""
    assert TrustAction.FAKE_LOAD in AUTO_BAN_ACTIONS


def test_fake_truck_triggers_auto_ban():
    """Fake truck = auto-ban."""
    assert TrustAction.FAKE_TRUCK in AUTO_BAN_ACTIONS


def test_fake_pod_triggers_auto_ban():
    """Fake POD = auto-ban."""
    assert TrustAction.FAKE_POD in AUTO_BAN_ACTIONS


def test_load_completed_does_not_trigger_auto_ban():
    """Load completed = no auto-ban."""
    assert TrustAction.LOAD_COMPLETED_ON_TIME not in AUTO_BAN_ACTIONS


# ─────────────────────────────────────────────────────────────────
# Apply Action Tests (async — apply_action awaits Redis calls)
# ─────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_apply_reward_increases_score(service):
    """Reward action increases score."""
    result = await service.apply_action(
        entity_id="test_001",
        action=TrustAction.LOAD_COMPLETED_ON_TIME,
        current_score=500,
    )
    assert result.score_change == 10
    assert result.new_score == 510
    assert result.auto_ban is False


@pytest.mark.asyncio
async def test_apply_penalty_decreases_score(service):
    """Penalty action decreases score."""
    result = await service.apply_action(
        entity_id="test_002",
        action=TrustAction.ONE_STAR_RATING,
        current_score=500,
    )
    assert result.score_change == -20
    assert result.new_score == 480


@pytest.mark.asyncio
async def test_apply_fake_load_auto_ban(service):
    """Fake load triggers auto-ban."""
    result = await service.apply_action(
        entity_id="test_003",
        action=TrustAction.FAKE_LOAD,
        current_score=800,
    )
    assert result.auto_ban is True
    assert result.new_score == 500  # 800 - 300


@pytest.mark.asyncio
async def test_apply_payment_default_auto_suspend(service):
    """Payment default with score <400 triggers auto-suspend."""
    result = await service.apply_action(
        entity_id="test_004",
        action=TrustAction.PAYMENT_DEFAULT,
        current_score=300,  # below 400
    )
    assert result.auto_suspend is True
    assert result.new_score == 100  # 300 - 200


@pytest.mark.asyncio
async def test_apply_payment_default_no_suspend_if_high_score(service):
    """Payment default with score >400 does NOT trigger auto-suspend."""
    result = await service.apply_action(
        entity_id="test_005",
        action=TrustAction.PAYMENT_DEFAULT,
        current_score=800,
    )
    assert result.auto_suspend is False  # score 600 still above 400


@pytest.mark.asyncio
async def test_score_clamped_at_0(service):
    """Score cannot go below 0."""
    result = await service.apply_action(
        entity_id="test_006",
        action=TrustAction.FAKE_POD,  # -400
        current_score=100,
    )
    assert result.new_score == 0  # clamped


@pytest.mark.asyncio
async def test_score_clamped_at_1000(service):
    """Score cannot go above 1000."""
    result = await service.apply_action(
        entity_id="test_007",
        action=TrustAction.TWELVE_MONTHS_NO_DISPUTES,  # +100
        current_score=950,
    )
    assert result.new_score == 1000  # clamped


# ─────────────────────────────────────────────────────────────────
# Consecutive Auto-Review Tests
# ─────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_three_consecutive_one_star_triggers_auto_review(service):
    """3 consecutive 1-star ratings = auto-review."""
    entity_id = "test_consecutive"
    await service.apply_action(entity_id, TrustAction.ONE_STAR_RATING, 500)
    await service.apply_action(entity_id, TrustAction.ONE_STAR_RATING, 480)
    result = await service.apply_action(entity_id, TrustAction.ONE_STAR_RATING, 460)
    assert result.auto_review is True
    assert result.consecutive_count == 3


@pytest.mark.asyncio
async def test_non_review_action_resets_counter(service):
    """A non-review action resets the consecutive counter."""
    entity_id = "test_reset"
    await service.apply_action(entity_id, TrustAction.ONE_STAR_RATING, 500)
    await service.apply_action(entity_id, TrustAction.ONE_STAR_RATING, 480)
    # Non-review action resets
    await service.apply_action(entity_id, TrustAction.LOAD_COMPLETED_ON_TIME, 460)
    # Now 1-star again — counter should be 1, not 3
    result = await service.apply_action(entity_id, TrustAction.ONE_STAR_RATING, 470)
    assert result.auto_review is False
    assert result.consecutive_count == 1


# ─────────────────────────────────────────────────────────────────
# Rater Weight Tests
# ─────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_rater_weight_affects_rating_score_change(service):
    """5-star from Platinum rater (weight 1.0) = full +20."""
    result = await service.apply_action(
        entity_id="test_weighted",
        action=TrustAction.FIVE_STAR_RATING,
        current_score=500,
        rater_trust_weight=1.0,
    )
    assert result.score_change == 20


@pytest.mark.asyncio
async def test_rater_weight_reduces_score_change(service):
    """5-star from Bronze rater (weight 0.3) = +6 (0.3 * 20)."""
    result = await service.apply_action(
        entity_id="test_weighted_low",
        action=TrustAction.FIVE_STAR_RATING,
        current_score=500,
        rater_trust_weight=0.3,
    )
    assert result.score_change == 6  # int(20 * 0.3) = 6


# ─────────────────────────────────────────────────────────────────
# Tier Change Tests
# ─────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_penalty_can_demote_tier(service):
    """Large penalty can demote from Gold to Silver."""
    result = await service.apply_action(
        entity_id="test_demote",
        action=TrustAction.PAYMENT_DEFAULT,  # -200
        current_score=650,  # Gold
    )
    assert result.new_score == 450  # Silver
    assert result.new_tier == "Silver"


@pytest.mark.asyncio
async def test_reward_can_promote_tier(service):
    """Large reward can promote from Gold to Platinum."""
    result = await service.apply_action(
        entity_id="test_promote",
        action=TrustAction.TWELVE_MONTHS_NO_DISPUTES,  # +100
        current_score=750,  # Gold
    )
    assert result.new_score == 850  # Platinum
    assert result.new_tier == "Platinum"
