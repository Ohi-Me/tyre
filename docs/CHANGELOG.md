# TYRE — Changelog

> Milestone-style history of how this codebase got to its current state. Each entry has a date, what changed, what was removed, what was added, and why. For the current architectural state see [`ARCHITECTURE.md`](./ARCHITECTURE.md); for what happens next see [`PHASE-PLAN.md`](./PHASE-PLAN.md).
>
> **Tone note:** entries call out stubs, dead code, and fake-LLM-transactions by name. This is the same voice as the rest of the doc set — pretending a stub is real is what created the Phase 0 cleanup in the first place.

---

## v1.1 — Phase 0 "demo-to-real gap" close (June 2026)

**15 targeted upgrades across the payment, trust, WhatsApp, and auth surfaces.**

Every change here closes a specific gap logged in `docs/ARCHITECTURE.md` §8 ("Honest gap log") — no feature additions, no schema rebuilds, only making real what the architecture said was real.

### 1. Real Razorpay escrow — `upi_escrow.py`
Complete rewrite. Every method previously had `# Stub for now` above fabricated IDs. Now calls the `razorpay` Python SDK (sandbox by default). When `TYRE_RAZORPAY_KEY_ID`/`KEY_SECRET` are unset, falls back to a `SIMULATED` path that is visibly labeled as such in the response — the old code returned `success=True` indistinguishably from a real payout.

### 2. Idempotency keys — `upi_escrow.py`
Deterministic SHA-256 idempotency keys on every Razorpay money-moving call. Same `broker_id + load_id + amount` always produces the same key, so a network-timeout retry can't double-fund or double-pay. Was a Phase 2 gap; closed now since it costs nothing once real Razorpay calls exist.

### 3. No more LLM-narrated transactions — `payment.py` (agent)
Payment Agent now routes directly to `UpiEscrowService` with zero LLM calls. The LLM was generating JSON that *looked like* a `razorpay_transfer_id` with no money behind it. Money-moving logic must never be hallucinated by a language model.

### 4. BFF callback client — `app/clients/bff_client.py` (new)
`backend/ai/gateway` never opens a DB connection directly (documented constraint in `backend/database/prisma/index.ts`). Before Phase 0, this was documented intent with zero implementation — every `# Real impl: db.X.create(...)` comment in the Python services was just a comment. `bff_client.py` is the authenticated HTTP client that actually makes those writes happen, via `TYRE_INTERNAL_SERVICE_TOKEN`-gated internal BFF routes.

### 5. Trust score persistence — `POST /api/v1/trust/score` (new BFF route)
`/wedge/trust/score` computed scores and returned them without ever writing to the `TrustScore` table. Now calls this route after every compute, which upserts the row. A driver's score from yesterday is no longer gone.

### 6. Trust score live fetch — `trust.tsx`
`TrustView` rendered only hardcoded numbers from `lib/tyre/data.ts`. Now fetches `GET /api/v1/trust/scores` in a `useEffect` and overlays real persisted scores with a `live` badge on any driver that has one.

### 7. Real WhatsApp send — `app/ai/whatsapp/graph_client.py` (new)
`WhatsAppDriverBot.__init__` set `self._whatsapp_token = ""` and every send was a comment. `graph_client.py` is the shared Meta Graph API client: real `POST /{phone_number_id}/messages` calls, retry on network errors, interactive buttons, and a `send_with_sms_fallback()` composition. Used by driver_bot, upi_escrow notifications, and consignee_confirm.

### 8. SMS fallback — `graph_client.py`
`docs/ARCHITECTURE.md` §13 failure-mode table: "Meta Graph API down — no mitigation — Phase 3 must add SMS fallback for consignee confirm." Implemented now (MSG91 / Twilio) as `send_with_sms_fallback()`, used in every WhatsApp send path.

### 9. Voice onboarding persistence — `voice_onboarding.py` + `POST /api/v1/onboarding/voice`
Entity extraction was real; `# Real impl: db.voiceOnboarding.create` was a comment. Now persists via the BFF with an upsert on `driverPhone`. Returns a real Postgres `onboarding_id`.

