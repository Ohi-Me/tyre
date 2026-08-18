-- Evolve the demo dashboard_notifications table into a real, scoped notification
-- system, and add per-user channel preferences. Additive + backward compatible:
-- the dashboard already reads dashboard_notifications; existing rows keep working.

ALTER TABLE "dashboard_notifications"
  ADD COLUMN IF NOT EXISTS "org_id"   TEXT,
  ADD COLUMN IF NOT EXISTS "user_id"  TEXT,
  ADD COLUMN IF NOT EXISTS "category" TEXT NOT NULL DEFAULT 'system',
  ADD COLUMN IF NOT EXISTS "data"     JSONB,
  ADD COLUMN IF NOT EXISTS "channel"  TEXT NOT NULL DEFAULT 'in_app',
  ADD COLUMN IF NOT EXISTS "read_at"  TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "dashboard_notifications_user_id_read_idx"
  ON "dashboard_notifications" ("user_id", "read");
CREATE INDEX IF NOT EXISTS "dashboard_notifications_org_id_created_at_idx"
  ON "dashboard_notifications" ("org_id", "created_at");

CREATE TABLE IF NOT EXISTS "notification_preferences" (
  "id"         TEXT NOT NULL,
  "user_id"    TEXT NOT NULL,
  "category"   TEXT NOT NULL,
  "channel"    TEXT NOT NULL,
  "enabled"    BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "notification_preferences_user_id_category_channel_key"
  ON "notification_preferences" ("user_id", "category", "channel");
