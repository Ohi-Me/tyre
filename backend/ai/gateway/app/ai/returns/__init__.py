"""Return-load matching service — Y1 H2 feature.

Solves #1 fleet problem: 30% of truck-km run empty.
Worth ₹4-6L/year per truck in wasted diesel + opportunity cost.

How it works:
  When driver accepts Patna→Delhi load:
    1. AI simultaneously searches for Delhi→Patna return loads
    2. Predicts return-load availability N hours before delivery
    3. Shows driver: "Return load available: ₹28K, pickup tomorrow 8am Delhi,
       deliver Patna 2pm. Accept both?"
    4. One tap = both loads booked
    5. Total revenue: ₹73K instead of ₹45K (head-haul only)

Revenue: 1% take rate on return load (₹280).
Driver earns 60% more per round trip.
"""
from .return_load_matcher import ReturnLoadMatcher

__all__ = ["ReturnLoadMatcher"]