### 10. FASTag real wallet — `fastag/service.py` + `GET+POST /api/v1/fastag/wallet`
Every wallet call returned `1500  # stub`. Now reads/writes `FastagWallet`/`FastagTransaction` rows via the BFF. Toll estimates and NETC verification remain honestly labeled `NOT_INTEGRATED` (requires an NHAI partner agreement, not a code fix).

### 11. RBAC enforcement — `backend/shared/auth/src/rbac-guard.ts` (new)
`requireRole(req, action)` was defined but had zero call sites. The system had bearer-token auth with no role check. Applied to: `loads:assign`, `trips:complete`, `trips:create`, `trips:start`, `trucks:manage`, `drivers:manage`, `rfp:create`, `rfp:award`, `fraud:check`, `fraud:resolve`, `admin:metrics`. RBAC matrix extended to cover all new actions.

### 12. Rate limiting on all routes
`rateLimitOrNull` was applied only to 7 routes (auth, copilot, voice, negotiate, pricing). Applied to every remaining route: `GET /loads`, `GET /trips`, `GET /trucks`, `GET /drivers`, `GET /fleet`, `GET /agents`, `GET /stats/hourly`, `GET /trust/scores`, and all new Phase 0 routes. Standard tier: 120 req/min. AI tier (fraud:check, loads:match): 20 req/min.

### 13. ApiKey issuance + verification — `backend/shared/auth/src/api-key.ts` (new)
`ApiKey` Prisma model existed since the 3-repo merge "but has no issuance or verification code." Implemented: `issueApiKey()` / `verifyApiKey()` / `revokeApiKey()` with SHA-256 hashing, opaque `tyre_live_` prefix keys, scope-based authorization. Route: `POST/GET/DELETE /api/v1/auth/api-keys` (admin-only, rate limited).

### 14. PII field-level encryption — `backend/database/prisma/pii-encryption.ts` (new)
`app/security/pii_encryption.py` existed on the Python side. The Prisma Client Extension that would transparently encrypt/decrypt UPI IDs, GSTIN, and license numbers was not wired. Now wired as a `$extends` extension on the exported `db` client — AES-256-GCM, `enc:v1:<iv>:<authTag>:<data>` on-wire format, pass-through for legacy unencrypted rows.

### 15. Razorpay HMAC webhook handler — `POST /api/v1/webhooks/razorpay` (new)
`docs/ARCHITECTURE.md` §6.3: "Razorpay webhook handling (HMAC-verified) replaces any LLM-narrated status." No such handler existed. Verifies `X-Razorpay-Signature` header with `crypto.timingSafeEqual` before trusting any payload, then updates `UpiEscrowTransaction.status` for `payout.processed` / `payout.failed` / `payout.reversed` events.

### Supporting infrastructure added
- `backend/shared/auth/src/internal.ts` — service-to-service auth for ai-gateway → BFF
- `POST /api/v1/escrow/events` — ledger write-back (fund/advance/balance/refund)
- `GET /api/v1/escrow/[id]` — real escrow status read
- `POST /api/v1/escrow/notify-broker` — broker settlement notice (dashboard path)
- `GET /api/v1/trust/scores` — batch trust score read
- `POST /api/v1/onboarding/voice` — voice onboarding persistence
- `loads/assign` and `trips/[id]/complete` — wired to real escrow (advance + balance release)
- `.env.example` — 10 new env vars documented with generation instructions
- `pyproject.toml` — `razorpay>=1.4.2` added

---

## Milestone 0 — AXLE v3.2 (pre-June 2026)

**What it was:** A Turborepo monorepo for a voice-first freight wedge targeting the Bihar–Jharkhand–UP corridor. Next.js 16 web app (frontend + BFF routes), Python FastAPI AI gateway, shared packages for `db`, `i18n`, `auth`, `ui`, `ai-client`. Wedge-scoped: 5 languages, 4 AI agents, UPI-only escrow, India-only Y1.

**What was right:** The domain model. 32 Prisma models covering load/trip/truck/driver/broker with the right granularity for Indian road freight. Multi-region/multi-currency/multi-rail in the schema from day one. The wedge thesis itself — win the driver with voice + UPI escrow, the broker follows — was correct and stayed correct through every later iteration.

