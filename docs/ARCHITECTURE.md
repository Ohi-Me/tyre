# TYRE — Architecture

> The single source of truth for how this system is wired. If you're about to write code that touches more than one process or one DB table, read this first.
>
> **Tone note:** this doc calls out stubs, fake-LLM-transactions, and disconnected implementations by name. That's intentional — pretending a stub is real is how Phases 2–10 get built on top of nothing. See [`PHASE-PLAN.md`](./PHASE-PLAN.md) Phase 0 for the cleanup plan.

---

## 1. High-Level System Diagram

```
                              ┌────────────────────────────────────┐
                              │            End Users               │
                              │  driver / shipper / broker / admin │
                              └──────────────┬─────────────────────┘
                                             │  HTTPS (Caddy auto-TLS)
                                             ▼
                          ┌────────────────────────────────────────┐
                          │          Caddy Reverse Proxy           │
                          │   /api/ai/*  →  tyre-ai (FastAPI)      │
                          │   /voice/*   →  tyre-ai                │
                          │   /wedge/*   →  tyre-ai                │
                          │   /*         →  tyre-web (Next.js)     │
                          └─────┬──────────────────────┬───────────┘
                                │                      │
                  ┌─────────────▼──────────┐  ┌────────▼────────────┐
                  │       tyre-web         │  │      tyre-ai        │
                  │   Next.js 16 App Router│  │   Python FastAPI    │
                  │                        │  │                      │
                  │  ┌──────────────────┐  │  │  ┌────────────────┐ │
                  │  │  React UI        │  │  │  │ Orchestrator   │ │
                  │  │  (10 app views)  │  │  │  │ (LangGraph)    │ │
                  │  └──────────────────┘  │  │  └───────┬────────┘ │
                  │  ┌──────────────────┐  │  │          │          │
                  │  │  BFF API routes  │  │  │  ┌───────▼────────┐ │
                  │  │  /api/v1/*       │──┼──┼─▶│ 10 AI agents   │ │
                  │  └──────────────────┘  │  │  │ + Voice pipe   │ │
                  │  ┌──────────────────┐  │  │  │ + Wedge API    │ │
                  │  │ NextAuth (cookie)│  │  │  └───────┬────────┘ │
                  │  │ + JWT (bearer)   │  │  │          │          │
                  │  └──────────────────┘  │  └──────────┼──────────┘
                  └────────────┬───────────┘             │
                               │                         │
              ┌────────────────┼─────────────┐           │
              ▼                ▼             ▼           ▼
        ┌──────────┐    ┌───────────┐  ┌──────────┐  ┌──────────┐
        │PostgreSQL│    │   Redis   │  │ Qdrant   │  │  Kafka   │
        │   16 PG  │    │  7 (HA)   │  │ (vectors)│  │ (events) │
        └──────────┘    └───────────┘  └──────────┘  └──────────┘
                               │
                               ▼
                  ┌────────────────────────────────┐
                  │      External Services         │
                  │  • Groq (Llama 3.3 70b)        │
                  │  • OpenAI Whisper (STT)        │
                  │  • NLLB-200 (translation)      │
                  │  • ElevenLabs / Azure (TTS)    │
                  │  • Razorpay Route (UPI escrow) │
                  │  • NIC (e-way bill, Y2+)       │
                  │  • Google Maps                 │
                  │  • Meta Graph API (WhatsApp)   │
                  └────────────────────────────────┘
```

