# TODO: String → Enum and Float → Decimal Migrations

**Status:** Deferred (not executed in audit-fix pass b11-12)
**Tracking:** Audit findings INFRA-C16 (enums) and INFRA-C17 (Decimal)
**Owner:** Backend / Database

---

## Rationale for deferral

The TYRE v3 audit identified two large-scale schema improvements that, while
correct in principle, are *breaking* changes for every consumer of the Prisma
client and were therefore explicitly excluded from the immediate audit-fix
pass (b11-12-database). They are documented here so a follow-up task can pick
them up with full visibility of the blast radius.

1. **0 enums — all status / role / tier fields are `String`.**
   The schema uses free-form `String` columns with inline `// COMMENT` value
   lists (e.g. `role String @default("driver") // driver | shipper | broker
   | fleet_manager | operator | admin | super_admin`). This is a data-integrity
   and documentation hazard: nothing stops a typo like `"shiper"` from being
   persisted, and the valid value set lives only in code comments.

2. **All money fields are `Float`.**
   `Float` (Postgres `double precision`) is the wrong type for money — it
   cannot represent `0.1 + 0.2 == 0.3` exactly. Affected columns include
   `Load.offeredRate`, `Load.aiSuggestedRate`, `Load.advanceOffered`,
   `Load.weightTons`, `Trip.advanceAmount`, `Trip.balanceAmount`,
   `Negotiation.brokerOffer`, `Negotiation.counterOffer`,
   `Negotiation.finalRate`, `UpiEscrowAccount.totalFunded`,
   `UpiEscrowAccount.advanceReleased`, `UpiEscrowAccount.balanceReleased`,
   `UpiEscrowAccount.tyreFee`, `UpiEscrowAccount.refundToBroker`,
   `UpiEscrowTransaction.amount`, `FastagWallet.balance`,
   `FastagTransaction.amount`, etc.

---

## Why these were NOT done in this pass

Both migrations touch *every* route handler and serialization boundary in the
codebase:

- **Enum migration:** Prisma generates a TypeScript union type for every
  `enum` (e.g. `LoadStatus`). Anywhere a route handler currently does
  `load.status === "OPEN"` or `load.status = "OPEN" as string` or
  `z.string().refine(...)` validation, the literal comparison must change to
  the enum value (`LoadStatus.OPEN`). The audit found 46+ route handlers in
  `frontend/web/app/api/v1/*/route.ts`, plus Python services in
  `backend/ai/gateway/` that read these columns via raw SQL or the BFF and
  would also need their Pydantic validators updated. A naive find/replace is
  unsafe because some columns hold values outside the documented enum set
  (legacy / seed data) — those rows would fail `prisma migrate` validation.

- **Decimal migration:** Switching `Float` → `Decimal` (`@db.Decimal(12,2)`)
  changes the JS representation from `number` to `Prisma.Decimal` (a
  string-backed wrapper). Every `JSON.stringify` of a money field now emits
  `"123.45"` (string) instead of `123.45` (number), breaking every frontend
  client that does `amount * 100` or `Number(amount)`. The FastAPI gateway
  also parses these as `float` in Pydantic models and would need to switch to
  Python's `Decimal`. Arithmetic comparisons (`amount > 0`) still work but
  require explicit `.toNumber()` or `.gt(0)` calls.

Both changes, done correctly, are a multi-day refactor with a coordinated
schema migration, code changes across three TypeScript packages and one
Python service, and a data-backfill to scrub any out-of-enum values. Doing
them as part of a "fix audit findings" pass would have introduced more risk
than it removed.

---

## Plan (for the follow-up task)

### Phase 1 — Enum migration (estimate: 1-2 days)

1. **Inventory every String-typed status/role/tier column** and its
   documented value set from the inline comments. Produce a table:
   `model.field | current String | proposed enum | allowed values`.
