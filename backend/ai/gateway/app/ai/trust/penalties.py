"""
Penalty & Reward Service — 15 actions that change Trust Score.

Per V2 PDF Part 3.4.
"""
from __future__ import annotations

from dataclasses import dataclass
from enum import Enum


class TrustAction(str, Enum):
    # Rewards
    LOAD_COMPLETED_ON_TIME = "load_completed_on_time"
    FIVE_STAR_RATING = "five_star_rating"
    DISPUTE_RESOLVED_FAVOR = "dispute_resolved_favor"
    CONSIGNEE_FAST_CONFIRM = "consignee_fast_confirm"
    SIX_MONTHS_NO_DISPUTES = "six_months_no_disputes"
    TWELVE_MONTHS_NO_DISPUTES = "twelve_months_no_disputes"

    # Penalties
    ONE_STAR_RATING = "one_star_rating"
    PAYMENT_DEFAULT = "payment_default"
    FAKE_LOAD = "fake_load"
    GPS_DEVIATION = "gps_deviation"
    CANCELLATION_AFTER_ACCEPT = "cancellation_after_accept"
    DISPUTE_FILED = "dispute_filed"
    TRUCK_BREAKDOWN = "truck_breakdown"
    FAKE_TRUCK = "fake_truck"
    FAKE_POD = "fake_pod"


# Score changes per action (per V2 PDF Part 3.4)
ACTION_SCORE_CHANGES = {
    # Rewards (positive)
    TrustAction.LOAD_COMPLETED_ON_TIME: 10,
    TrustAction.FIVE_STAR_RATING: 20,
    TrustAction.DISPUTE_RESOLVED_FAVOR: 30,
    TrustAction.CONSIGNEE_FAST_CONFIRM: 15,
    TrustAction.SIX_MONTHS_NO_DISPUTES: 50,
    TrustAction.TWELVE_MONTHS_NO_DISPUTES: 100,

    # Penalties (negative)
    TrustAction.ONE_STAR_RATING: -20,
    TrustAction.PAYMENT_DEFAULT: -200,
    TrustAction.FAKE_LOAD: -300,
    TrustAction.GPS_DEVIATION: -20,
    TrustAction.CANCELLATION_AFTER_ACCEPT: -30,
    TrustAction.DISPUTE_FILED: -50,
    TrustAction.TRUCK_BREAKDOWN: -40,
    TrustAction.FAKE_TRUCK: -300,
    TrustAction.FAKE_POD: -400,
}

# Actions that trigger auto-ban
AUTO_BAN_ACTIONS = {
    TrustAction.FAKE_LOAD,
    TrustAction.FAKE_TRUCK,
    TrustAction.FAKE_POD,
}

# Actions that trigger auto-suspension (score < 400)
AUTO_SUSPEND_ACTIONS = {
    TrustAction.PAYMENT_DEFAULT,
}

# Actions that trigger auto-review (3 consecutive = review)
AUTO_REVIEW_ACTIONS = {
    TrustAction.ONE_STAR_RATING,
    TrustAction.GPS_DEVIATION,
    TrustAction.CANCELLATION_AFTER_ACCEPT,
}


@dataclass
class PenaltyResult:
    action: str
    score_change: int
    new_score: int
    new_tier: str
    auto_ban: bool
    auto_suspend: bool
    auto_review: bool
    consecutive_count: int  # for auto-review tracking


class PenaltyService:
    """
    Applies penalties and rewards to Trust Score.
    Tracks consecutive actions for auto-review.

    AI-C12 fix: previously `_consecutive_tracker` was an in-memory dict that
    reset on every request (PenaltyService was instantiated per-request).
    Now uses Redis (if configured) for cross-request persistence with a 7-day
    TTL on each entity's counter. Falls back to in-memory only when Redis is
    unavailable (with a logged warning).
    """

    _REDIS_KEY_PREFIX = "tyre:penalty:consecutive:"
    _REDIS_TTL_SECONDS = 7 * 24 * 3600  # 7 days

    def __init__(self, redis_client=None):
        """Optionally inject a Redis client. If None, falls back to in-memory
        (which means auto-review will not fire across requests — logged)."""
        self._redis = redis_client
        self._consecutive_tracker: dict[str, int] = {}  # fallback only
        if self._redis is None:
            import logging
            logging.getLogger("tyre.penalty").warning(
                "PenaltyService initialized without Redis — consecutive-action "
                "auto-review will not fire across requests. Configure Redis to enable."
            )

    async def _get_consecutive(self, entity_id: str) -> int:
        if self._redis is not None:
            try:
                val = await self._redis.get(self._REDIS_KEY_PREFIX + entity_id)
                return int(val) if val else 0
            except Exception:
                pass
        return self._consecutive_tracker.get(entity_id, 0)

    async def _set_consecutive(self, entity_id: str, value: int) -> None:
        if self._redis is not None:
            try:
                if value == 0:
                    await self._redis.delete(self._REDIS_KEY_PREFIX + entity_id)
                else:
                    await self._redis.set(
                        self._REDIS_KEY_PREFIX + entity_id,
                        value,
                        ex=self._REDIS_TTL_SECONDS,
                    )
                return
            except Exception:
                pass
        self._consecutive_tracker[entity_id] = value

    async def apply_action(
        self,
        entity_id: str,
        action: TrustAction,
        current_score: int,
        rater_trust_weight: float = 1.0,
    ) -> PenaltyResult:
        """
        Apply a trust action to an entity's score.

        Returns the result with new score, tier, and any auto-actions triggered.
        """
        # Get base score change
        base_change = ACTION_SCORE_CHANGES.get(action, 0)

        # Apply rater weight for rating-based actions
        if action in (TrustAction.FIVE_STAR_RATING, TrustAction.ONE_STAR_RATING):
            score_change = int(base_change * rater_trust_weight)
        else:
            score_change = base_change

        # Compute new score (clamped 0-1000)
        new_score = max(0, min(1000, current_score + score_change))

        # Determine tier
        from .trust_score import TrustScoreService
        tier_service = TrustScoreService()
        new_tier = tier_service.get_tier_for_score(new_score).value

        # Check auto-actions
        auto_ban = action in AUTO_BAN_ACTIONS
        auto_suspend = action in AUTO_SUSPEND_ACTIONS and new_score < 400

        # Track consecutive actions for auto-review (AI-C12: Redis-backed)
        auto_review = False
        consecutive_count = 0
        if action in AUTO_REVIEW_ACTIONS:
            consecutive_count = await self._get_consecutive(entity_id) + 1
            await self._set_consecutive(entity_id, consecutive_count)
            if consecutive_count >= 3:
                auto_review = True
                await self._set_consecutive(entity_id, 0)  # reset
        else:
            # Non-review action resets the counter
            await self._set_consecutive(entity_id, 0)

        return PenaltyResult(
            action=action.value,
            score_change=score_change,
            new_score=new_score,
            new_tier=new_tier,
            auto_ban=auto_ban,
            auto_suspend=auto_suspend,
            auto_review=auto_review,
            consecutive_count=consecutive_count,
        )

    def get_action_score_change(self, action: TrustAction) -> int:
        """Get the score change for an action."""
        return ACTION_SCORE_CHANGES.get(action, 0)

    def is_auto_ban_action(self, action: TrustAction) -> bool:
        """Check if action triggers auto-ban."""
        return action in AUTO_BAN_ACTIONS

    def is_auto_suspend_action(self, action: TrustAction) -> bool:
        """Check if action triggers auto-suspend."""
        return action in AUTO_SUSPEND_ACTIONS
