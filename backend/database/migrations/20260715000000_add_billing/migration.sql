-- Settlement / invoicing / tax engine (NEXT.md Feature 2). Additive: no existing
-- table is modified. Invoice numbers come from a gap-free Postgres sequence.

CREATE SEQUENCE IF NOT EXISTS tyre_invoice_seq START 1;

CREATE TABLE IF NOT EXISTS "tax_profiles" (
  "id"             TEXT NOT NULL,
  "org_id"         TEXT NOT NULL,
  "legal_name"     TEXT NOT NULL,
  "gstin"          TEXT,
  "pan"            TEXT,
  "state_code"     TEXT,
  "gst_registered" BOOLEAN NOT NULL DEFAULT true,
  "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"     TIMESTAMP(3) NOT NULL,
  CONSTRAINT "tax_profiles_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "tax_profiles_org_id_key" ON "tax_profiles" ("org_id");

CREATE TABLE IF NOT EXISTS "invoices" (
  "id"                 TEXT NOT NULL,
  "invoice_no"         TEXT NOT NULL,
  "org_id"             TEXT NOT NULL,
  "trip_id"            TEXT NOT NULL,
  "load_code"          TEXT,
  "place_of_supply"    TEXT NOT NULL,
  "currency"           TEXT NOT NULL DEFAULT 'INR',
  "gross_freight"      DOUBLE PRECISION NOT NULL,
  "gst_total"          DOUBLE PRECISION NOT NULL,
  "commission_total"   DOUBLE PRECISION NOT NULL,
  "tds_total"          DOUBLE PRECISION NOT NULL,
  "invoice_total"      DOUBLE PRECISION NOT NULL,
  "carrier_net_payout" DOUBLE PRECISION NOT NULL,
  "status"             TEXT NOT NULL DEFAULT 'ISSUED',
  "financial_year"     TEXT NOT NULL,
  "pdf_url"            TEXT,
  "issued_at"          TIMESTAMP(3),
  "created_at"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"         TIMESTAMP(3) NOT NULL,
  CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "invoices_invoice_no_key" ON "invoices" ("invoice_no");
CREATE UNIQUE INDEX IF NOT EXISTS "invoices_trip_id_key" ON "invoices" ("trip_id");
CREATE INDEX IF NOT EXISTS "invoices_org_id_financial_year_status_idx" ON "invoices" ("org_id", "financial_year", "status");

CREATE TABLE IF NOT EXISTS "invoice_lines" (
  "id"          TEXT NOT NULL,
  "invoice_id"  TEXT NOT NULL,
  "kind"        TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "amount"      DOUBLE PRECISION NOT NULL,
  "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "invoice_lines_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "invoice_lines_invoice_id_fkey" FOREIGN KEY ("invoice_id")
    REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "invoice_lines_invoice_id_idx" ON "invoice_lines" ("invoice_id");
