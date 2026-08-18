"""Nearby-driver broadcast — Week 3 of the WhatsApp↔Telegram bridge.

When a broker broadcasts a load on Telegram, this service queries all AVAILABLE
drivers within `radius_km` of the load origin and WhatsApp each one a localized
load offer. Solves the broker's "call 10-20 drivers to find a truck" problem.
"""
from .nearby_driver_broadcast import (
    DEFAULT_RADIUS_KM,
    MAX_DRIVERS_PER_BLAST,
    BroadcastOutcome,
    BroadcastRequest,
    BroadcastResult,
    NearbyDriverBroadcastService,
)

__all__ = [
    "NearbyDriverBroadcastService",
    "BroadcastRequest",
    "BroadcastResult",
    "BroadcastOutcome",
    "DEFAULT_RADIUS_KM",
    "MAX_DRIVERS_PER_BLAST",
]
