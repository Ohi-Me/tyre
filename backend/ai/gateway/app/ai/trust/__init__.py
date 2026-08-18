"""
TYRE Trust Score — THE moat.

9 verifications + transaction history + behavioral signals + peer ratings.
0-1000 score. 5 tiers. 15 penalty/reward actions. 20 fraud vector defenses.

No competitor has this. Once TYRE has 100K+ scored entities, this dataset
is unique and takes 24+ months to replicate.
"""
from .fraud_vectors import FraudVectorCatalog
from .penalties import PenaltyService
from .trust_score import TrustScoreService, TrustTier
from .verification import VerificationService

__all__ = [
    "VerificationService",
    "TrustScoreService",
    "TrustTier",
    "PenaltyService",
    "FraudVectorCatalog",
]