**What was wrong:** Three things, in order of severity. (1) Auth was decorative — `authorize()` was a stub returning a hardcoded fake user for any phone+OTP combo, and the NextAuth route handler that `middleware.ts` was calling didn't even exist (deploy-breaking bug). (2) Rate limiting was dead code — `security/rate_limiter.py` existed but was never instantiated or called from anywhere, so the LLM-cost-bearing routes (`voice/process`, `copilot/chat`, `negotiate`, `pricing`) had zero protection. (3) The escrow system looked real but wasn't — `upi_escrow.py` had `# Stub for now` above every method body, and `payment.py` was asking an LLM to hallucinate transaction JSON.

**What shipped with it:** `docs/ARCHITECTURE.md`, `docs/VOICE_PIPELINE.md`, `docs/I18N_ROADMAP.md`, `docs/SECURITY.md`, `docs/CONTRIBUTING.md`, three strategic-brief PDFs.

---

## Milestone 1 — v3.2 first-principles audit (early June 2026)

**What changed:** A panel-of-10 brutal audit of v3.1 (the predecessor that had 115 locales, 20 countries, 10 agents, 7 payment rails all live in Y1). Verdict: 60% vision, 30% defensible, 10% dangerous. The audit cut the dangerous 10%, kept the defensible 30%, replaced the visionary 60% with a wedge that can reach PMF in 90 days.

