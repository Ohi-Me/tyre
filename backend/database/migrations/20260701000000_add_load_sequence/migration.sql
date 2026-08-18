-- FE-C11 fix: race-safe tyreCode generation.
-- Previously the BFF used db.load.count() + 1 to generate TYRE-XXXX codes,
-- which races on concurrent POSTs (both compute count=5, both generate TYRE-0006).
-- This sequence is consumed atomically via nextval('tyre_load_seq').

CREATE SEQUENCE IF NOT EXISTS tyre_load_seq START 1000;

-- Also add a sequence for RFP codes (same race condition in shippers/rfp/route.ts)
CREATE SEQUENCE IF NOT EXISTS tyre_rfp_seq START 100;
