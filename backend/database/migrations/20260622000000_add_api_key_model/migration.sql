-- TYRE v1.1 item #2 — add ApiKey model (api_keys table).
--
-- Hand-authored because the schema previously declared `model ApiKey` twice,
-- which made `prisma generate` / `prisma migrate dev` fail before any SQL could
-- be produced. The duplicate has been removed; this migration creates the single
-- canonical `api_keys` table (see packages/db/prisma/schema.prisma, "ApiKey —
-- Phase 0 fix" block) and the implementation in packages/auth/src/api-key.ts.
--
-- NOTE: this repo had no prior migrations directory (it was using `prisma db
-- push`). If you adopt a migrations workflow, baseline the existing tables first:
--   npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma \
--     --script > prisma/migrations/00000000000000_baseline/migration.sql
--   npx prisma migrate resolve --applied 00000000000000_baseline
-- then `npx prisma migrate deploy`. Otherwise just run `npx prisma migrate dev`
-- and let Prisma regenerate from the corrected schema.

-- CreateTable
CREATE TABLE "api_keys" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "key_hash" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "scopes" TEXT NOT NULL DEFAULT '[]',
    "revoked" BOOLEAN NOT NULL DEFAULT false,
    "last_used_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_key_hash_key" ON "api_keys"("key_hash");

-- CreateIndex
CREATE INDEX "api_keys_key_hash_idx" ON "api_keys"("key_hash");

-- CreateIndex
CREATE INDEX "api_keys_revoked_expires_at_idx" ON "api_keys"("revoked", "expires_at");
