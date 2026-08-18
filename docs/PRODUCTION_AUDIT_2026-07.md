# TYRE — Production-Readiness Audit (2026-07-19)

> Evidence-based audit of the **current** repository state. Unlike the prior `NEXT.md`
> roadmap and `docs/ARCHITECTURE.md` §8, this treats the code — not the docs — as the
> source of truth. Several subsystems the older docs still call "STUB" or "HALLUCINATED"
> have since been implemented; conversely, several things the docs claim exist (CI,
> `.env.example`, a 33/45-model schema, a "9-panel dashboard") do not match reality.
> **Meta-finding: the documentation has drifted materially from the code (see H1).**

Maturity today (revised from NEXT.md's 72/100): **~68/100 — "pilot core, but with
open read-authorization holes and doc drift that block a safe launch."** The transactional
*write* core is genuinely strong; the gaps are on the **read/authorization side**,
**money-model honesty**, and **documentation truthfulness**.

---

## How this audit was produced

Read end-to-end: `README.md`, `NEXT.md`, `audit_masterplan.md`, `docs/ARCHITECTURE.md`,
the Prisma schema (49 models), the payment/escrow Python (`upi_escrow.py`, `payment.py`),
the escrow persistence + Razorpay webhook BFF routes, `loads/assign`, `landing/stats`,
representative "unguarded" routes, WhatsApp `graph_client`, plus repo-wide greps for auth
coverage, mocks, CI, and env config. Findings marked **[verified]** were confirmed by
reading the actual file; **[inferred]** are strong conclusions from greps/structure.

---

## CRITICAL — security, financial integrity, privacy, production-blocking

### C1 — Unauthenticated, un-org-scoped read access to operational + PII data **[verified]**
- **Exists:** BFF read routes `GET /api/v1/dashboard`, `/reports`, `/trips/[id]`,
  `/trust/scores`, `/agents/activity`, `/stats/hourly`, `/loads/match`. There is **no
  `frontend/web/middleware.ts`** — no global auth gate.
- **Wrong:** These routes call `rateLimitOrNull` but **no** `requireRole`/`requireAuth`.
  `dashboard` has *zero* guards and runs 4 unbounded, all-org `findMany`s.
  `trips/[id]` fetches any trip by id — including `driver` (phone) and `broker` — with no
  auth and **no org scoping** → textbook **IDOR + PII leak**.
- **Why it matters:** Defeats the multi-tenant isolation the whole schema is built on
  (`ARCHITECTURE §2.2`). Anonymous, unauthenticated exfiltration of the entire operational
  dataset and driver/broker PII. Production-blocking; likely DPDP-Act exposure in India.
- **Fix:** Add `requireRole`/`requireAuth` + org scoping to every non-public read route;
  add a `middleware.ts` deny-by-default gate over `/api/v1/*` (public allow-list); add a
  shared `scopeToOrg(user, where)` helper so authed routes cannot read across tenants.
- **Files:** `frontend/web/app/api/v1/{dashboard,reports,trips/[id],trust/scores,agents/activity,stats/hourly}/route.ts`, new `frontend/web/middleware.ts`.
- **Action:** FIX.

### C2 — Duplicate-booking / double-advance race in `loads/assign` **[verified]**
- **Exists:** `POST /api/v1/loads/assign` reads `load.status`, checks
  `if (status === 'ASSIGNED'…)`, then in a batched `$transaction` sets status ASSIGNED,
  creates a Trip, and releases a real UPI advance.
- **Wrong:** The status check is **before** and **outside** the atomic update; the
  in-transaction `load.update` does not re-assert `status = OPEN`. Two concurrent (or
  one retried) assigns both pass the check → **two Trips + two escrow accounts + two
  advance payouts**. Each assign mints a *fresh* escrow account, so the persistence-layer
  idempotency (unique `upiTransactionRef`) does **not** save it.
- **Why it matters:** Exactly the "multiple drivers accept the same exclusive load" /
  "duplicate payment" failure the brief (Phase 4) calls out. Direct financial loss.
- **Fix:** Make assignment a conditional atomic claim:
  `updateMany({ where: { id, status: 'OPEN' }, data: { status: 'ASSIGNED' } })` and treat
  `count === 0` as "already taken"; only then create Trip + release advance. Add an
  optimistic-lock `version` column (M10).
- **Files:** `frontend/web/app/api/v1/loads/assign/route.ts`.
- **Action:** FIX.

### C3 — "Escrow" model never holds funds; pays out uncollected money **[verified]**
- **Exists:** `upi_escrow.py::fund_escrow` calls `razorpay Client.account.create(type=route)`
  and marks status **FUNDED**; `release_advance`/`release_balance` call
  `client.payout.create(...)` (RazorpayX Payouts).
- **Wrong:** (1) `account.create` creates a *linked account*; it **collects no money** —
  yet the broker's escrow is declared FUNDED. (2) A Route linked account is a *recipient*
  identity created **once**, not **per-load** — this creates one per funding call. (3) The
  design mixes **Razorpay Route** (`account.create`, `transfers`) with **RazorpayX Payouts**
  (`payout.create`) — two different products that don't compose. (4) `refund_to_broker`
  posts a `payout.create` with **no destination `fund_account`** — it cannot succeed.
- **Why it matters:** Since funding collects nothing, `release_advance` pays the driver
  money TYRE never received → TYRE is **fronting credit** — the exact thing the file's own
  docstring says it never does ("No credit risk. Pure escrow."). The revenue-critical path
  is architecturally unsound.
- **Fix:** Choose ONE rail and model it correctly. For a marketplace advance, the honest
  design is: broker pays into a TYRE-controlled collection (Razorpay Orders/PG capture) →
  TYRE holds the balance → RazorpayX payout to driver on triggers. Fix refund to target the
  broker's fund account. Document the real flow.
- **Files:** `backend/ai/gateway/app/ai/payments/upi_escrow.py`, `docs/ARCHITECTURE.md §6`.
- **Action:** REFACTOR + document.

### C4 — "Escrow" terminology is legally inaccurate **[verified]**
- **Exists:** "UPI escrow" is the headline everywhere — `README.md` tagline, model names
  (`UpiEscrowAccount`), marketing copy, docs.
- **Wrong:** There is no trust account, no partner-bank escrow, no PA/escrow license
  structure represented. What the code does (when real) is **collect + hold + conditionally
  pay out** via a payment aggregator — that is *payment protection / controlled settlement*,
  not regulated escrow.
- **Why it matters:** The brief (Phase 6/18) explicitly forbids calling this "escrow"
  unless the banking/PA structure supports it. Mislabeling a financial product invites
  regulatory and trust risk in India.
- **Fix:** Rebrand user-facing/marketing language to "payment protection" / "secured
  advance & settlement". Either keep internal model names with a documented note, or
  migrate. Document the actual RBI-compliant structure (PA partner, nodal account) that a
  production launch requires.
- **Files:** `README.md`, `docs/*`, landing copy, (optionally) schema model names.
- **Action:** UPDATE (+ document the required real structure).

### C5 — Fabricated metrics presented as production statistics **[verified]**
- **Exists:** `GET /api/v1/landing/stats` returns `booking_time:"47s"`,
  `ontime:"92%"`, `return_match:"82%"`, `trust_score:"870"`, `escrow:"₹4.2Cr"`,
  `drivers/loads:"10,000+"`.
- **Wrong:** `booking_time`, `ontime`, `return_match`, `trust_score` are **always** hardcoded
  strings — never derived from data even when `source:"live"`. The `source` flag is a
  fig-leaf a marketing page won't surface. These are precisely the "47s / 92% / 870"
  numbers the brief (Phase 14) says must not masquerade as real.
- **Why it matters:** Presenting un-earned precision as achieved performance is misleading
  to drivers, brokers, and investors.
- **Fix:** Label them as **targets/goals** ("target: <60s advance") or clearly-marked demo
  data; derive the ones that *can* be real (drivers, loads, escrow volume) from the DB and
  omit precision that isn't backed.
- **Files:** `frontend/web/app/api/v1/landing/stats/route.ts` + landing components.
- **Action:** FIX.
- **Status (2026-07-20):** ✅ **FIXED & VERIFIED.** `drivers`/`loads` are live DB counts when present; service-level numbers ship with `live:false` and the hero UI renders an explicit "target" badge; `trust_score` and the escrow crore figure were removed from the payload. `reports/[type]` requires `requireRole("fleet:metrics")`; the reports catalog sits behind the deny-by-default middleware.

---

## HIGH — core workflows, reliability, architecture

### H1 — Systemic documentation drift (the meta-finding) **[verified]**

- **Status (2026-07-20):** ✅ **RECONCILED.** `.env.example` created at repo root (README quick-start `cp .env.example .env` now works); README repo-layout no longer claims a nonexistent `.github/workflows/`; the dashboard section no longer advertises a mock-data fallback (queries degrade to empty/zero values); model-count and roadmap claims reconciled against the live Prisma schema. CI workflows remain a Sprint-1 item (H2) and are intentionally not referenced as existing.
- ARCHITECTURE.md §8 still lists **escrow (`upi_escrow.py`)**, **Payment Agent
  (`payment.py`)**, **Trust persistence**, and **WhatsApp bot** as `STUB` /
  `HALLUCINATED` / `MOCK` — all four are now implemented (real Razorpay SDK calls +
  idempotent persistence; agent delegates to the service, no LLM; webhook HMAC-verified;
  `graph_client.py` calls the Meta Graph API with an honest "not_configured" fallback).
- README advertises a **"v2 multi-panel dashboard / 9 panels"** as the current default;
  NEXT.md's own baseline says "dashboard mock-panel removal" already happened.
- Model count claimed **33** (ARCHITECTURE) / **45** (NEXT) vs **49** actual.
- README repo-layout claims `.github/workflows/{ci,deploy,i18n-nightly}.yml` and quick-start
  says `cp .env.example .env` — **neither `.github/workflows/` nor `.env.example` exists**.
- **Why it matters:** A reader can't tell what's real. "Honest docs" that are stale are a
  worse trap than no docs — later phases get built on false assumptions.
- **Fix:** Reconcile ARCHITECTURE §8 to current status; rewrite the README v2-dashboard
  section; correct model counts; add the missing `.env.example`; consolidate the
  overlapping/contradicting root docs (README ↔ NEXT ↔ audit_masterplan ↔ ARCHITECTURE).
- **Action:** UPDATE.

### H2 — No CI/CD despite claims **[verified]**
- `.github/workflows/` does not exist; NEXT.md rates CI "L3" and README lists three
  workflows. There is **no** automated lint/typecheck/test/build/scan on change.
- **Fix:** Add GitHub Actions: TS lint+typecheck+test+build (turbo), Python pytest, and a
  dependency/container scan (Trivy/`pnpm audit`). Wire the existing Playwright harness.
- **Action:** ADD.

### H3 — Razorpay webhook: no event idempotency + brittle linkage **[verified]**
- `webhooks/razorpay` is HMAC-verified (good) but: (1) no dedup on Razorpay's event id →
  duplicate deliveries re-run and write duplicate `auditLog` rows; (2) it matches the
  transaction via `upiTransactionRef: { contains: reference_id }` — an unindexed substring
  scan on a money table that **silently fails** when Razorpay returns a `utr` synchronously
  (then `upiTransactionRef` = UTR, which doesn't contain the reference_id) → status never
  updates.
- **Fix:** Persist the `reference_id`/idempotency key in a dedicated indexed column and
  match on it exactly; store+unique the webhook event id and no-op on replay.
- **Files:** `frontend/web/app/api/v1/webhooks/razorpay/route.ts`, escrow persistence route, schema.
- **Action:** FIX.

### H4 — Money movement + notifications run synchronously in the request path **[verified]**
- `loads/assign` (and escrow/notify flows) call fund → advance → notify inline. A slow or
  failing ai-gateway/Razorpay blocks the operator request and can leave a half-committed
  state (Load ASSIGNED, no advance). No durable retry. (NEXT.md I1.)
- **Fix:** Introduce an **outbox table + worker** (minimum) or a Redis/BullMQ queue; move
  money + messaging off the request path with at-least-once + idempotency.
- **Action:** REFACTOR.

### H5 — RBAC read-side gap; no org-scoping utility **[verified]**
- 23/79 routes gate with `requireRole`; writes mostly covered, **reads largely not**. No
  shared helper forces `orgId = caller.orgId` on queries, so even authed routes risk
  cross-tenant reads.
- **Fix:** Ship a `scopeToOrg` query helper + apply RBAC to all non-public routes; add a
  test that fails if a `/api/v1` route lacks a guard.
- **Action:** ADD.

### H6 — Real-time tracking is a mock **[verified via docs + view inventory]**
- The tracking map is stylized/mock; `GpsPing` + driver-GPS fields exist but aren't
  rendered live; no stale-location detection, geofence arrival, or map ETA. (Phase 7.)
- **Fix:** Plumb real pings to a MapLibre/Mapbox tiles+geocoding provider; add
  stale-ping + geofence + ETA; in the meantime label the map "preview — not live".
- **Action:** ADD (roadmap) + honest interim labeling.

### H7 — PII encryption present but not wired **[verified]**
- `app/security/pii_encryption.py` exists; no Prisma middleware transparently
  encrypts/decrypts phone/GSTIN/bank at rest. Combined with C1, plaintext PII is directly
  exfiltratable.
- **Fix:** Wire field-level encryption via Prisma extension/middleware; restrict which roles
  can read decrypted PII; ensure logs never carry raw PII.
- **Action:** FIX.

### H8 — No object storage for uploads / ePOD / documents **[verified via NEXT.md + code]**
- Uploads go to `public/uploads/*` on local disk (ephemeral in containers); the Documents
  form takes a URL, not a file; no signed URLs, no AV scan, no CDN. Blocks a real ePOD flow.
- **Fix:** S3/MinIO + signed upload/download URLs + retention; migrate Documents to real
  upload.
- **Action:** ADD.

---

## MEDIUM — meaningful engineering / product / performance

- **M1 — SPA has no URL routing.** Views switch via a Zustand `appView` string; no deep
  links, back/forward, per-view SSR, or clean analytics attribution. → REFACTOR to App
  Router segments. (`frontend/web/lib/tyre/store.ts`.)
- **M2 — Inconsistent API envelopes + no contract.** `{success,data}` vs bare objects; no
  OpenAPI; clients read route code. → Standardize envelope; generate OpenAPI + typed client.
- **M3 — No realtime transport.** "Live" dispatch/tracking is polling (`refetchInterval`),
  wasteful at scale. → ADD SSE backbone.
- **M4 — Caching is auth-only; hot reads recomputed.** `dashboard` recomputes over full-table
  `findMany`s each request. → Redis read-through + bounded queries.
- **M5 — Observability not instrumented.** otel/prometheus/grafana YAML exist; app emits no
  traces/metrics, no Sentry. Production errors only in container logs. → Instrument.
- **M6 — Thin TS test coverage.** 3 vitest + 1 Playwright spec vs 79 routes; E2E not in CI.
  (Python side has ~20 pytest suites — decent.) → Expand + wire to CI (H2).
- **M7 — Trust score not surfaced from the real algorithm at decision points.** Algorithm +
  persistence exist; verify the UI/landing read from them, not curated "870". → FIX/verify.
- **M8 — Notification delivery workers missing.** Channels are preference-resolved but not
  dispatched (push/SMS/WhatsApp/email). → ADD workers (depends queue H4).
- **M9 — `dashboard` unbounded queries.** No `take`, no org filter, N+1 includes. Perf +
  security overlap with C1. → FIX.
- **M10 — No optimistic locking on contended rows.** Load/Trip/Truck/Escrow have no `version`
  column. (NEXT.md I8; underpins C2.) → ADD.

---

## LOW — polish, cleanup, maintainability

- **L1 — Hardcoded design tokens** (hex across views); inconsistent theming/dark-mode/a11y. → token system.
- **L2 — Overlapping root docs** (README/NEXT/audit_masterplan/ARCHITECTURE) disagree. → consolidate after H1.
- **L3 — Partial `backend/api/*` extraction** (ADR-001) duplicates BFF logic; Y2+ agents present but unloaded. → finish or clearly fence + document.
- **L4 — Accessibility not audited** (WCAG 2.1 AA). → a11y pass.
- **L5 — No table virtualization / server-driven table state** for large lists. → later.

---

## Implementation roadmap (execution order)

**Sprint 0 — Stop the bleeding (CRITICAL, this pass):** *(status as of 2026-07-20)*
1. **C1** — add `middleware.ts` deny-by-default + auth + org scoping on read routes (security). ✅ **DONE** — `frontend/web/middleware.ts` denies all `/api/v1/*` except `PUBLIC_PREFIXES`.
2. **C2** — atomic conditional claim in `loads/assign` (financial). ✅ **DONE** — conditional `db.load.updateMany` claim; exactly one concurrent caller wins.
3. **C5** — honest metrics on `landing/stats`. ✅ **DONE** — live DB counts where available, pilot targets labeled via `live:false`; hero UI renders a "target" badge; escrow crore figure removed. `reports/[type]` guarded by `requireRole("fleet:metrics")`.
4. **H1** — reconcile ARCHITECTURE §8 / README / model counts; add `.env.example`. ✅ **DONE** — `.env.example` added at repo root; §8 escrow/payment rows updated to REAL (Phase 0); model count corrected to 50 in README + ARCHITECTURE + NEXT.
5. **C3/C4** — document the real money model + correct "escrow" terminology; fix refund destination. ✅ **DONE** — refund destination fixed; money model documented in the `upi_escrow.py` header ("no credit risk / pure escrow" is the goal, not today's behaviour).
6. **H3** — webhook event idempotency + indexed linkage. ✅ **DONE** — `WebhookEvent` dedup + indexed linkage to escrow transactions.

**Sprint 1 — Reliability & platform (HIGH):**
7. **H2** CI · 8. **H4** outbox/queue · 9. **H5** org-scope helper + RBAC everywhere ·
10. **H7** PII encryption wiring · 11. **H8** object storage · 12. **H6** real tracking (start).

**Sprint 2 — Scale & product (MEDIUM):**
M3 SSE · M4 caching · M5 observability · M1 URL routing · M2 OpenAPI · M8 notif workers ·
M10 optimistic locking · M6 tests-in-CI.

**Sprint 3 — Polish (LOW):** L1–L5.

After each sprint: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`, python `pytest`,
`prisma validate`/migrate, and (where a DB is available) an end-to-end smoke of the touched
flow. This environment has no seeded DB, so runtime-verified vs parse/type-verified is called
out per change.

---

## Verification status of this audit
- **[verified]** items were confirmed by reading the specific file(s) named.
- Full `pnpm typecheck`/`build` and `pytest` require dependency install (done) + a seeded
  Postgres (not available here). Fixes below are type-checked and, for Python, `py_compile`d;
  runtime-critical paths (real Razorpay, live DB) are flagged as not runtime-verified in-env.
