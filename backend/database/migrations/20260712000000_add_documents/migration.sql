-- Compliance documents (vehicle + driver) — backs the dashboard Documents panel,
-- which previously returned fabricated rows with "no DB model".
-- Status (VALID/EXPIRING/EXPIRED) is derived from expiry_date at read time.

CREATE TABLE IF NOT EXISTS "documents" (
  "id"          TEXT NOT NULL,
  "org_id"      TEXT NOT NULL,
  "truck_id"    TEXT,
  "driver_id"   TEXT,
  "type"        TEXT NOT NULL,
  "doc_number"  TEXT,
  "issuer"      TEXT,
  "file_url"    TEXT,
  "issue_date"  TIMESTAMP(3),
  "expiry_date" TIMESTAMP(3),
  "notes"       TEXT NOT NULL DEFAULT '',
  "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"  TIMESTAMP(3) NOT NULL,
  "deleted_at"  TIMESTAMP(3),
  CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "documents_org_id_expiry_date_idx" ON "documents" ("org_id", "expiry_date");
CREATE INDEX IF NOT EXISTS "documents_truck_id_idx" ON "documents" ("truck_id");
CREATE INDEX IF NOT EXISTS "documents_driver_id_idx" ON "documents" ("driver_id");
