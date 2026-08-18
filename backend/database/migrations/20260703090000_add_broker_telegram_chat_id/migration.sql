-- Add Telegram bridge fields to brokers (Week 1 of WhatsApp↔Telegram bridge)
--
-- A broker links their Telegram chat_id to their Broker row via the /link
-- command in @tyrebrokerbot. After linking, the broker bot can push load
-- requests, GPS arrivals, and payment confirmations to that chat_id.
--
-- Schema additions:
--   telegram_chat_id    TEXT UNIQUE  — Telegram chat id (string per Bot API)
--   telegram_username   TEXT         — @username at link time, for audit
--   telegram_linked_at  TIMESTAMPTZ  — when the link was established
--
-- The unique constraint prevents two brokers from sharing one chat. The
-- index on telegram_chat_id backs the broker bot's /loads lookup path
-- (GET /api/v1/brokers/by-telegram?chat_id=...). Both are NULLable so
-- existing broker rows (and the seed data) are unaffected.

ALTER TABLE "brokers"
  ADD COLUMN IF NOT EXISTS "telegram_chat_id" TEXT,
  ADD COLUMN IF NOT EXISTS "telegram_username" TEXT,
  ADD COLUMN IF NOT EXISTS "telegram_linked_at" TIMESTAMPTZ;

-- Unique constraint: one broker per Telegram chat. COALESCE trick lets
-- multiple rows keep NULL telegram_chat_id (Postgres treats NULLs as
-- distinct under UNIQUE, but the partial index makes the intent explicit).
CREATE UNIQUE INDEX IF NOT EXISTS "brokers_telegram_chat_id_key"
  ON "brokers" ("telegram_chat_id")
  WHERE "telegram_chat_id" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "brokers_telegram_chat_id_idx"
  ON "brokers" ("telegram_chat_id")
  WHERE "telegram_chat_id" IS NOT NULL;
