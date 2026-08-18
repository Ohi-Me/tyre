-- Week 3 of the WhatsApp↔Telegram bridge: nearby-driver broadcast
--
-- Three changes:
--   1. Add current_lat / current_lng to drivers (nullable floats) + composite
--      index for the nearby query path (status, current_lat, current_lng).
--   2. Add origin_lat/origin_lng + destination_lat/destination_lng to loads
--      (nullable floats) — the broadcast service needs the load's origin GPS
--      to query nearby drivers.
--   3. New broadcast_logs table — audit trail for every load broadcast
--      (who broadcast what load to whom, with per-driver outcomes).
--
-- The nearby query uses a bounding-box pre-filter in SQL (lat/lng BETWEEN)
-- followed by an in-app haversine distance check. This avoids the PostGIS
-- dependency entirely while remaining correct for the 50km radii Y1 uses.
-- PostGIS is the right answer at 10K+ drivers; for the wedge we keep it
-- dependency-free.

-- ── 1. Driver GPS columns ─────────────────────────────────────────────────────
ALTER TABLE "drivers"
  ADD COLUMN IF NOT EXISTS "current_lat" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "current_lng" DOUBLE PRECISION;

-- Composite index backs GET /api/v1/drivers/nearby — the WHERE clause is
-- always `status = 'AVAILABLE' AND current_lat BETWEEN ? AND ? AND
-- current_lng BETWEEN ? AND ?`, so this single index covers it.
CREATE INDEX IF NOT EXISTS "drivers_status_lat_lng_idx"
  ON "drivers" ("status", "current_lat", "current_lng")
  WHERE "current_lat" IS NOT NULL AND "current_lng" IS NOT NULL;

-- ── 2. Load origin/destination GPS columns ───────────────────────────────────
ALTER TABLE "loads"
  ADD COLUMN IF NOT EXISTS "origin_lat" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "origin_lng" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "destination_lat" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "destination_lng" DOUBLE PRECISION;

-- ── 3. broadcast_logs table ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "broadcast_logs" (
  "id"                  TEXT PRIMARY KEY,
  "tyre_code"           TEXT NOT NULL,
  "broker_code"         TEXT NOT NULL,
  "origin_lat"          DOUBLE PRECISION NOT NULL,
  "origin_lng"          DOUBLE PRECISION NOT NULL,
  "origin_label"        TEXT NOT NULL,
  "radius_km"           INTEGER NOT NULL,
  "truck_type_filter"   TEXT,
  "drivers_found"       INTEGER NOT NULL DEFAULT 0,
  "drivers_notified"    INTEGER NOT NULL DEFAULT 0,
  "drivers_failed"      INTEGER NOT NULL DEFAULT 0,
  "outcomes"            TEXT NOT NULL DEFAULT '[]',
  "initiated_by"        TEXT NOT NULL DEFAULT 'broker_telegram',
  "created_at"          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "broadcast_logs_tyre_code_created_at_idx"
  ON "broadcast_logs" ("tyre_code", "created_at");
CREATE INDEX IF NOT EXISTS "broadcast_logs_broker_code_created_at_idx"
  ON "broadcast_logs" ("broker_code", "created_at");
CREATE INDEX IF NOT EXISTS "broadcast_logs_created_at_idx"
  ON "broadcast_logs" ("created_at");
