-- Audit fix: add deletedAt column to every table for SOC2 audit trail.
-- Prisma client extension filters these out by default; a `includeDeleted: true`
-- option bypasses the filter for compliance queries.

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "Driver" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "Broker" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "Load" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "Truck" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "Trip" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "UpiEscrowAccount" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "UpiEscrowTransaction" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "TrustScore" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "Negotiation" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "Rfp" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "AgentEvent" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "AuditLog" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);

-- Index for soft-delete queries (WHERE "deletedAt" IS NULL)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_loads_active ON "Load" ("deletedAt") WHERE "deletedAt" IS NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_trips_active ON "Trip" ("deletedAt") WHERE "deletedAt" IS NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_trucks_active ON "Truck" ("deletedAt") WHERE "deletedAt" IS NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_drivers_active ON "Driver" ("deletedAt") WHERE "deletedAt" IS NULL;