**Removed (7):** Stablecoin escrow for Africa (RBI blocks crypto — regulatory suicide). TYRE Protocol by Q1 2027 (no leverage without $30M+ GMV/mo — investor storytelling). Smart contracts for insurance (insurers won't integrate with startup smart contracts). Multi-modal booking (truck + rail + ship — operationally brutal). Tier 4 languages (CJK + Russian + German — irrelevant for emerging-market logistics). Carbon/ESG tracking in Y1 (shippers pay for this in Y2+ at scale). 95% voice coverage target (wrong — realistic is 65/20/10/5).

**Modified (9):** Language count 115 → 5 in Y1 (hi, bho, en + bn, mr in H2). AI agents 10 → 4 in Y1 (Dispatch, Pricing, Fraud, Payment). Countries 20 → 1 in Y1 (India only). Multi-rail escrow 7 → 1 in Y1 (UPI via Razorpay only). Voice negotiation auto-pilot killed — driver must approve each counter. Voice peer-to-peer rate sharing Y1 → Y2 (needs 10K+ drivers for crowd-sourced rates). Driver credit scoring Y1 → Y2 (NBFC partnerships take 12-18 months). Cross-language conversation sync Y1 → Y2 (research-grade). Broker liquidity pool Y1 → Y2+ (needs NBFC license).

**Merged (2):** Voice complaints + voice training → single Voice Support Agent (Y2+). Broker reputation NFT + broker risk score → Broker Reputation Graph (Postgres + verification badge, no NFT buzzword).

**Delayed (20):** Driver credit scoring, sentiment analysis, predictive maintenance, truck utilization dashboard, automated scheduling, per-truck profitability, AI co-broker, TReDS factoring, dock appointment scheduler, multi-modal, carbon tracking, AI freight spend audit, per-region compliance, broker liquidity pool, smart contract detention pay (modified to GPS auto-invoice), insurance claim automation, driver health insurance, reverse logistics, part-load aggregation, cross-state permit automation. All preserved in code as Y2+ stubs.

**Kept (17):** Voice load search (Hindi + Bhojpuri), voice-first onboarding, WhatsApp voice bot, UPI escrow with instant ₹10K advance, GPS-verified payment release, auto e-way bill from invoice OCR, GSTIN verification, AI photo tamper detection on POD, geo-fenced load tracking, real-time market rate dashboard, return-load matching engine (Y1 H2), smart contract detention pay (modified to GPS-triggered auto-invoice), dialect-aware STT, bilingual display, auto-detect driver language, voice fallback chain, broker dashboard.

**Added (8):** Truck photos + condition verification (TruckPhoto model, 7 photos per truck). Consignee WhatsApp confirmation (ConsigneeConfirmation model, one-tap confirm at delivery). Return-load pre-booking (ReturnLoadMatch model). FASTag integration (FastagWallet + FastagTransaction). Last-mile routing AI (LastMileRoute model). Voice-first onboarding (VoiceOnboarding model). UPI escrow with instant ₹10K advance as the explicit wedge (UpiEscrowAccount + UpiEscrowTransaction). Wedge API router (`/wedge/*` prefix, single entry point for all Y1 endpoints).

**Why:** The audit's core insight was that v3.1's breadth was a churn driver, not a growth driver — a driver who tries Bhojpuri voice search and gets mis-transcribed 30% of the time does not come back. Cutting to a 5-locale, 4-agent, 1-country, 1-rail wedge wasn't a downgrade; it was the precondition for any of those features actually working.

**Output:** `docs/V3.2-FIRST-PRINCIPLES.md` (the brutal audit), `docs/V3.2-CHANGES.md` (the cut/kept/added scorecard), `docs/V3.2-ROADMAP.md` (the 30d → 24m plan).

---

## Milestone 2 — TYRE v1.0 rename + transformation (June 20, 2026)

**What changed:** AXLE → TYRE. Brand rename across every file, plus a 12-deliverable audit-and-rebuild pass: repository audit, architecture audit, product audit, UX audit, brand rename report, folder structure redesign, missing features report, technical debt report, startup readiness report (at 100/1K/10K/100K users), 5-iteration improvement report, final architecture, master TODO list (39 P0 / 47 P1 / 37 P2 / 250 P3 engineer-days), risks & opportunities.

**Added:** Premium UI transformation — brand gradient (pink → orange → amber, Jeton-inspired), 8 focused landing components (was a 285-line monolith), 9 app views grouped into 4 nav sections (Operations / Risk / Insights / Account), Copilot drawer, Voice Studio, Analytics, Marketplace, Payments, Trust views. All 48 shadcn/ui primitives. Custom hooks (`use-voice-command`, `use-upi-escrow`, `use-mobile`, `use-toast`). GitHub Actions CI/CD (ci.yml, deploy.yml, i18n-nightly.yml).

**Preserved (not stripped):** Full Python FastAPI AI gateway (10 agents, 13 AI sub-modules, 4 voice components, 4 security modules, i18n, 16 test files). All 6 packages. Full BFF API routes (20+ endpoints). i18n locale routing + 7 locale message files. All infra (Docker, K8s, Helm, Terraform, observability). All scripts. All existing docs (renamed) + new transformation report.

**Why:** The rename wasn't cosmetic — it marked the moment the codebase stopped being "a wedge product with a wide vision attached" and started being "the wedge product, full stop." The 12-deliverable audit was the first honest accounting of what was real, what was stub, and what was missing.

**Output:** `TYRE-Transformation-Report.md` at the repo root (now in `docs/archive/`).

---

## Milestone 3 — 3-repo merge (June 21, 2026)

**What changed:** Three repos merged into one. Repo A = TYRE v1.0 (the result of Milestone 2). Repo B = `axle-platform` (a from-scratch reimplementation on Express + TS + Prisma — different stack, same product idea). Repo C = `axle-v3` (AXLE v3.2, the pre-rename codebase).

**The most important finding:** A and C were not three independent codebases — they were the same codebase at two points in time. A's own transformation report (Milestone 2) documents the engineering pass that took C and rebranded/hardened it into A. B was the genuinely independent third codebase: smaller domain model (15 Prisma models vs. A's 33), India-only fraud agent (vs. A's multi-region), TS agents calling Groq directly (vs. A's Python agents via orchestrator). **But B's auth subsystem was real, complete, and tested. A's equivalent was a stub.**

**The decision:** Keep TYRE's already-superior architecture as the base. Port the one subsystem where `axle-platform` was genuinely ahead (auth). Do not stand up a second backend service — running both Next.js BFF + FastAPI gateway *and* a parallel Express/Prisma service against the same DB would itself be the architectural duplication the merge was supposed to eliminate.