2. **Audit live data** for each column (run `SELECT DISTINCT field FROM
   table` against staging + prod replicas) and reconcile against the
   documented value set. Flag any rows holding values outside the enum;
   decide whether to (a) add the value to the enum, (b) remap to a known
   value, or (c) NULL out with an audit-log entry.
3. **Declare Prisma enums** in `schema.prisma` (one per logical domain —
   e.g. `LoadStatus`, `TripStatus`, `UserRole`, `TrustTier`,
   `EscrowAccountStatus`, `EscrowTxnStatus`, `PaymentStatus`,
   `FraudSeverity`, `ComplianceDocStatus`). Use `@default(...)` for
   backward-compat defaults.
4. **Generate the migration** with `pnpm --filter @tyre/db run db:migrate --
   --name enumify_status_fields`. Review the generated SQL — it will emit
   `ALTER TYPE` / `ALTER TABLE ... ALTER COLUMN ... TYPE ... USING ...::enum`
   statements.
5. **Fix every consumer**:
   - `backend/api/**` and `frontend/web/app/api/v1/**/route.ts`: replace
     string literals with imported enum values; tighten Zod schemas from
     `z.string()` to `z.nativeEnum(...)`.
   - `backend/shared/constants/enums.ts` already mirrors these value sets —
     reconcile it to be the single source of truth, or have it re-export the
     Prisma-generated enums.
   - `backend/ai/gateway/app/**.py`: update Pydantic models and any raw SQL
     that filters on these columns.
6. **Add a CI guard** (eslint rule or typecheck assertion) that forbids
   comparing enum-typed columns to raw string literals.

### Phase 2 — Decimal migration (estimate: 2-3 days)

1. **Inventory every money Float column** (see list above; there are ~25).
2. **Pick precision per currency.** INR/NGN/BRL/MXN/AED all use 2 decimal
   places for settlement, but storage should be `Decimal(18,4)` to preserve
   FX-rate precision for `aiSuggestedRate` and `expectedRatePerKm`. Decide
   per-column.
3. **Schema change:** `Float` → `Decimal @db.Decimal(18,4)` (or 12,2 for
   settled amounts). Generate migration; review the `ALTER COLUMN ... TYPE
   DECIMAL(...) USING ...::numeric` statements.
4. **Code changes:**
   - TypeScript: replace `Number(amount)` / `amount * 100` with
     `Prisma.Decimal`-aware helpers (`amount.toNumber()`, or do all math on
     the DB side). Add a shared `formatMoney(decimal, currency)` helper in
     `@tyre/shared`.
   - API serialization: explicitly `.toNumber()` or `.toFixed(2)` at the
     response boundary so the JSON shape stays `number` for backward compat
     with the frontend (decide as a team — string is safer, number is
     easier).
   - Python: switch Pydantic fields from `float` to `Decimal`; update any
     `round(amount, 2)` calls.
5. **Test:** the UPI escrow flow (`upi_escrow.py`, `test_upi_escrow.py`) and
   pricing/negotiation flow are the highest-risk paths. Add property-based
   tests for `amount + fee == total` with random Decimal inputs.

### Phase 3 — Verification

- Run the full backend test suite (`pytest backend/ai/gateway/tests/`) and
  the frontend API integration tests.
- Run a staged rollout on the staging database with a prod snapshot;
  verify row counts and that no money value was silently rounded.
- Update the audit PDF report to mark INFRA-C16 and INFRA-C17 as resolved.

---

## Out of scope for this TODO

- Adding new enums for newly-introduced status fields that don't yet exist.
- Migrating `Json` columns (`Verification.rawData`, `FraudIncident.evidence`,
  `AgentLog.payload`) — those are intentionally JSON for flexibility.
- Migrating `String` columns that hold free-form text (names, addresses,
  notes) — those should remain `String`.

---

## Reference

- Original audit findings: see the b11-12-database worklog entry in
  `/home/z/my-project/worklog.md`.
- Schema file: `backend/database/prisma/schema.prisma`.
- Migration directory: `backend/database/migrations/`.
- Enum mirror in code: `backend/shared/constants/enums.ts`.