The diagram is the easy part. What matters is which arrows actually carry real data today and which are decorative — see [§8 Stub vs Real](#8-stub-vs-real-the-brutal-truth) for that.

---

## 2. Design Principles

### 2.1 BFF pattern, not full separation

The Next.js app keeps its API routes as a Backend-for-Frontend. It owns auth (NextAuth cookie sessions + JWT bearer tokens), input validation (Zod), DB writes (Prisma), and cache invalidation (Redis). It delegates every AI call — LLM completions, voice pipeline, agent orchestration — to the Python `ai-gateway` over HTTP. The split is justified because the two ecosystems have non-overlapping strengths: TypeScript wins at UI type-safety and developer velocity on the frontend, Python wins at the actual AI/ML libraries (LangGraph, transformers, NLLB-200, Whisper client SDKs). Maintaining two ORMs or two auth systems would be the cost of this split, and we explicitly don't pay it: there is one Prisma schema, one `User` table, one Redis, one set of Zod schemas mirrored to Pydantic.

What we get from this split is independent scaling: the web tier can run 30 pods at ~5K RPS each for ~150K RPS sustained, while the AI gateway runs 20 pods at ~200 concurrent agent calls each. A voice request and a load-list fetch don't compete for the same worker pool. What we lose is the operational simplicity of one process — debugging a failed voice request now requires correlating Next.js logs, FastAPI logs, and Postgres rows. We accept that cost because the alternative (one Node process doing both LLM calls and SSR) is a known death spiral for any AI-heavy product.

### 2.2 Multi-tenant from day 1

Every domain entity (`Load`, `Trip`, `Truck`, `Driver`, `Broker`, `ShipperRFP`, `ComplianceDoc`, etc.) carries an `orgId` and every Prisma query filters by it. This is over-engineered for the Y1 wedge — there will be one org (TYRE itself) operating in one corridor for the first 6 months — and we did it anyway for two reasons. First, the schema is the cheapest place to add multi-tenancy and the most expensive place to retrofit it; doing it later means a migration touching every table and every query. Second, multi-tenancy is what unlocks the eventual Tier 2/3 revenue lines (white-label deployments for state freight exchanges, SaaS-to-logistics-companies) without a rewrite. The cost of carrying an `orgId` column through Y1 is near-zero; the cost of adding it in Year 3 is a multi-quarter migration.

### 2.3 Multi-region, multi-currency, multi-rail — in the schema only

The `Region` enum drives currency (ISO 4217), compliance APIs, payment rails, driving side, distance unit, and diesel/toll/driver cost assumptions. The schema supports 7+ regions and 7+ payment rails. **In Y1 we use exactly one of each: India, INR, UPI-via-Razorpay.** The rest exist as type definitions and `phase: "FUTURE"` registry entries — present so that expanding to Nigeria (M-Pesa) or Brazil (Pix) is a configuration flip, not a schema migration. The gap between "supported in the data model" and "actually wired up" is most of the work in [`PHASE-PLAN.md`](./PHASE-PLAN.md).

### 2.4 Tiered i18n — 5 active, 110 registered

Y1 ships 5 locales loaded into `next-intl` routing: `hi`, `bho`, `en`, `bn`, `mr`. The other 110 locales (Tamil, Telugu, Swahili, Hausa, Portuguese-BR, …) are registered in `backend/shared/i18n/src/locales.ts` with `phase: "Y2"` / `"Y3"` / `"FUTURE"` markers and **deliberately not loaded into the Y1 build**. Adding locales faster than voice quality supports them is a churn driver, not a growth driver — a driver who tries Bhojpuri voice search and gets mis-transcribed 30% of the time does not come back. The original v3.1 plan had 115 locales live in Y1; that was a vanity metric and was cut in the v3.2 audit.

### 2.5 Deterministic fallbacks on every agent

Every Y1 agent (`Dispatch`, `Pricing`, `Fraud`, `Payment`) has a rule-based fallback path. If Groq is down, the system still matches loads (rule-based dispatch ranking from region config), computes rates (rule-based pricing from cost tables), detects fraud (rule-based GSTIN + risk-scoring), and processes payments (rule-based escrow flow). This is what lets us hold SLAs during LLM provider outages — and the Y1 wedge's PMF signal (60-second advance release) cannot depend on Groq being up. The fallback is not a degraded mode we apologize for; it is a legitimate second implementation that the LLM path has to beat on quality, not just match on availability.

---

## 3. Request Lifecycle: Driver Voice Search

This is the canonical end-to-end flow. Every component below exists; whether each one is wired to real data is a separate question (see §8).

```
 1. Driver (Bhojpuri, Patna) taps mic in /bho
 2. Browser captures audio  →  POST /api/v1/voice/process  (Next.js BFF)
 3. BFF validates via VoiceProcessSchema (Zod)  →  auth check  →  forward to tyre-ai
 4. tyre-ai /voice/process  →  VoicePipeline:
      a. STT   : Whisper Large v3 transcribes Bhojpuri audio
                 →  "Patna se Delhi ka load chahiye, 12-chakka"
      b. Detect: fastText / Whisper language-detect  →  bho
      c. MT    : NLLB-200 translates Bhojpuri → English (for ops audit log)
      d. NLU   : Groq (Llama-3.3-70b) extracts
                 intent=FIND_LOAD, origin=Patna, dest=Delhi, truckType=12-wheeler
      e. Agent : DispatchAgent queries `Load` table for open loads BR→DL
      f. Reply : generated in English
      g. MT    : NLLB-200 translates reply English → Bhojpuri
      h. TTS   : ElevenLabs synthesizes Bhojpuri audio
                 (fallback: Hindi voice if Bhojpuri unavailable)
 5. Response returns to driver: text + audio + matched load cards
 6. Driver taps "Accept"  →  POST /api/v1/loads/assign
 7. PaymentAgent holds UPI escrow for advance  (POST /wedge/escrow/fund)
 8. ₹10,000 advance released to driver's UPI  (POST /wedge/escrow/advance)
 9. GPS pings stream from device  →  Trip.gpsPings[]
10. On delivery: driver uploads POD photo + consignee confirms via WhatsApp
11. Balance released  (POST /wedge/escrow/balance)
12. Trip marked COMPLETED, TrustScore recomputed
```

Steps 7–11 are the revenue-critical path. Step 7 became real in Phase 0: `upi_escrow.py` makes real Razorpay Route SDK calls (sandbox by default) with idempotency keys, and persists every event to `UpiEscrowAccount`/`UpiEscrowTransaction` via the BFF. Without `TYRE_RAZORPAY_KEY_ID`/`TYRE_RAZORPAY_KEY_SECRET` it runs a rule-based fallback that is explicitly labeled `simulated` in responses — see §8.

---

## 4. Data Model

50 Prisma models. The 3-repo merge landed at 33 (was 32 in AXLE v3.2, +1 `ApiKey` from `axle-platform`); since then the schema grew with the UPI escrow ledger (`UpiEscrowAccount`, `UpiEscrowTransaction`, `WebhookEvent`), dashboard widgets (`Notification`, `NotificationPreference`, `RoutePerf`, `RevenuePoint`, `WeatherAlert`), the freight marketplace (`FreightListing`, `FreightBooking`, `FreightPayoutEntry`), invoicing (`Document`, `TaxProfile`, `Invoice`, `InvoiceLine`), plus `BroadcastLog` and `TrustActionLog`. Key entity groups:

```
Identity & Tenancy
─────────────────
Organization  1──∞  User              (driver | shipper | broker |
                                          fleet_manager | operator |
                                          admin | super_admin)
                     │
                     ├───  RefreshToken  (rotating, DB-hashed, revocable)
                     └───  AuditLog      (append-only, every auth event)
                     └───  ApiKey        (Y2+ — model only, no impl yet)

Operations
──────────
Organization  1──∞  Load ────∞  Negotiation
              1──∞  Truck ──1  Driver
              1──∞  Trip ────∞  GpsPing
              1──∞  ShipperRFP ──∞  ComplianceDoc

Broker        1──∞  Load
              1──∞  FraudAlert

Money
─────
UpiEscrowAccount  1──∞  UpiEscrowTransaction
                     └── (advanceReleased, balanceReleased, refundToBroker)
FastagWallet      1──∞  FastagTransaction

Trust
─────
TrustScore        (verification | transaction | behavioral | peer — 0-1000, 5 tiers)
TruckPhoto        (7 photos per truck: front/back/sides/cargo/license/RC)
ConsigneeConfirmation  (one-tap WhatsApp confirm at delivery)
ReturnLoadMatch   (driver + outbound trip → candidate return loads)

Telemetry
─────────
AgentLog          (1 row per agent invocation, indexed [agentName, createdAt])
FleetMetric       (daily rollup per org + region)
TranslationCache  (NLLB results, 30-day TTL Redis + permanent Postgres)
VoiceInteraction  (transcript + intent + latency, Y1 consent-gated)
```

### 4.1 What this schema gets right

The domain model is the strongest part of this codebase — better than either source repo's. `Load`, `Trip`, `Truck`, `Driver`, `Broker` are modeled with the right granularity for Indian road freight (vehicle types from 6-wheeler to 22-wheeler, multi-stop trips, GSTIN-linked brokers, region-aware compliance docs). The `UpiEscrowAccount` model captures the full lifecycle (`PENDING_FUNDING → FUNDED → ADVANCE_RELEASED → BALANCE_RELEASED → COMPLETED`, with `DISPUTED` and `REFUNDED` branches) correctly. The `TrustScore` model decomposes a trust signal into 4 weighted categories, which is the right design for a feature whose value comes from being decomposable and explainable, not just a single number.

### 4.2 What's missing or wrong

`ApiKey` was added in the 3-repo merge but has no issuance or verification code — it's a model waiting for an implementation. The `TrustScore` table exists but is not written to by the Python service that computes scores (see §8). `VoiceOnboarding` and `FastagWallet` both have tables and API endpoints but the underlying service code returns stubbed/fabricated data (see §8). The schema is ahead of the implementation in these cases — which is acceptable as long as nobody mistakes the schema's existence for the feature's existence.

---

## 5. AI Gateway (Python / FastAPI)

### 5.1 Active agents (Y1)

| Agent | File | Y1 Status | Fallback |
|---|---|---|---|
| **Dispatch** | `app/agents/dispatch.py` | ✅ Real | Rule-based load ranking from region config |
| **Pricing** | `app/agents/pricing.py` | ✅ Real | Rule-based rate card from cost tables |
| **Fraud** | `app/agents/fraud.py` | ✅ Real | Rule-based GSTIN + risk scoring |
| **Payment** | `app/agents/payment.py` | ✅ Real (Phase 0) — deterministic router onto `upi_escrow.py`; the LLM never generates money-moving JSON | Rule-based path, explicitly labeled `simulated` when Razorpay keys are absent |
| **Trust** | `app/ai/trust/trust_score.py` | ⚠️ **Real algorithm, not persisted — see §8** | N/A (deterministic) |

### 5.2 Y2+ agents (files kept, not loaded)

`negotiation`, `compliance`, `contract`, `route`, `copilot`, `fleet` — six more agents exist as Python files under `app/agents/`, are registered in the orchestrator, but are explicitly Y2-scoped. They are not wired into the Wedge API router (`app/api/wedge.py`) and should not be reachable from Y1 UI. Keeping the files (rather than deleting them) is intentional: the Y2 work is to *finish* them, not to design them from scratch.

### 5.3 Voice pipeline

```
Audio in → STT (Whisper/Deepgram/Google) → LangDetect (fastText/Whisper)
        → MT (NLLB-200/DeepL/Google) → NLU (Groq Llama-3.3-70b)
        → Agent call → Reply text
        → MT (reverse) → TTS (ElevenLabs/Azure/OpenAI/Google) → Audio out
```

Provider selection is abstracted behind interfaces in `app/ai/speech/` and `app/ai/translation/`, with the first available + locale-supporting provider winning. Caching is two-tier: Redis (hot, 30-day TTL) for live translation requests, Postgres `TranslationCache` (cold, never expires) for the long tail of low-frequency language pairs. Cache hit rate target is >80% in production; below that, MT cost becomes a material unit-economics line item.

---

## 6. Payments & Escrow

This is the revenue-critical subsystem — the 1% take rate on every load is the Y1 revenue engine — and it is also where the gap between "looks real in a demo" and "is real" is widest. Two files matter:

### 6.1 `app/ai/payments/upi_escrow.py` — the well-designed stub

The escrow service is well-modeled: correct Razorpay Route flow (linked account creation → fund → transfer → payout), correct fee math (1% take rate deducted from balance, not advance), correct state machine. The `POST /v1/payouts` shape is sketched in comments. **Every method body has `# Stub for now — real impl uses razorpay-python SDK` above a block that fabricates a fake `acc_…` ID and returns `success=True`.** No money has ever moved through this code.

### 6.2 `app/agents/payment.py` — the hallucination layer

The Payment Agent doesn't call `upi_escrow.py`'s methods. It asks Groq to *generate JSON that looks like a transaction happened*, including a fabricated `razorpay_transfer_id` and `upi_transaction_ref`. The LLM has no Razorpay credentials, no DB access, no way to actually move money — it just produces plausible-looking strings. The rule-based fallback (`_rule_based_payment`) is no better: it generates `f"acc_{int(time.time())}"` as a Razorpay account ID, which is not a Razorpay account ID at all.

### 6.3 The fix path

Phase 0 of [`PHASE-PLAN.md`](./PHASE-PLAN.md) is to delete the hallucination path entirely. `payment.py` should call `upi_escrow.py`'s methods. `upi_escrow.py` should call Razorpay's SDK for real, in sandbox/test mode first. Idempotency keys (the original `TYRE-Transformation-Report.md` flagged this gap) go on every money-moving call. Razorpay webhook handling (HMAC-verified) replaces any LLM-narrated status. Until this is done, the escrow system is decorative and every downstream phase that assumes real money flow (Phase 2 settlement, Phase 7 lending, Phase 8 data licensing) is building on nothing.

---

## 7. Trust Scoring

The trust score is the long-term moat — the team itself calls it "THE MOAT" in code comments — and it currently exists in three disconnected implementations, zero of which talk to each other.

### 7.1 Implementation A: the algorithm (`app/ai/trust/trust_score.py`)

A genuinely good, deterministic scoring algorithm. 0–1000 score, 4 weighted categories (`verification_score`, `transaction_score`, `behavioral_score`, `peer_score`), 5 tiers (Bronze → Silver → Gold → Platinum → Diamond). The weights are sensible, the tier thresholds are sensible, the code is well-tested (`tests/test_trust_score.py` passes). This is the implementation to keep.

### 7.2 Implementation B: the API endpoint (`POST /wedge/trust/score`)

Exposed in `app/api/wedge.py`. Calls Implementation A, returns the score. **Stateless: computes and returns, never writes to the `TrustScore` Postgres table.** Every call recomputes from scratch; there is no history. A driver's score from yesterday is gone.

### 7.3 Implementation C: the frontend (`frontend/web/components/tyre/app/views/trust.tsx`)

Renders trust scores from `frontend/web/lib/tyre/data.ts` — hardcoded static numbers (`trustScore: 91`, `87`, `95`...). Does not fetch from Implementation B. Does not read the `TrustScore` table. A driver looking at their own trust tier in the app sees a number that has nothing to do with their actual transaction history.

### 7.4 The fix path

Phase 1 of [`PHASE-PLAN.md`](./PHASE-PLAN.md) makes `TrustScoreService` the only place a score is computed, persists every computation to the `TrustScore` table via the BFF, invalidates the cache so the UI never shows a stale tier, and surfaces the score to all three sides of a transaction at the point of decision. The algorithm in Implementation A is correct and stays; B and C get rewired to read from it.

---

## 8. Stub vs Real — the brutal truth

This is the section that doesn't exist in the original `docs/ARCHITECTURE.md` and should. Every subsystem listed here looks impressive in a demo and is, to varying degrees, not actually doing the thing it appears to do. **This is not a criticism of the architecture — the architecture is strong. It is a specific, fixable fact about the current state of the implementation.**

| Subsystem | File | Status | What's actually there |
|---|---|---|---|
| UPI escrow service | `app/ai/payments/upi_escrow.py` | **REAL (Phase 0)** | Real Razorpay Route SDK calls (sandbox by default) with deterministic idempotency keys; every funding/advance/balance/refund event persisted to `UpiEscrowAccount`/`UpiEscrowTransaction` via the BFF; webhook events deduplicated in `WebhookEvent`. Without keys, falls back to the rule-based path and labels the response `simulated` |
| Payment Agent | `app/agents/payment.py` | **REAL (Phase 0)** | Thin deterministic router onto `UpiEscrowService` — the LLM never generates transaction JSON; fabricated-ID paths removed |
| Trust score persistence | `POST /wedge/trust/score` | **STATELESS** | Computes and returns; never writes to `TrustScore` table |
| Trust score UI | `frontend/web/components/tyre/app/views/trust.tsx` | **MOCK-UI-ONLY** | Reads hardcoded numbers from `lib/tyre/data.ts` |
| WhatsApp driver bot | `app/ai/whatsapp/driver_bot.py` | **HALF-REAL** | Intent detection (regex) is real and good. `_handle_load_search` returns canned loads. `self._whatsapp_token = ""` — no Meta Graph API send-call implemented |
| FASTag wallet | `app/ai/fastag/service.py` | **STUB** | Returns fabricated wallet balances and toll estimates |
| Voice onboarding | `app/ai/onboarding/voice_onboarding.py` | **STUB** | Extracts entities from speech (real) but doesn't persist a `VoiceOnboarding` row |
| Compliance docs | `ComplianceDoc` model | **REAL-MODEL, NO-AUTOMATION** | Table exists, fields exist, no e-way bill / GST invoice / OCR pipeline wired |
| Dispatch agent | `app/agents/dispatch.py` | **REAL** | Queries `Load` table, rule-based fallback works |
| Pricing agent | `app/agents/pricing.py` | **REAL** | Computes rates from region cost tables |
| Fraud agent | `app/agents/fraud.py` | **REAL** | GSTIN verification + risk scoring works |
| Auth (post-merge) | `packages/auth/` + `/api/v1/auth/*` | **REAL** | bcrypt + JWT + rotating refresh tokens + audit log (ported from `axle-platform` in the 3-repo merge) |
| Rate limiting (post-merge) | `app/security/rate_limiter.py` + `@tyre/auth/rate-limit.ts` | **REAL** | Wired into `/voice`, `/wedge/onboarding`, `/wedge/verification`, `/agents`, `/auth/*` and the 4 highest-value BFF routes |
| NextAuth route handler | `frontend/web/app/api/auth/[...nextauth]/route.ts` | **REAL (was broken)** | Restored in the 3-repo merge — `middleware.ts` had been calling a non-existent route |
| RBAC enforcement | `backend/shared/auth/src/index.ts` `RBAC.can()` | **DESIGNED, NOT ENFORCED** | Matrix exists, no route currently calls it server-side to gate writes |

**The pattern:** the AI/ML-flavored subsystems were the stubs; the infrastructure subsystems (auth, rate limiting, routing, validation) are real, mostly because the 3-repo merge just fixed them. Phase 0 of [`PHASE-PLAN.md`](./PHASE-PLAN.md) exists to close this gap before any later phase is built on top of it — escrow and the payment agent are closed as of Phase 0; trust persistence, WhatsApp send, FASTag, and voice onboarding remain open.

---

## 9. Security & Auth

### 9.1 Two transport mechanisms, one identity

The browser app uses NextAuth cookie sessions (phone-OTP login via `backend/shared/auth/src/otp.ts`, Redis-backed). Mobile clients, the SSE voice endpoint (which can't carry cross-origin cookies), and service-to-service calls use JWT bearer tokens (`/api/v1/auth/{login,refresh,me}` routes). Both read/write the same `User` table — one identity, two transports. This is a genuine architectural need, not duplication.

### 9.2 RBAC matrix

`backend/shared/auth/src/index.ts` defines a 7-role taxonomy (`driver`, `shipper`, `broker`, `fleet_manager`, `operator`, `admin`, `super_admin`) and a `can(action, resource)` matrix. **The matrix is correct; no route currently calls it.** The remaining gap from the 3-repo merge: server-side write gates (e.g., only `operator`/`admin` should hit `/api/v1/loads/assign`) need `RBAC.can()` calls added. The pattern is established; the application is incomplete.

### 9.3 Rate limiting

Three tiers: `standard` (general API), `auth` (login/OTP — stricter), `ai` (LLM-bearing routes — strictest, protects unit economics). Wired into the 4 highest-value BFF routes (`voice/process`, `copilot/chat`, `negotiate`, `pricing`) and all `/auth/*` routes. The remaining ~15 routes under `/api/v1/*` should get the same `rateLimitOrNull("standard", …)` one-liner; the pattern is established, just needs to be applied repo-wide.

### 9.4 PII encryption

`app/security/pii_encryption.py` exists for field-level encryption of PII (phone numbers, GSTIN, bank details) at rest. Implementation is present; integration with Prisma middleware is incomplete — the schema has `@@map` annotations for encrypted columns but the middleware that would transparently encrypt/decrypt is not wired.

---

## 10. Infra & Observability

### 10.1 Local dev

`infra/docker/docker-compose.yml` brings up Postgres 16, Redis 7, Qdrant, Kafka, and Caddy as a single stack. `pnpm dev` runs Next.js on :3000; `uvicorn app.main:app --reload --port 8000` runs the AI gateway. Caddy routes `/api/ai/*`, `/voice/*`, `/wedge/*` to :8000 and everything else to :3000.

### 10.2 Production

EKS ap-south-1 (Mumbai — closest to the Bihar-Jharkhand-UP corridor). Helm chart in `infra/helm/` deploys `tyre-web` and `tyre-ai` as separate Deployments with independent HPAs. Postgres on CloudNativePG (auto-failover, RPO < 5s). Redis as a 3-node cluster. Terraform in `infra/terraform/` provisions the VPC, EKS, RDS, and MSK.

### 10.3 Observability

OpenTelemetry traces from both services → OTel Collector → Tempo. Prometheus metrics (FastAPI via `prometheus-fastapi-instrumentator`, Next.js via custom `/metrics` route). Grafana dashboards in `infra/observability/grafana-dashboards/`. Sentry + PostHog integration is **flagged as P0 in `TYRE-Transformation-Report.md` but not yet implemented** — this is a real gap; production errors are currently only visible in container logs.

---

## 11. Performance Targets

| Metric | Target | Current | Gap |
|---|---|---|---|
| Web TTFB (p50) | < 200ms | ~180ms | ✅ |
| Web TTFB (p99) | < 800ms | ~650ms | ✅ |
| AI gateway negotiation | < 2s | ~1.4s | ✅ |
| AI gateway voice (full) | < 5s | ~3.8s | ✅ |
| **Advance release latency** | **< 60s (PMF signal)** | **N/A — not real** | ⚠️ Phase 0 |
| Locale switch (URL change) | < 100ms client | ~80ms | ✅ |
| DB query (indexed) | < 10ms | ~6ms | ✅ |

The 60-second advance release target is the PMF signal — the one number that determines whether TYRE has product-market fit. It cannot be measured today because the advance release is hallucinated by an LLM. Phase 0 unblocks this metric; Phase 2 ships it.

---

## 12. Scaling Limits (Current Architecture)

- **Web tier**: ~5,000 RPS per pod (Next.js standalone), HPA scales to 30 pods → ~150K RPS sustained. Sufficient for ~10M monthly active drivers at typical engagement.
- **AI gateway**: ~200 concurrent agent calls per pod, HPA scales to 20 pods → ~4K concurrent. Each voice request holds a worker for ~4s, so this is ~1K voice sessions starting per second.
- **Postgres**: r6g.large handles ~3K TPS; vertical scale to r6g.4xlarge for ~12K TPS. Read replica (P2 in `TYRE-Transformation-Report.md`) for analytics queries — not yet provisioned.
- **Redis**: 3-node cluster, ~50K ops/sec, sufficient for 1M+ drivers' session state and translation cache.
- **Kafka**: 3 brokers, ~100K events/sec, sufficient for 100K+ live trips' GPS ping streams.

These numbers are theoretical — none have been load-tested against the real system, because the real system doesn't yet process real transactions. Phase 2's exit gate (10 real transactions with zero manual intervention, latency under 60s) will produce the first real perf data.

---

## 13. Failure Modes & Mitigations

| Failure | Mitigation | Status |
|---|---|---|
| Groq down | All agents fall back to rule-based logic | ✅ Wired |
| Whisper down | Driver can type instead of speaking | ✅ UI fallback exists |
| NLLB down | Reply stays in English (degraded but functional for `bho`/`hi`/`bn`/`mr` speakers who understand Hindi/English) | ✅ |
| PostgreSQL primary down | CloudNativePG auto-failover to replica (RPO < 5s) | ✅ Configured |
| Redis down | Translation cache miss → slower but works; rate limiter falls back to in-memory | ⚠️ In-memory fallback is per-pod, not shared |
| Kafka down | GPS pings queued in browser, retried | ✅ |
| AI gateway down | Web BFF returns last-known state + retries with exponential backoff | ✅ |
| Razorpay down | Escrow cannot fund or release | ❌ No mitigation — Phase 2 must add queue-and-retry + manual ops runbook |
| Meta Graph API down (WhatsApp) | Driver bot cannot send messages; consignee confirmation flow breaks | ❌ No mitigation — Phase 3 must add SMS fallback for consignee confirm |
| Single-region AWS outage | Multi-AZ Postgres/MSK; planned multi-region active-active (Y3+) | ✅ Within region; ❌ Cross-region |

---

## 14. What we explicitly avoided

1. **GraphQL** — REST + Zod is sufficient at our scale; GraphQL's client flexibility isn't worth the server complexity.
2. **Microservices per agent** — 10 services would be operational overhead with no benefit. One Python process with one orchestrator is correct.
3. **gRPC** — HTTP/JSON is debuggable from a browser devtools panel; the perf gain from gRPC is not material at our scale.
4. **Custom ORM** — Prisma + raw SQL for hot paths (GPS ping insert, escrow ledger queries) is the right balance.
5. **Custom auth** — NextAuth is battle-tested for the browser session; JWT bearer for the API is standard. The 3-repo merge ported the real implementation rather than building a third one.
6. **WebSockets for everything** — Only used for live trip tracking where the driver app pushes GPS pings continuously. SSE for the rest (voice sessions, agent activity feed), plain HTTP for everything else.
7. **A second backend service** — The 3-repo merge explicitly did *not* stand up `axle-platform`'s Express app alongside the Next.js BFF. Running both against the same DB would be the architectural duplication the merge was supposed to eliminate. We ported the one subsystem that mattered (auth) and left the Express shell behind.

---

## 15. See also

- [`PHASE-PLAN.md`](./PHASE-PLAN.md) — what gets built, in what order, with what exit gates. Phase 0 is the cleanup of every "STUB" / "HALLUCINATED" / "MOCK-UI-ONLY" item in §8.
- [`CHANGELOG.md`](./CHANGELOG.md) — how the codebase got to its current state, milestone by milestone.
- [`/docs/archive/`](./archive/) — superseded docs (V3.2 audit, MERGE_REPORT, original ARCHITECTURE, etc.) kept for reference but no longer the source of truth.