**What was ported (from B):**
- `RefreshToken`, `AuditLog`, `ApiKey` Prisma models (adapted to A's `cuid()`/`@map` conventions).
- `backend/shared/auth/src/jwt.ts` — bcrypt password hashing, HS256 access tokens, opaque rotating refresh tokens hashed in Postgres.
- `backend/shared/auth/src/audit.ts` — append-only audit log writer.
- `backend/shared/auth/src/otp.ts` — Redis-backed phone OTP issue/verify (replaces the dead-end TODO in the original `authorize()`).
- `backend/shared/auth/src/rate-limit.ts` — tiered (standard/auth/ai) Redis fixed-window limiter for Next.js route handlers.
- `frontend/web/app/api/auth/[...nextauth]/route.ts` — the route handler `middleware.ts` had been calling but that didn't exist (deploy-breaking bug, fixed).
- `frontend/web/app/api/v1/auth/{register,login,refresh,logout,me}/route.ts` — REST bearer-token endpoints.

**What was fixed in place (in A, not ported):**
- `backend/ai/gateway/app/security/rate_limiter.py` — `_check_redis` was a stub silently delegating to memory; implemented as a real Redis sorted-set sliding window.
- `backend/ai/gateway/app/main.py` — `RateLimiter` (previously instantiated nowhere) is now created in the app lifespan and enforced via global middleware, tiered by route prefix (`voice`, `onboarding`, `verification`, `default`).
- `backend/ai/gateway/app/security/jwt_auth.py` — verifies the same HS256 tokens signed by `@tyre/auth/jwt.ts`, for endpoints reached directly by the browser (SSE voice sessions) rather than via the BFF.

**What was restored (from C):** `.env.example`, `.gitignore` — A had dropped these by accident; C still had them. Extended with new auth/rate-limit vars.

**What was NOT ported (and why):** B's Express app shell, controllers, repositories, validators outside auth, `ai/agents/*.ts`, `ai/providers/*`, `ai/gateway.ts`, `prom-client` setup, nginx config. All are either functionally superseded by A's existing equivalents or specific to a server architecture (Express) this repository doesn't use.

**Conflicts resolved:**
- Two `User` auth models (A's NextAuth-only vs. B's JWT-only) → kept both, scoped to different callers. NextAuth (cookie session, phone-OTP) for the browser; bearer-token layer for mobile clients, the SSE voice endpoint, and service-to-service calls. Both read/write the same `User` table — one identity, two transports. A genuine architectural need, not duplication.
- B's TS fraud/negotiation agents vs. A's Python agents → A's Python versions kept, B's not copied in. Verified line-by-line: same prompts, same fallback logic, B's is a strict subset (India/GSTIN-only vs. A's multi-region).
- B's Express `rateLimit.middleware.ts` vs. A's dead `security/rate_limiter.py` → neither copied verbatim. A's Python class fixed in place; new TS module written for the Next.js side (because `express-rate-limit` can't attach to App Router route handlers).

**Startup-readiness delta:**
| Dimension | Before this merge | After |
|---|---|---|
| Auth | Decorative — any phone+OTP combo "worked" against a stub | Real password hashing, signed tokens, revocable sessions, audit trail |
| Abuse/cost protection | None — LLM-bearing routes had no limits | Tiered rate limiting on both the BFF and the AI gateway |
| Deployability | `withAuth()` middleware pointed at a non-existent route — would break in production | NextAuth route restored |
| Local dev onboarding | No `.env.example` — vars reverse-engineered from `config.py` | `.env.example` restored and extended |

**Remaining gaps (honest technical debt — not fixed in this pass):**
- Rate limiting is wired into the 4 highest-value routes and all new `/auth/*` routes. The remaining ~15 routes under `frontend/web/app/api/v1/*` should get the same `rateLimitOrNull("standard", …)` one-liner — pattern is established, just needs repo-wide application.
- `RBAC.can()` exists and is now backed by a real session, but no route currently calls it server-side to gate writes (e.g., only `operator`/`admin` should hit `/api/v1/loads/assign`).
- `ApiKey` model was added (for future service-to-service/webhook auth) but has no issuance/verification code yet — scoped out as Y2.
- No automated tests were added for the new auth routes.
- `pnpm install` / `prisma generate` / `tsc` could not be run in the merge environment (no network access to the pnpm workspace registry). Changes were checked by manual review, brace-balance verification, and Python AST parsing of every edited `.py` file. **Run `pnpm install && pnpm --filter @tyre/db db:generate && pnpm typecheck` before deploying.**

