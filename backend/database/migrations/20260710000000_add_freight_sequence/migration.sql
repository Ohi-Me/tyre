-- Race-safe FRT-#### code generation for freight_listings.
-- Mirrors the FE-C11 fix already applied to loads (tyre_load_seq).
--
-- Previously POST /api/v1/freight used db.freightListing.count() + 1 to build
-- the FRT-XXXX code. That races on concurrent POSTs (two requests both read
-- count=5, both generate FRT-0006) and, because freight_listings.code is UNIQUE,
-- the second insert fails with a 500. It also mis-numbers after soft-deletes,
-- since count() includes deleted rows inconsistently.
--
-- This sequence is consumed atomically via nextval('tyre_freight_seq').
-- Starts at 1000 so new codes never collide with pre-existing FRT-0001..FRT-0999.

CREATE SEQUENCE IF NOT EXISTS tyre_freight_seq START 1000;
