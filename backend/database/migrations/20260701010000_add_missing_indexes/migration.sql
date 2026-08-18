-- Audit fix (INFRA): 12 missing indexes identified by cross-referencing route handler
-- where clauses against the Prisma schema. Each was a sequential scan before.
-- Table/column names use the actual snake_case @@map/@map values from schema.prisma.

-- 1. Load listing filtered by status + origin_region
CREATE INDEX IF NOT EXISTS idx_loads_status_region
  ON loads (status, origin_region);

-- 2. Trip GPS lookup (highest-volume table at scale)
CREATE INDEX IF NOT EXISTS idx_gps_trip_time
  ON "GpsPing" (trip_id, created_at DESC);

-- 3. Audit log by user + time (SOC2 audit trail queries)
CREATE INDEX IF NOT EXISTS idx_audit_user_time
  ON audit_logs (user_id, created_at DESC);

-- 4. AgentEvent by agent + time (agent activity feed)
CREATE INDEX IF NOT EXISTS idx_agent_event_agent_time
  ON "AgentLog" (agent_name, created_at DESC);

-- 5. Escrow by escrow_account_id + status (escrow state lookup)
CREATE INDEX IF NOT EXISTS idx_escrow_trip_status
  ON "UpiEscrowTransaction" (escrow_account_id, status);

-- 6. TrustScore by entity_id + created_at (trust history)
CREATE INDEX IF NOT EXISTS idx_trust_entity_time
  ON "TrustScore" (entity_id, created_at DESC);

-- 7. Load by broker_id + status (broker dashboard)
CREATE INDEX IF NOT EXISTS idx_load_broker_status
  ON loads (broker_id, status);

-- 8. Trip by driver_id + status (driver active trip lookup)
CREATE INDEX IF NOT EXISTS idx_trip_driver_status
  ON trips (driver_id, status);

-- 9. User by phone (login lookup — currently full scan)
CREATE INDEX IF NOT EXISTS idx_user_phone
  ON users (phone);

-- 10. ApiKey by key_hash (auth lookup — currently full scan)
CREATE INDEX IF NOT EXISTS idx_api_key_hash
  ON "ApiKey" (key_hash);

-- 11. Negotiation by load_id + created_at (negotiation history)
CREATE INDEX IF NOT EXISTS idx_negotiation_load_time
  ON "Negotiation" (load_id, created_at DESC);

-- 12. RefreshToken by user_id (token rotation lookup)
CREATE INDEX IF NOT EXISTS idx_refresh_token_user
  ON refresh_tokens (user_id);