**Output:** `MERGE_REPORT.md` at the repo root (now in `docs/archive/`).

---

## Milestone 4 — Current state (June 21, 2026, post-merge)

**What's real:** Auth (NextAuth + JWT, post-merge). Rate limiting (4 highest-value BFF routes + all `/auth/*` routes, post-merge). Dispatch, Pricing, Fraud agents (Python, rule-based fallbacks). Voice pipeline (Whisper → NLU → MT → TTS, provider-abstracted). Schema (33 Prisma models, multi-tenant, multi-region ready). Infra (Docker, K8s, Helm, Terraform, observability). i18n (5 Y1 locales loaded, 110 registered for future).

**What's stubbed or hallucinated:** UPI escrow service (`upi_escrow.py` — every method returns fabricated IDs with `# Stub` comment). Payment Agent (`payment.py` — asks LLM to hallucinate transaction JSON, including fake `razorpay_transfer_id`). Trust score persistence (`/wedge/trust/score` computes and returns, never writes to `TrustScore` table). Trust score UI (`trust.tsx` reads hardcoded static numbers from `lib/tyre/data.ts`). WhatsApp driver bot (intent detection real, `_handle_load_search` returns canned loads, `self._whatsapp_token = ""`). FASTag wallet (fabricated balances). Voice onboarding (extracts entities but doesn't persist). Compliance docs (model exists, no e-way bill / GST invoice / OCR pipeline wired).

**What's designed but not enforced:** RBAC matrix exists, no route calls it server-side. `ApiKey` model exists, no issuance/verification code. PII encryption module exists, Prisma middleware not wired. Sentry + PostHog flagged as P0 in the original transformation report, not yet implemented.

**Where the doc set landed (this milestone):** 13+ docs in the repo before this cleanup. Consolidated to 4 — `ARCHITECTURE.md`, `PHASE-PLAN.md`, `CHANGELOG.md` (this file), `README.md`. All superseded docs moved to `docs/archive/` for reference.

**The honest summary:** The architecture is strong, the domain model is strong, the wedge thesis is strong. The parts of TYRE that look most impressive in a demo are the parts most likely to be entirely simulated. Phase 0 of [`PHASE-PLAN.md`](./PHASE-PLAN.md) exists to close that gap before any later phase is built on top of it.

---

## Next milestone — Phase 0 (not yet started)

**What ships:** Real Razorpay calls in `upi_escrow.py` (sandbox first). `payment.py` rewired to call `upi_escrow.py` instead of hallucinating. Trust score endpoint writes to `TrustScore` table. Trust score UI fetches from persisted scores. Real WhatsApp Meta Graph API send-call. Real `Load` table query from `_handle_load_search`. Full stub-vs-real audit of `FastagWallet`, `VoiceOnboarding`, `ComplianceDoc`, voice pipeline. Rate-limit + RBAC enforcement applied repo-wide.

**Exit gate:** One driver + one broker + one load complete accept → ₹10K advance actually lands in a real (sandbox) UPI account → POD upload → balance release, with every step backed by a database row, not an LLM guess.

**Why it's not started:** This changelog entry exists because the cleanup happened, not because Phase 0 happened. Phase 0 is the next thing.

---

## Archive pointer

All superseded docs (`V3.2-FIRST-PRINCIPLES.md`, `V3.2-CHANGES.md`, `V3.2-ROADMAP.md`, `MERGE_REPORT.md`, `TYRE-Transformation-Report.md`, `I18N_ROADMAP.md`, `VOICE_PIPELINE.md`, `SECURITY.md`, `CONTRIBUTING.md`, original `ARCHITECTURE.md`, plus the three strategic-brief PDFs) are in [`docs/archive/`](./archive/). They're kept for reference — they document the reasoning behind decisions that are now baked into the codebase — but they are no longer the source of truth. If a conflict arises between an archived doc and a current doc, the current doc wins.
