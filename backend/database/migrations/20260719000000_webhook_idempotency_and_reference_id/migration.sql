-- Audit H3 (docs/PRODUCTION_AUDIT_2026-07.md): Razorpay webhook idempotency +
-- indexed money-table linkage.
--
-- Two problems fixed:
--   1. The webhook handler matched escrow transactions with
--      `upi_transaction_ref LIKE '%reference_id%'` — an unindexed substring scan
--      over a money table that SILENTLY MISSES rows whose ref is a
--      synchronously-returned UTR (the UTR does not contain the reference_id),
--      so those payouts never left PENDING.
--   2. Razorpay redelivers webhooks (retries on non-2xx, at-least-once
--      semantics). Re-processing the same delivery re-ran status writes and
--      duplicated audit_log rows.
--
-- Fixes:
--   1. Dedicated indexed `reference_id` column on upi_escrow_transactions,
--      populated with the Razorpay reference_id (= our idempotency key) at
--      insert time and matched EXACTLY by the webhook.
--   2. webhook_events table keyed unique on (provider, event_id) — a replayed
--      delivery hits the unique constraint and the handler no-ops.

-- ── 1. Exact-match linkage column ────────────────────────────────────────────
ALTER TABLE "upi_escrow_transactions"
  ADD COLUMN IF NOT EXISTS "reference_id" TEXT;

CREATE INDEX IF NOT EXISTS "upi_escrow_transactions_reference_id_idx"
  ON "upi_escrow_transactions" ("reference_id");

-- Backfill: legacy rows created before this migration stored the idempotency
-- ref inside upi_transaction_ref as '<event>_<idem_key>' (e.g.
-- 'advance_released_a1b2…'). Extract the trailing idempotency key where the
-- pattern matches; rows whose ref is a real UTR stay NULL (the webhook keeps a
-- one-time legacy fallback for them).
UPDATE "upi_escrow_transactions"
SET "reference_id" = regexp_replace("upi_transaction_ref", '^(funded|advance_released|balance_released|refunded)_', '')
WHERE "reference_id" IS NULL
  AND "upi_transaction_ref" ~ '^(funded|advance_released|balance_released|refunded)_';

-- ── 2. Webhook delivery dedup table ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "webhook_events" (
  "id"          TEXT NOT NULL,
  "provider"    TEXT NOT NULL,
  "event_id"    TEXT NOT NULL,
  "event_type"  TEXT,
  "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "webhook_events_provider_event_id_key"
  ON "webhook_events" ("provider", "event_id");
