-- Audit fix: add CHECK constraints for data integrity.

-- TrustScore must be 0-1000
ALTER TABLE "TrustScore" ADD CONSTRAINT IF NOT EXISTS chk_trust_score_range
  CHECK ("totalScore" BETWEEN 0 AND 1000);

-- Load weight must be positive
ALTER TABLE "Load" ADD CONSTRAINT IF NOT EXISTS chk_load_weight_positive
  CHECK ("weightTons" > 0);

-- Load distance must be non-negative
ALTER TABLE "Load" ADD CONSTRAINT IF NOT EXISTS chk_load_distance_nonneg
  CHECK ("distanceKm" >= 0);

-- Escrow amounts must be non-negative
ALTER TABLE "UpiEscrowAccount" ADD CONSTRAINT IF NOT EXISTS chk_escrow_funded_nonneg
  CHECK ("totalFunded" >= 0);
ALTER TABLE "UpiEscrowAccount" ADD CONSTRAINT IF NOT EXISTS chk_escrow_advance_nonneg
  CHECK ("advanceReleased" >= 0);
ALTER TABLE "UpiEscrowAccount" ADD CONSTRAINT IF NOT EXISTS chk_escrow_balance_nonneg
  CHECK ("balanceReleased" >= 0);
