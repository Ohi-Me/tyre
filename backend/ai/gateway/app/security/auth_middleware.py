"""
Auth Middleware — role-based access control for all API endpoints.

Per V2 PDF: Trust Score tier determines what actions are allowed.
"""
from __future__ import annotations

from dataclasses import dataclass

from fastapi import HTTPException


@dataclass
class AuthContext:
    entity_id: str
    entity_type: str  # driver | broker | shipper | fleet | operator
    trust_tier: str   # Platinum | Gold | Silver | Bronze | Unverified
    trust_score: int
    phone: str
    is_authenticated: bool = True


class AuthMiddleware:
    """
    Role-based + Trust-tier-based access control.

    Rules:
      - Unverified: cannot transact. Can only browse loads + onboard.
      - Bronze: no auto-matching. Manual review.
      - Silver: limited matching (1 active load). No advance.
      - Gold: standard matching (3 active loads). 60-sec advance.
      - Platinum: priority matching (unlimited loads). Instant advance.
    """

    # Action requirements: minimum tier needed
    ACTION_REQUIREMENTS = {
        "browse_loads": "Unverified",      # anyone can browse
        "onboard": "Unverified",           # anyone can onboard
        "accept_load": "Gold",             # need Gold to accept
        "post_load": "Gold",               # broker needs Gold to post
        "receive_advance": "Gold",         # need Gold for 60-sec advance
        "instant_advance": "Platinum",     # Platinum gets instant
        "bulk_post": "Platinum",           # Platinum can bulk post
        "priority_matching": "Platinum",   # Platinum gets priority
        "view_analytics": "Gold",          # need Gold for analytics
        "manage_fleet": "Gold",            # fleet owner needs Gold
        "file_dispute": "Gold",            # need Gold to file dispute
        "auto_match": "Gold",              # need Gold for auto-matching
    }

    TIER_LEVELS = {
        "Unverified": 0,
        "Bronze": 1,
        "Silver": 2,
        "Gold": 3,
        "Platinum": 4,
    }

    def can_perform(self, action: str, auth_ctx: AuthContext) -> bool:
        """Check if entity can perform an action based on trust tier."""
        required_tier = self.ACTION_REQUIREMENTS.get(action, "Gold")
        required_level = self.TIER_LEVELS.get(required_tier, 3)
        entity_level = self.TIER_LEVELS.get(auth_ctx.trust_tier, 0)
        return entity_level >= required_level

    def enforce(self, action: str, auth_ctx: AuthContext) -> None:
        """Enforce permission. Raises HTTPException if not allowed."""
        if not auth_ctx.is_authenticated:
            raise HTTPException(status_code=401, detail="Authentication required")
        if not self.can_perform(action, auth_ctx):
            raise HTTPException(
                status_code=403,
                detail=f"Trust tier '{auth_ctx.trust_tier}' cannot perform '{action}'. "
                       f"Required: {self.ACTION_REQUIREMENTS.get(action, 'Gold')}. "
                       f"Current score: {auth_ctx.trust_score}."
            )

    def get_max_active_loads(self, trust_tier: str) -> int:
        """Get max concurrent active loads for a tier."""
        limits = {
            "Platinum": 999,  # unlimited
            "Gold": 3,
            "Silver": 1,
            "Bronze": 0,
            "Unverified": 0,
        }
        return limits.get(trust_tier, 0)

    def get_escrow_requirement_pct(self, trust_tier: str) -> float:
        """Get escrow funding percentage required for a tier."""
        requirements = {
            "Platinum": 5.0,   # 5% of load value
            "Gold": 18.0,      # 18% (standard advance)
            "Silver": 25.0,    # 25%
            "Bronze": 30.0,    # 30%
            "Unverified": 100.0,  # 100% (full escrow)
        }
        return requirements.get(trust_tier, 100.0)
