# NEXT.md — TYRE Production Roadmap (Phase N+1)

> **Status:** Implementation blueprint for the next development phase.
> **Audience:** Backend, Frontend, AI, Platform/DevOps, Security, QA, Design.
> **Scope note:** Work already shipped — real-data Reports, Voice Studio wired to `VoiceInteraction`, production Documents module + CRUD + migration, Dispatch view completion, pagination, validation, secret hardening, ADR-001, E2E harness, dashboard mock-panel removal — is treated as **baseline** and is not re-proposed here except where an item is an explicit *evolution* of it.
>
> **Phase 9 addendum (operator dashboard, this pass):** a full JWT auth stack shipped (bearer + rotating refresh + centralized `authFetch` + session-expiry redirect) and is now the foundation for every authenticated write in the app. On top of it: trip start/complete, truck maintenance toggle, a Dispatch assign-truck modal (load+truck picker → `POST /loads/assign`), a Notifications bell + inbox (`/notifications*`), a Billing view (invoice list + generate over the settlement engine), a Documents management view (full CRUD), and a direct Add-Driver form all went from "backend exists, no UI" to wired end-to-end. Per-workflow status lives in `audit_masterplan.md`; remaining gaps are listed there and in §11/§12 below rather than invented.

---

## 1. Executive Summary

### 1.1 Current production maturity
TYRE is a **pnpm/Turbo monorepo** with three runtimes: a Next.js 15 / React 19 web app that also hosts the BFF API (**76 `app/api/v1/*` route handlers**), a set of shared TypeScript packages (`@tyre/auth`, `@tyre/db`, `@tyre/ai-client`, `@tyre/i18n`, `@tyre/shared`), and a Python AI gateway (`backend/ai/gateway`, ~20 pytest suites). The Prisma schema has **50 models** across 15 migrations, with deliberate production hygiene (unique constraints, composite indexes, soft deletes, check constraints, an immutable payout ledger).

The transactional core — auth (bearer + refresh rotation + rate limiting + audit), freight marketplace CRUD, booking/escrow money flows, load→truck dispatch with real UPI escrow calls, and now Documents/Reports/Voice — is **genuinely production-grade**. The platform is best described as **"strong vertical core, thin horizontal platform."**

### 1.2 Current strengths
- **Money paths are correct**: transactional state machines, concurrency-guarded status transitions, idempotent refunds, immutable ledgers, HMAC-verified webhooks (Razorpay/WhatsApp/Telegram).
- **Auth is solid**: short-lived access tokens, opaque rotating refresh tokens, RBAC matrix with wildcard actions, per-IP rate limiting, audit logging, prod-secret fail-fast.
- **Schema discipline**: soft deletes, sequences for race-safe codes, composite indexes on hot paths, enums, check constraints.
- **AI is real, not demo**: a Python gateway with pricing/fraud/trust/voice/translation agents and pytest coverage; agent activity is persisted to `AgentLog`.
- **i18n is first-class**: locale registry, Hindi/Bhojpuri, sync tooling, nightly translation CI.

### 1.3 Current weaknesses (the theme of this phase)
1. **No realtime transport.** "Live" dispatch/tracking is client polling (`refetchInterval`). There is no WebSocket/SSE layer. This caps operational UX and wastes DB/API cycles at scale.
2. **SPA has no URL routing.** The app is a single page whose 12 views switch via a Zustand `appView` string. No deep links, no shareable URLs, no browser back/forward, no per-view SSR, weaker analytics attribution.
3. **No background job/queue system.** Escrow calls, notifications, and broadcasts run inline in request handlers. A slow downstream (ai-gateway, Razorpay) blocks the user request; failures are not durably retried.
4. **Observability is configured but not instrumented.** `infra/monitoring` ships otel-collector/prometheus/grafana configs, but the application emits no traces/metrics and has no error tracker (no Sentry/OTel in code). We are flying blind in production.
5. **Caching is auth-only.** Redis backs rate-limit/OTP/subscribe. Hot read paths (dashboard aggregate, marketplace feed) hit Postgres every time.
6. **Settlement/tax is absent.** No Invoice/GST/TDS/commission models — a hard requirement for Indian freight at enterprise scale.
7. **Tracking map is a stylized mock.** Real live tracking needs a tiles/geocoding provider and the existing driver-GPS data plumbed through.
8. **Design tokens are ad-hoc.** Hex colors (`#181410`, `#8FE03A`, …) are hardcoded across view components; theming/dark-mode/accessibility are inconsistent.

### 1.4 Major architectural observations
- **BFF-as-backend**: the "backend" is the Next API layer; `backend/api/*` is a partially-extracted domain layer (ADR-001). Duplication risk persists until the extraction completes.
- **Request-synchronous side effects**: money movement and messaging are done in the request path — the single biggest scale/reliability liability.
- **Polling instead of push**: acceptable at pilot scale, structurally wrong at "hundreds of thousands of shipments/day."
- **No API contract artifact**: no OpenAPI/Swagger; clients (web, future mobile, partners) integrate by reading route code.

### 1.5 Overall readiness score
**72 / 100** — "pilot-ready, not scale-ready." The core would survive a controlled launch to a few hundred operators. It would *not* survive multi-tenant enterprise traffic without the realtime, queue, caching, observability, and settlement work below.

| Dimension | Score | One-line rationale |
|---|---|---|
| Core transactional correctness | 9/10 | Transactions, idempotency, ledgers are right. |
| Security | 8/10 | Strong auth/webhooks; needs secrets rotation + audit coverage of all mutations. |
| Data model | 8/10 | Disciplined; missing settlement/tax + optimistic locking. |
| Scalability | 5/10 | Sync side-effects, no queue, no cache, polling. |
| Observability | 3/10 | Config exists; app uninstrumented. |
| Realtime | 2/10 | Polling only. |
| Frontend routing/UX | 5/10 | No URL routes; ad-hoc tokens; inconsistent states. |
| AI integration depth | 6/10 | Real agents; loosely coupled to workflows, no eval harness. |
| Testing | 6/10 | Unit + new E2E harness; E2E not in CI; no load/contract tests. |
| DevEx/DX | 6/10 | Good monorepo; no OpenAPI, thin local tooling. |

### 1.6 Priority matrix (impact × effort)
| | **Low effort** | **High effort** |
|---|---|---|
| **High impact** | OTel/Sentry instrumentation; wire E2E into CI; query cache on dashboard/marketplace; idempotency keys on webhooks | Realtime SSE backbone; Settlement/Tax engine; SPA→URL routing; Job queue |
| **Low impact** | Design-token extraction; consistent API envelope; naming cleanups | Full multi-region; chaos testing harness |

**Do-first (this phase):** (1) Realtime SSE backbone, (2) Job queue + async side-effects, (3) Observability instrumentation, (4) Settlement/Tax engine, (5) SPA URL routing. Everything else sequences behind these.

---

## 2. Repository Health Audit

Maturity scale: **L1 Prototype · L2 Functional · L3 Production · L4 Scale-ready · L5 Best-in-class.**

| Area | Maturity | Why |
|---|---|---|
| Frontend (app shell) | L3 | 14 views render real data behind JWT auth (`authFetch` + refresh + session-expiry guard); notifications bell wired. Still no URL routing, ad-hoc design tokens, inconsistent empty/error states on secondary views. |
| Backend (BFF API) | L3 | 76 routes, validated, rate-limited, transactional; missing consistent envelope, OpenAPI, and async offloading. |
| API design | L2 | Works, but response shapes vary (`{success,data}` vs bare objects), no versioning strategy beyond `/v1`, no contract tests. |
| Authentication | L3→L4 | Bearer + refresh rotation + RBAC + audit + prod fail-fast. Missing: session listing/revocation UI, step-up auth for money ops. |
| Marketplace | L3 | Full CRUD, booking money flow, pagination. Missing: saved searches, geo-ranked discovery, realtime new-load push. |
| Dispatch | L3 | Wired to real trips + agent activity, plus an assign-truck modal (load+truck picker → `POST /loads/assign`, releases UPI advance). Missing: realtime updates (polling), bulk assignment, constraint-aware matching UI. |
| Tracking | L1 | **Map is a mock.** No live GPS render, no geofence/arrival detection surfaced, no ETA on map. |
| Fleet | L2 | List + search; no maintenance scheduling, no utilization analytics drill-down. |
| Driver | L2 | CRUD + GPS fields + voice onboarding; no driver mobile surface, no availability calendar. |
| Documents | L3 | Model + CRUD API + derived expiry status + dashboard panel + seed, now with a dedicated management view (list/filter/create/edit/delete). Missing: file upload/storage (form takes a URL, not a file), OCR auto-extract, expiry push notifications. |
| Reports | L3 | Real compute API (revenue/fleet/drivers/trips) + catalog. Missing: export (PDF/XLSX), scheduling, saved report runs. |
| Voice | L3 | `VoiceInteraction`-backed panel + gateway pipeline. Missing: eval harness, guardrails, cost/latency dashboards. |
| AI (gateway) | L3 | Real agents + tests. Missing: model orchestration config, evaluation suite, confidence-gated human approval loops in-product. |
| Database | L3→L4 | Indexed, constrained, soft-deleted, sequenced. Missing: optimistic locking (version columns), settlement/tax models, partitioning plan for high-volume tables (`AgentLog`, `VoiceInteraction`). |
| Storage | L1 | `public/uploads/*` on local disk; no object store (S3/GCS), no signed URLs, no virus scan, no CDN. |
| Notifications | L2→L3 | `Notification`/`NotificationPreference` models + `notify()` primitive + inbox API (list/read/preferences) + a topbar bell with unread badge and mark-read, polled every 30s. Missing: external channel delivery workers (push/sms/whatsapp/email are preference-resolved but not dispatched), templating. |
| Payments | L3→L4 | Escrow/ledger/webhooks are strong; settlement engine (GST/TDS/commission split, execution-verified) + Invoice/InvoiceLine API + a Billing view (list + generate-from-completed-trip) now shipped. Missing: reconciliation reports, dispute flow, PDF export. |
| Admin | L1→L2 | `admin/metrics` + fraud APIs exist; no admin UI, org management, feature flags, or audit-log browser. |
| Mobile responsiveness | L2 | Tailwind responsive classes present but not audited; touch targets and tables not verified on small screens. |
| Performance | L2 | No query cache, no N+1 review, dashboard aggregate re-computed per request; no bundle budget. |
| Security | L3 | Strong auth/webhooks; needs full mutation audit coverage, object-storage hardening, step-up auth, dependency scanning in CI. |
| Monitoring | L1 | Collector/prometheus/grafana YAML exist; **no app instrumentation**, no error tracker, no SLOs. |
| CI/CD | L3 | CI runs lint/typecheck/test/build + db push/seed; **E2E not wired**, no deploy gate on E2E, no image scanning. |
| Infrastructure | L2 | Docker/Helm/K8s/Terraform scaffolding; values thin; no documented DR/backup/scaling runbook. |
| Testing | L2→L3 | Unit (vitest) + Python + new Playwright harness. Missing: CI E2E, load, contract, a11y, AI-eval tests. |
| Developer experience | L2→L3 | Clean monorepo + turbo; no OpenAPI, no seeded local "one-command demo", no Storybook, no codegen for API types. |

---

## 3. NEW FEATURES

Five production-grade features that fit TYRE's core and are **not** already built.

### Feature 1 — Realtime Event Backbone (SSE) + Live Presence

**Problem statement.** Dispatch and tracking are the operational heart of the product, yet updates arrive by polling (`refetchInterval: 10s`). Operators see stale data, the DB is hit on a fixed cadence regardless of activity, and there is no way to push "new load in your corridor," "driver arrived," or "payment released" the instant it happens.

**User stories.**
- *As a dispatcher*, when a driver's GPS updates or a trip changes status, I see it move on my board within ~1s without refreshing.
- *As a carrier*, I get a live toast when a matching load is posted in my lane.
- *As a shipper*, the tracking screen advances the truck marker and ETA in real time.

**Business value.** Higher operator throughput, lower "where is my truck" support load, a differentiator versus polling-based competitors, and reduced DB/API cost per active session.

**UX flow.** App boots → opens one SSE connection (`/api/v1/stream?topics=...`) scoped to the user's org/role → components subscribe to typed events via a `useRealtime(topic)` hook → optimistic UI reconciles with server truth → on disconnect, exponential-backoff reconnect + a "reconnecting" chip; on reconnect, a lightweight catch-up fetch closes gaps.

**Architecture.** An **event bus on Redis pub/sub** (Redis already provisioned). Producers (route handlers, workers) publish domain events (`trip.updated`, `gps.ping`, `load.posted`, `payment.released`, `booking.accepted`) to `tyre:events:<orgId>`. A single **SSE endpoint** subscribes the connection to the caller's org channel + role/topic filters and streams `text/event-stream`. This avoids a stateful WS server and works on serverless/edge-friendly runtimes with a Node runtime handler.

**Components.** `useRealtime()` hook; `RealtimeProvider` (connection + backpressure + last-event-id); `LiveBadge`; reconnect controller.

**Backend changes.** `emitEvent(orgId, type, payload)` helper in `@tyre/realtime`; publish calls added to `trips/*`, `freight/*`, `loads/assign`, `drivers/update-location`, escrow webhook. New `GET /api/v1/stream` (Node runtime, `dynamic=force-dynamic`) with auth, org-scoping, heartbeat comments every 15s, and `Last-Event-ID` replay from a short Redis stream (`XADD`/`XRANGE`).

**Frontend changes.** Replace `refetchInterval` in `dispatch`, `tracking`, `marketplace` with event-driven `queryClient.setQueryData`/`invalidateQueries`. Keep polling as a degraded fallback when SSE is unavailable.

**Database changes.** None required (Redis streams for replay). Optional `Outbox` table (see Feature 5) if we want guaranteed delivery.

**APIs.** `GET /api/v1/stream?topics=trips,loads,payments`; internal `emitEvent`.

**Background jobs.** A GPS fan-out worker (batches `driver.update-location` into `gps.ping` events at ≤1 Hz per driver to protect the channel).

**AI opportunities.** Stream agent activity live (`AgentLog` → `agent.event`) so the dispatch "Agent activity" panel becomes truly live; push confidence-gated approval prompts to the operator in real time.

**Security considerations.** SSE endpoint authenticates the bearer token, subscribes **only** to the caller's `orgId` channel (tenant isolation), rate-limits connection establishment, and never publishes PII beyond what the REST layer already exposes. Heartbeats + max-connection caps per user to prevent resource exhaustion.

**Scaling strategy.** Redis pub/sub scales horizontally across app instances; connections are stateless (any pod can serve any subscriber). For very high fan-out, shard channels by `orgId` and cap events/sec per channel with coalescing (e.g., GPS pings).

**Failure handling.** Client backoff + `Last-Event-ID` replay from the Redis stream (bounded retention, e.g., 5 min); if Redis is down, endpoint returns 503 and clients fall back to polling automatically.

**Analytics.** Track connection count, events/sec, reconnect rate, and "time-to-glass" (event emit → client render).

**Rollout plan.** Ship behind a `realtime` feature flag → enable for internal org → 5% of orgs → 100%. Polling stays as the safety net throughout.

**Testing checklist.** Unit (event serialization, org-scoping), integration (publish→receive), E2E (assign a load in one session, assert live update in another), soak test (10k idle connections), chaos (kill Redis → verify polling fallback).

**Future extensions.** Presence (who's online), typing indicators for in-app chat, collaborative dispatch (multiple dispatchers), and a partner webhook fan-out built on the same bus.

---

### Feature 2 — Settlement, Invoicing & Tax Engine (GST / TDS / Commissions)

**Problem statement.** TYRE moves money (advance + balance via escrow) but has **no invoicing, GST, TDS, or broker-commission accounting**. Indian enterprise freight cannot operate without compliant tax invoices, TDS deduction (194C), and auditable settlement statements. Today this is entirely absent.

**User stories.**
- *As a shipper*, after delivery I receive a GST-compliant tax invoice (with HSN/SAC, CGST/SGST/IGST split by place-of-supply).
- *As a fleet owner*, I get a settlement statement showing gross freight − TDS − platform commission = net payout, reconciled to escrow ledger rows.
- *As finance/admin*, I export a GSTR-ready register and a TDS register for a period.

**Business value.** Unblocks enterprise/GST-registered customers, enables the platform take-rate to be booked correctly, and creates a defensible compliance moat versus informal brokers.

**UX flow.** Trip completes → settlement is computed → invoice generated (PDF) → shipper/carrier see it under a new **Billing** view with status (Draft/Issued/Paid) → download/export → admin period-close exports registers.

**Architecture.** A pure **settlement service** (`@tyre/billing`) that takes a completed trip + org tax profiles and emits immutable `Invoice` + `InvoiceLine` + `TaxLine` + `SettlementStatement` rows. Deterministic, side-effect-free calculation; persistence + PDF render are separate steps (testable in isolation). Place-of-supply logic decides intra-state (CGST+SGST) vs inter-state (IGST).

**Components.** `BillingView`, `InvoiceCard`, `InvoiceDetailDrawer`, `SettlementTable`, `TaxProfileForm` (org GSTIN/PAN/state).

**Backend changes.** `computeSettlement(trip, orgTax, counterpartyTax, config)`; invoice numbering via a **Postgres sequence** (reuse the `tyre_*_seq` pattern) namespaced per org + financial year; PDF render via the existing document tooling. New routes: `POST /api/v1/invoices` (generate for a trip), `GET /api/v1/invoices` (list/filter/paginate), `GET /api/v1/invoices/[id]` (+ PDF), `GET /api/v1/settlements`, `GET /api/v1/tax/registers?type=gstr1|tds&period=`.

**Frontend changes.** New `billing` app view + route; invoice list with filters (status/date/counterparty), detail drawer, PDF download, export buttons.

**Database changes.** New models: `TaxProfile` (org GSTIN/PAN/state/regime), `Invoice`, `InvoiceLine`, `TaxLine`, `SettlementStatement`, `CommissionRule`. All immutable once `ISSUED` (corrections via credit notes). Indexes on `(orgId, financialYear, status)` and `(counterpartyOrgId, issueDate)`. Numbers via sequences.

**APIs.** As above; all money math server-side, validated with zod, role-gated (`billing:manage`).

**Background jobs.** Auto-generate invoice on `trip.completed` (async, via queue); nightly settlement reconciliation job cross-checking `FreightPayoutEntry`/`UpiEscrowTransaction` against invoices; period-close export job.

**AI opportunities.** Anomaly detection on settlements (payout ≠ expected), auto-classification of HSN/SAC, natural-language "explain this invoice" via the copilot.

**Security considerations.** Invoices are immutable financial records — append-only, full audit trail, role-gated, and never editable after issue (only credit/debit notes). GSTIN/PAN are PII → encrypt at rest (the repo already has a PII encryption key). Numbering must be gap-free per statutory requirement (sequence + transactional insert).

**Scaling strategy.** Settlement compute is O(1) per trip and queue-driven; PDF render is offloaded to a worker; registers are period-partitioned queries with covering indexes.

**Failure handling.** Idempotent generation keyed by `tripId` (one invoice per trip unless credited); if PDF render fails, the invoice row still exists (`ISSUED`, `pdfUrl=null`) and a retry job backfills the PDF.

**Analytics.** GMV, take-rate, TDS deducted, DSO (days sales outstanding), settlement latency.

**Rollout plan.** Draft-only mode first (compute + preview, no legal issue) → enable issuing for one pilot org with a real GSTIN → general availability with credit-note support.

**Testing checklist.** Golden-file tests for tax math (intra/inter-state, TDS thresholds, exemptions), sequence gap-free under concurrency, immutability enforcement, PDF snapshot tests, reconciliation job correctness.

**Future extensions.** e-Invoicing/IRN (GST portal) integration, e-way bill generation, credit/debit notes, multi-currency for cross-border, automated GST return filing.

---

### Feature 3 — ePOD + Document OCR Pipeline (Object Storage + Extraction)

**Problem statement.** Documents now have a model and CRUD, but files live on local disk (`public/uploads`), there is **no proof-of-delivery capture**, and document data (insurance number, expiry, RC details) is entered manually. Freight disputes and payment release hinge on verifiable POD; compliance hinges on accurate document metadata.

**User stories.**
- *As a driver*, at delivery I capture a photo/signature; it uploads and marks the trip POD-verified, which triggers balance release.
- *As an operator*, when I upload a vehicle insurance PDF, OCR pre-fills document number, issuer, and expiry for one-tap confirm.
- *As finance*, disputed deliveries show the POD artifact inline.

**Business value.** Faster, defensible payment release; fewer disputes; drastically less manual data entry; a clean audit trail per shipment.

**UX flow.** Driver taps "Confirm delivery" → camera/signature capture → direct-to-object-store upload via signed URL → server verifies + runs OCR/vision → `Trip.podVerified=true` emits `payment.release` → operator sees POD thumbnail on the trip.

**Architecture.** **Object storage (S3/GCS)** with server-issued **signed upload URLs** (files never proxy through the app server). An async **OCR worker** (queue-driven) calls the AI gateway's document-understanding endpoint, writes extracted fields back to `Document`/`Trip`, and sets a confidence score gating auto-apply vs human confirm.

**Components.** `PodCaptureSheet` (camera + signature pad), `DocumentUploader` (drag/drop + progress + retry), `OcrReviewDrawer` (confidence-highlighted fields).

**Backend changes.** `POST /api/v1/uploads/sign` (issues scoped signed URL + object key), `POST /api/v1/documents/[id]/ocr` (enqueue), `POST /api/v1/trips/[id]/pod` (attach POD → verify → emit release). Move existing `freight/upload` to signed-URL flow.

**Frontend changes.** Replace direct multipart posts with signed-URL uploads; POD capture in tracking/trip detail; OCR review UI in Documents.

**Database changes.** Add to `Document`: `fileKey`, `mimeType`, `sizeBytes`, `ocrStatus`, `ocrConfidence`, `extracted Json`. New `PodArtifact` (tripId, type=photo|signature|otp, fileKey, capturedAt, geo). Add `podArtifactId` to `Trip`.

**APIs.** Signed-URL issuance, OCR enqueue/result, POD attach; all validated + role-gated; virus-scan hook on finalize.

**Background jobs.** OCR worker; thumbnail generator; expiry-notification scheduler (documents nearing expiry → Notifications hub); orphaned-upload GC.

**AI opportunities.** Vision extraction (RC/insurance/PUC), signature/liveness checks, fraud signal if POD geo ≠ delivery geo, auto-tag document type.

**Security considerations.** Signed URLs are short-lived, scoped to a key prefix per org; server validates content-type/size on finalize; virus scan before marking usable; POD artifacts are PII/location-sensitive → encrypted, access-controlled, audit-logged. Never serve raw object-store URLs; always re-sign on read.

**Scaling strategy.** Uploads bypass the app server entirely; OCR is horizontally scaled workers with a bounded concurrency; CDN in front of read signed URLs.

**Failure handling.** Resumable/multipart uploads; OCR retries with backoff; if OCR fails, fields stay manual (no data loss); POD verification is idempotent per trip.

**Analytics.** POD capture rate, time-to-POD, OCR auto-apply rate, dispute rate before/after.

**Rollout plan.** Object storage + signed uploads first (no behavior change) → POD capture for one carrier → OCR pre-fill (confirm-required) → confidence-gated auto-apply.

**Testing checklist.** Signed-URL scope/expiry tests, content-type/size enforcement, OCR worker golden files, POD→release idempotency, virus-scan gate, GC correctness.

**Future extensions.** e-way bill capture, damage-detection vision, automated insurance renewal reminders, driver document wallet.

---

### Feature 4 — Predictive ETA & Dynamic Lane Pricing (AI)

**Problem statement.** ETA on tracking is static/absent and pricing is a single agent call. At scale, competitive advantage comes from **accurate ETAs** (SLAs, planning) and **dynamic lane pricing** (fill trucks, maximize margin). The data to learn from — historical `Trip`, `Load`, GPS pings, `VoiceInteraction` demand signals — already accumulates.

**User stories.**
- *As a shipper*, tracking shows a live ETA that updates with traffic/GPS and a confidence band.
- *As a carrier*, when posting availability I get a recommended price for the lane with a "why" (demand, distance, fuel, historical fill).
- *As ops*, a lane dashboard shows predicted demand vs capacity for the next 7 days.

**Business value.** Better SLA adherence, higher truck utilization, defensible pricing intelligence, and a data moat that compounds with volume.

**UX flow.** Tracking renders ETA + band from a prediction endpoint (refreshed via realtime GPS events). Listing creation shows an inline price suggestion with rationale and one-tap accept.

**Architecture.** A **prediction service** in the AI gateway exposing `/predict/eta` and `/predict/price`, backed by feature stores derived from historical trips (haversine distance, lane medians, time-of-day, seasonality, live GPS progress). Start with transparent, testable **heuristic/gradient-boosted baselines**; upgrade models behind the same interface. Predictions cached in Redis keyed by lane + features with short TTL.

**Components.** `EtaBadge` (value + confidence band), `PriceSuggestion` (value + factor breakdown), `LaneForecast` chart.

**Backend changes.** `GET /api/v1/predict/eta?tripId=` and `GET /api/v1/predict/price?origin&destination&vehicleType&weight` (BFF → gateway, cached). Feature extraction jobs materialize lane aggregates nightly.

**Frontend changes.** ETA on tracking + trip cards; price suggestion in `listing-form`; lane forecast in analytics.

**Database changes.** `LaneStat` (origin, destination, vehicleType, medianRate, p10/p90, avgTransitHrs, sampleSize, updatedAt) as a materialized aggregate; optional `EtaPrediction` log for eval.

**APIs.** ETA/price predict endpoints with confidence + factor attribution; cached; role-agnostic read (rate-limited).

**Background jobs.** Nightly `LaneStat` refresh; continuous GPS-progress ETA recompute (coalesced via the realtime bus); model-eval batch.

**AI opportunities.** Demand forecasting, surge detection, route optimization, "explain this price" via copilot, confidence-gated auto-pricing.

**Security considerations.** Predictions must not leak counterparty-specific rates across tenants; cache keys are lane-level (non-PII); rate-limit to prevent price-scraping.

**Scaling strategy.** Cache-first reads; precomputed lane aggregates; model inference isolated in the gateway and independently scalable.

**Failure handling.** If the model is unavailable, fall back to `LaneStat` medians, then to the current single-agent price; ETAs degrade to distance/speed heuristic. Always return *something* with a `source` field.

**Analytics.** ETA MAE/MAPE, price-suggestion acceptance rate, realized vs predicted margin, model drift.

**Rollout plan.** Shadow mode (log predictions, don't show) → show as "suggested" → confidence-gated defaults → auto-apply for opted-in orgs.

**Testing checklist.** Deterministic baseline unit tests, backtest harness with holdout, cache-invalidation tests, fallback-chain tests, an **AI eval suite** with tracked MAE thresholds in CI.

**Future extensions.** Reinforcement pricing, carbon-aware routing, weather-adjusted ETA, multi-leg optimization.

---

### Feature 5 — Unified Notifications & Communication Hub

**Problem statement.** The dashboard already reads a `notification` table that "may not exist," and outreach is scattered (WhatsApp/Telegram webhooks, ad-hoc). There is **no unified, multi-channel, preference-aware notification system** — critical for a marketplace where timing (new load, offer, payment, expiry) drives conversion.

**User stories.**
- *As any user*, I receive the right message on my preferred channel (in-app, push, SMS, WhatsApp, email) and can tune preferences per category.
- *As ops*, one `notify()` call reliably fans out with retries and delivery tracking.
- *As compliance*, every notification is logged with delivery status.

**Business value.** Higher marketplace liquidity (faster matches), lower churn, one reliable primitive replacing scattered outreach, and auditable communications.

**UX flow.** A notification bell (unread count via realtime) → categorized inbox with read/unread, mark-all, deep-links to the relevant view → a preferences screen (matrix of category × channel) → transactional sends happen server-side via `notify()`.

**Architecture.** A **Notification model + Outbox + delivery workers per channel**. Producers call `notify({orgId,userId,category,template,data,channels})` which writes an in-app row immediately (realtime push) and enqueues external-channel jobs. Channel adapters (in-app, push, SMS, WhatsApp, email) implement a common interface with idempotency keys and delivery receipts.

**Components.** `NotificationBell`, `NotificationInbox`, `NotificationPreferences`, `NotificationToast` (realtime).

**Backend changes.** `notify()` in `@tyre/notifications`; routes `GET /api/v1/notifications` (paginated, filter by read/category), `POST /api/v1/notifications/read` (bulk), `GET/PUT /api/v1/notifications/preferences`. Producers added at load-posted, offer, booking, payment, document-expiry, dispute.

**Frontend changes.** Bell + inbox + preferences; realtime unread updates via Feature 1; template-driven rendering with i18n.

**Database changes.** `Notification` (orgId, userId, category, title, body, data Json, channel, status, readAt, createdAt; indexes on `(userId, readAt)` and `(orgId, createdAt)`), `NotificationPreference` (userId × category × channel enabled), `NotificationOutbox` (idempotencyKey, channel, payload, attempts, status) for guaranteed delivery.

**APIs.** List/read/preferences; internal `notify()`; webhook receivers for delivery receipts.

**Background jobs.** Per-channel delivery workers with retry/backoff + DLQ; digest batching (e.g., daily driver summary); quiet-hours scheduling; document-expiry scanner (ties to Feature 3).

**AI opportunities.** Smart send-time optimization, channel selection by past engagement, LLM-generated localized summaries, spam/rate guardrails.

**Security considerations.** Preference enforcement (never message opted-out categories except critical security/payment), rate limits per user, PII-safe templates, unsubscribe/consent tracking for SMS/WhatsApp (regulatory), tenant isolation on inbox.

**Scaling strategy.** Outbox pattern decouples producers from delivery; workers scale per channel; in-app path is O(1) insert + realtime publish; external sends are queued and batched.

**Failure handling.** Outbox + idempotency keys guarantee at-least-once with dedupe; DLQ for poison messages; channel fallback (push→SMS) on hard failure; delivery-receipt reconciliation.

**Analytics.** Delivery rate per channel, open/click, opt-out rate, time-to-read, conversion attributed to notifications.

**Rollout plan.** In-app only (backed by realtime) → email → push → SMS/WhatsApp with consent gating → digests + smart timing.

**Testing checklist.** `notify()` fan-out unit tests, preference enforcement, outbox idempotency/DLQ, per-channel adapter contract tests, i18n template snapshots, quiet-hours logic.

**Future extensions.** Two-way conversational threads (in-app chat), campaign tooling for ops, driver broadcast targeting by geo/lane.

---

## 4. Codebase Improvements (20, highest-ROI)

Each item: **Issue → Why → User impact → Debt → End state → Solution (options + choice) → Code impact → Plan → Risks → Validation.**

### I1 — Move request-synchronous side effects to a job queue
- **Issue.** `loads/assign` and `trips/[id]/complete` call the AI gateway/escrow inline; the escrow webhook and broadcasts run in the request path.
- **Why.** Fastest way to ship money flows during the pilot.
- **User impact.** Slow/failed downstreams block the user request; transient failures aren't retried durably.
- **Debt.** Reliability and latency coupled to third parties.
- **End state.** Domain write commits transactionally; side effects (escrow release, notifications, PDF, OCR) are enqueued and retried with a DLQ.
- **Solution.** Options: (a) BullMQ on the existing Redis — mature, DLQ, cron; (b) pg-boss (Postgres-backed) — no new infra; (c) cloud queue. **Choose BullMQ** (Redis already present, best DX). Introduce an **Outbox** table so enqueue is transactional with the write.
- **Code impact.** New `@tyre/jobs` (queues, workers, scheduler); `Outbox` model + migration; refactor `loads/assign`, `trips/*`, webhook, broadcasts to enqueue.
- **Plan.** 1) Add queue infra + Outbox. 2) Move escrow release to a worker. 3) Move notifications/broadcasts. 4) Add DLQ + admin retry.
- **Risks.** Ordering/idempotency — mitigate with idempotency keys + status guards (already the pattern).
- **Validation.** Kill the gateway mid-assign → request still 200, escrow retried to success; DLQ populated on poison; p95 assign latency drops.

### I2 — Introduce OpenTelemetry tracing + Sentry error tracking
- **Issue.** `infra/monitoring` has collector/prometheus/grafana YAML but the app emits nothing.
- **Why.** Monitoring was scaffolded infra-first.
- **User impact.** Incidents are invisible until users complain; no latency attribution.
- **Debt.** No MTTR lever; blind at scale.
- **End state.** Every request/DB/gateway call traced; errors captured with context; RED metrics + dashboards live.
- **Solution.** Options: (a) OTel SDK + existing collector + Sentry; (b) vendor APM. **Choose OTel + Sentry** (collector already configured). Auto-instrument HTTP/Prisma; add span attributes for orgId/route.
- **Code impact.** `instrumentation.ts` (Next), OTel setup in a shared package, Prisma middleware for query spans, Sentry init + error boundary.
- **Plan.** 1) Traces on API routes. 2) Prisma spans. 3) Sentry FE+BE. 4) Grafana RED dashboards + SLOs.
- **Risks.** Overhead/PII in spans — sample + scrub.
- **Validation.** A trace spans request→Prisma→gateway; induced error appears in Sentry with orgId; dashboards show p50/p95/error rate.

### I3 — Redis read-through cache for hot aggregates
- **Issue.** `dashboard` recomputes a 9-panel aggregate on every load; marketplace/loads lists hit Postgres each call.
- **Why.** Correctness-first.
- **User impact.** Slower dashboards under load; DB pressure.
- **Debt.** Scales linearly with traffic.
- **End state.** Hot reads served from Redis with short TTL + event-based invalidation (Feature 1).
- **Solution.** Options: (a) per-endpoint cache helper `cached(key, ttl, fn)`; (b) HTTP cache headers + CDN for public GETs. **Do both** — helper for authed aggregates, cache headers for public landing/marketplace.
- **Code impact.** `@tyre/cache` helper; wrap dashboard/reports/landing; invalidation on relevant events.
- **Plan.** 1) Cache helper. 2) Wrap dashboard. 3) Event invalidation. 4) CDN headers on public GETs.
- **Risks.** Stale data — bound TTL + invalidate on writes.
- **Validation.** Dashboard p95 drops >50%; DB QPS falls; cache hit-rate metric >80%.

### I4 — SPA → URL-addressable routing
- **Issue.** 12 views switch via a Zustand `appView` string; no URLs.
- **Why.** Rapid single-canvas prototyping.
- **User impact.** No deep links/back button/shareable state; weaker analytics; no per-view SSR.
- **Debt.** Blocks SEO, mobile deep-linking, and email/notification links.
- **End state.** Each view is a real route (`/app/dispatch`, `/app/trips/[id]`), state syncs to URL, back/forward works.
- **Solution.** Options: (a) full migration to nested App Router segments; (b) sync `appView` ↔ `useSearchParams` as a bridge. **Phase it**: (b) first (low risk, instant deep links), then (a) per view for SSR where it helps.
- **Code impact.** `store.ts`, `app-shell.tsx`, new route segments under `app/[locale]/app/*`, notification/deeplink targets.
- **Plan.** 1) URL-sync bridge. 2) Guarded routes. 3) Migrate high-value views (trips, marketplace detail) to segments.
- **Risks.** Regressions in nav/animation — keep the shell, add routing beneath.
- **Validation.** Reload on any view restores it; shared link opens correct view; back/forward correct.

### I5 — Consistent API response envelope + error taxonomy
- **Issue.** Some routes return `{success,data}`, others bare objects; error messages are ad-hoc strings.
- **Why.** Organic growth across 76 routes.
- **User impact.** Fragile clients; inconsistent error UX.
- **Debt.** Every client re-implements parsing.
- **End state.** One envelope `{success, data?, error?: {code,message,details?}, meta?}`; typed error codes.
- **Solution.** Options: (a) shared `ok()/fail()` helpers + a route wrapper; (b) a framework (tRPC) — too invasive now. **Choose (a)**.
- **Code impact.** `@tyre/http` (helpers, error codes, `withRoute()` wrapper handling rate-limit/auth/validation/try-catch); migrate routes incrementally.
- **Plan.** 1) Helpers + codes. 2) Wrapper. 3) Migrate money/auth routes. 4) Backfill the rest.
- **Risks.** Client breakage — keep `data` shape stable; add `error.code` additively.
- **Validation.** Contract tests assert envelope on all routes; FE uses one parser.

### I6 — Generate OpenAPI spec + typed client
- **Issue.** No API contract artifact; clients read route code.
- **Why.** BFF grew without a spec.
- **User impact.** Slower integration; drift between FE types and API.
- **Debt.** No contract tests; future mobile/partner integration is manual.
- **End state.** zod schemas are the source of truth → OpenAPI 3.1 generated → typed FE client + docs page.
- **Solution.** Options: (a) `zod-to-openapi` from existing schemas; (b) hand-written spec. **Choose (a)** (schemas already exist).
- **Code impact.** Centralize zod schemas per resource; a build step emits `openapi.json`; `/api/docs` Swagger UI; codegen a typed client for the FE hooks.
- **Plan.** 1) Extract schemas. 2) Generate spec. 3) Docs route. 4) Codegen client → adopt in hooks.
- **Risks.** Schema centralization churn — do per-resource.
- **Validation.** Spec validates; docs render; a contract test fails when a route diverges.

### I7 — Complete the `backend/api` extraction (ADR-001 follow-through)
- **Issue.** Domain logic is duplicated between `backend/api/*` (tested) and inline route handlers.
- **Why.** Extraction started, not finished.
- **User impact.** Indirect: divergence risk → bugs.
- **Debt.** Two sources of truth for loads/trucks/trips schemas.
- **End state.** Route handlers are thin adapters over `@tyre/api` services; one schema per resource.
- **Solution.** Options: (a) finish extraction; (b) delete `backend/api` and keep inline. **Choose (a)** — it's tested and is the target per ADR-001.
- **Code impact.** Move inline zod/serializers into `@tyre/api/<domain>`; routes import them; delete placeholder folders.
- **Plan.** 1) loads. 2) trucks. 3) trips. 4) Remove empty stubs.
- **Risks.** Behavior drift — snapshot serializer outputs before/after.
- **Validation.** Existing vitest suites pass; routes import from `@tyre/api`; no duplicated schema.

### I8 — Optimistic locking on mutable, contended rows
- **Issue.** `Load`/`Trip`/`Truck` updates rely on status guards but have no version column; concurrent edits can clobber.
- **Why.** Status guards were enough for the pilot.
- **User impact.** Rare lost updates under concurrent ops.
- **Debt.** No general concurrency primitive.
- **End state.** `version Int @default(0)` + `updateMany(where:{id,version}) ` bumps; 409 on mismatch.
- **Solution.** Options: (a) version columns; (b) DB row locks (`SELECT … FOR UPDATE`). **Choose (a)** (portable, cache-friendly).
- **Code impact.** Migration adds `version`; helper `optimisticUpdate()`; adopt in load/trip/truck writes.
- **Plan.** 1) Add columns. 2) Helper. 3) Adopt in dispatch/assign. 4) Surface 409 in UI as "refresh".
- **Risks.** Extra 409s — retry-once in the client.
- **Validation.** Concurrent update test: one wins, other gets 409, no lost data.

### I9 — Object storage for uploads (retire local disk)
- **Issue.** `public/uploads/*` stores files on the app instance.
- **Why.** Simplicity in dev.
- **User impact.** Files lost on redeploy/scale-out; no CDN.
- **Debt.** Not multi-instance safe; a data-loss risk.
- **End state.** S3/GCS with signed URLs + CDN (foundation for Feature 3).
- **Solution.** Options: (a) S3-compatible (works with MinIO locally); (b) provider SDK. **Choose (a)** for portability.
- **Code impact.** `@tyre/storage` (sign/put/get), migrate `freight/upload`, add `fileKey` fields, CDN read.
- **Plan.** 1) Storage pkg + MinIO in compose. 2) Signed uploads. 3) Migrate existing refs. 4) CDN.
- **Risks.** Migration of existing files — backfill script.
- **Validation.** Upload survives redeploy; served via signed CDN URL; no local writes.

### I10 — Design-token system (retire hardcoded hex)
- **Issue.** View components hardcode colors (`#181410`, `#8FE03A`, …) and spacing.
- **Why.** Fast visual iteration.
- **User impact.** Inconsistent theming; dark mode/accessibility gaps.
- **Debt.** Global restyle requires touching dozens of files.
- **End state.** Semantic tokens (CSS vars + Tailwind theme): `--surface`, `--ink`, `--brand`, `--signal`, etc.; components reference tokens only.
- **Solution.** Options: (a) Tailwind theme extension + CSS vars; (b) a token library. **Choose (a)** (already Tailwind).
- **Code impact.** `tokens.css`, Tailwind config, codemod hex→token across `components/tyre/app/views/*`.
- **Plan.** 1) Define tokens. 2) Map existing palette. 3) Codemod. 4) Add dark theme values.
- **Risks.** Visual regressions — snapshot tests + visual diff.
- **Validation.** No raw hex in view components (lint rule); dark mode consistent; contrast passes WCAG AA.

### I11 — Unified structured logging
- **Issue.** Routes use `console.error("[scope]", msg)` guarded by `NODE_ENV`.
- **Why.** Minimal logging during pilot.
- **User impact.** Hard to debug prod incidents; no correlation IDs.
- **Debt.** No log levels, no request correlation, no JSON logs.
- **End state.** A `logger` with levels, JSON output, request/trace IDs, PII scrubbing; ties into OTel (I2).
- **Solution.** `@tyre/log` (pino) + a request-context middleware injecting `requestId`/`orgId`. **Choose pino** (fast, JSON-native).
- **Code impact.** Replace `console.*`; add middleware; wire to collector.
- **Plan.** 1) logger pkg. 2) context middleware. 3) codemod console→logger. 4) ship to collector.
- **Risks.** Noise — level config per env.
- **Validation.** Logs are JSON with requestId; a trace links logs to spans.

### I12 — Idempotency keys for all money/webhook mutations
- **Issue.** Escrow/webhook handlers rely on status guards; no explicit idempotency store.
- **Why.** Guards sufficed at low volume.
- **User impact.** Rare double-processing under retries.
- **Debt.** Idempotency reasoning is per-route.
- **End state.** `Idempotency-Key` accepted on money POSTs; a store dedupes with cached responses.
- **Solution.** `IdempotencyKey` table (key, requestHash, response, status, expiresAt) + `withIdempotency()` wrapper. **Choose table-backed** (durable, auditable).
- **Code impact.** Migration + wrapper; adopt in assign/complete/webhooks/booking.
- **Plan.** 1) Table + wrapper. 2) Webhooks. 3) Money routes. 4) Client sends keys.
- **Risks.** Key collisions — hash body + scope.
- **Validation.** Replaying a webhook 5× yields one effect + identical cached response.

### I13 — Rate-limit tiering by identity, not just IP
- **Issue.** `rateLimitOrNull("standard", ip)` keys on IP; NAT/mobile share IPs.
- **Why.** IP was the simplest key.
- **User impact.** Shared-IP users throttle each other; weak abuse protection.
- **Debt.** Coarse limiter.
- **End state.** Tiered limits by user/org/route class with burst + sustained buckets.
- **Solution.** Extend the limiter to accept a composite key (org/user/route) + tier config. **Choose token-bucket in Redis**.
- **Code impact.** `rate-limit.ts`, per-route tier annotations.
- **Plan.** 1) Composite keys. 2) Tier map. 3) Stricter tiers on auth/money. 4) Metrics.
- **Risks.** Legit bursts — tune + allowlist.
- **Validation.** Load test shows per-user isolation; auth brute-force blocked.

### I14 — Table virtualization + server-driven table state
- **Issue.** Fleet/drivers/trips tables render all rows; sorting/filtering is client-side only.
- **Why.** Small seed data.
- **User impact.** Jank and memory at thousands of rows; inconsistent filter semantics.
- **Debt.** Won't scale past a few hundred rows.
- **End state.** Virtualized lists + server-side sort/filter/paginate with a shared `useTableState` hook synced to URL.
- **Solution.** `@tanstack/react-virtual` + extend list endpoints with sort/filter params. **Choose TanStack Virtual** (already in the RQ ecosystem).
- **Code impact.** Table components, list endpoints, `useTableState`.
- **Plan.** 1) Server sort/filter on trips. 2) Virtual list. 3) URL-synced state. 4) Roll to fleet/drivers.
- **Risks.** Endpoint contract churn — additive params.
- **Validation.** 10k-row table scrolls at 60fps; filters run server-side; state deep-links.

### I15 — Error boundaries + Suspense data boundaries per view
- **Issue.** A thrown error in one view can blank the shell; no per-view fallback.
- **Why.** Single-canvas simplicity.
- **User impact.** One failing panel breaks the page.
- **Debt.** No graceful degradation.
- **End state.** Each view wrapped in an error boundary with retry + a Suspense boundary for streaming.
- **Solution.** `ViewBoundary` HOC (error + suspense + reset) around each `VIEWS[...]`. **Choose per-view boundary** in `app-shell`.
- **Code impact.** `app-shell.tsx`, a shared `ViewBoundary`, RQ `throwOnError` where appropriate.
- **Plan.** 1) Boundary component. 2) Wrap views. 3) Standard error/empty UI. 4) Sentry capture in boundary.
- **Risks.** Masking errors — always log to Sentry.
- **Validation.** Force a view to throw → only that panel shows retry; rest works.

### I16 — Accessibility pass (WCAG 2.1 AA)
- **Issue.** Custom buttons/inputs, tiny font sizes (`text-[9.5px]`), color-only status, unlabeled icon buttons.
- **Why.** Visual-first design.
- **User impact.** Unusable with keyboard/screen readers; low-contrast text.
- **Debt.** Compliance and enterprise-procurement blocker.
- **End state.** Focus-visible rings, aria labels, semantic roles, min contrast, keyboard nav across all interactive elements.
- **Solution.** Adopt Radix primitives (already a dependency) for interactive controls; add `eslint-plugin-jsx-a11y`; audit with axe. **Choose Radix + axe CI**.
- **Code impact.** View components, buttons, dialogs; lint config; token contrast (I10).
- **Plan.** 1) a11y lint + axe in CI. 2) Fix icon-button labels + focus. 3) Contrast via tokens. 4) Keyboard nav for tables/menus.
- **Risks.** Visual tweaks — snapshot review.
- **Validation.** axe: 0 criticals; full keyboard traversal; AA contrast.

### I17 — Reusable data-view primitives (kill copy-paste)
- **Issue.** Every view re-implements header/search/loading/empty/error scaffolding with slight differences.
- **Why.** Organic growth.
- **User impact.** Inconsistent UX; more bugs.
- **Debt.** N copies of the same patterns.
- **End state.** `PageHeader`, `SearchBar`, `DataState` (loading/empty/error/success), `StatCard`, `EntityTable` shared components.
- **Solution.** Extract from the best existing view (marketplace) into `components/tyre/app/primitives/*`. **Choose extraction over rewrite**.
- **Code impact.** New primitives; refactor views to consume them.
- **Plan.** 1) Extract primitives. 2) Adopt in 2 views. 3) Roll out. 4) Delete duplicates.
- **Risks.** Over-abstraction — keep props minimal.
- **Validation.** Views shrink; consistent states everywhere; a Storybook page renders each state.

### I18 — Dependency & container security scanning in CI
- **Issue.** CI lacks dependency/image vulnerability scanning; deploy has no image scan.
- **Why.** Pipeline focused on build correctness.
- **User impact.** Indirect: shipped CVEs.
- **Debt.** Unknown supply-chain exposure.
- **End state.** `pnpm audit`/OSV + Trivy image scan gate merges/deploys; Dependabot/renovate for updates.
- **Solution.** Add OSV-Scanner + Trivy jobs; Renovate bot. **Choose OSV + Trivy** (OSS, fast).
- **Code impact.** `.github/workflows/*`, renovate config.
- **Plan.** 1) OSV on PR. 2) Trivy on image. 3) Renovate. 4) Fail on high severity.
- **Risks.** Noise — severity thresholds + allowlist.
- **Validation.** A planted vulnerable dep fails CI; images scanned pre-deploy.

### I19 — Wire the Playwright E2E harness into CI + expand coverage
- **Issue.** The E2E harness exists but isn't run in CI; covers only the freight flow.
- **Why.** Added late, not yet gated.
- **User impact.** Regressions slip through.
- **Debt.** Manual verification burden.
- **End state.** E2E runs on PR against an ephemeral DB + seed; covers auth, dispatch/assign, trip lifecycle, documents, reports.
- **Solution.** Add a CI job spinning Postgres + `next build`/`start`, run Playwright; expand specs. **Choose service-container Postgres**.
- **Code impact.** `ci.yml`, new specs, `playwright.config` CI branch.
- **Plan.** 1) CI job green on freight spec. 2) Auth spec. 3) Assign/trip spec. 4) Docs/reports spec.
- **Risks.** Flakiness — retries + trace-on-failure.
- **Validation.** PRs blocked on E2E; failure uploads traces; suite <10 min.

### I20 — Partitioning & retention for high-volume append tables
- **Issue.** `AgentLog`, `VoiceInteraction`, and future GPS/notification tables grow unbounded.
- **Why.** Not yet at volume.
- **User impact.** Slow analytics, ballooning storage over time.
- **Debt.** Future migration pain.
- **End state.** Time-partitioned (monthly) append tables + retention/rollup policy; hot/warm split.
- **Solution.** Options: (a) native Postgres declarative partitioning; (b) pg_partman; (c) move telemetry to a TSDB/ClickHouse. **Start with (a/b)**; evaluate (c) if volume warrants.
- **Code impact.** Migrations (partitioned parents), retention job, analytics queries.
- **Plan.** 1) Partition `AgentLog`. 2) `VoiceInteraction`. 3) Retention job. 4) Nightly rollups for dashboards.
- **Risks.** Migration of existing rows — online backfill.
- **Validation.** Insert/scan stays flat as volume grows; retention prunes on schedule.

---

## 5. UI/UX Modernization

**Screen-by-screen audit** (app views + landing):

| Screen | Key gaps | Concrete actions |
|---|---|---|
| Landing/Pricing/Legal | Strong; SSR-friendly | Keep; add CDN cache headers; audit CLS/LCP. |
| Dashboard | Dense; 9 panels; no per-panel error isolation | Panel-level `DataState` + skeletons; drill-through links; responsive stacking. |
| Marketplace | Best-built view; good states | Extract its patterns as primitives (I17); add saved searches, geo-rank, realtime new-load toast. |
| Dispatch | Now real; polling | Realtime updates (F1); bulk assign; constraint hints. |
| Tracking | **Mock map** | Real map (F1/F3 GPS), ETA badge (F4), geofence arrival chip, timeline. |
| Trips | Client-side table | Server sort/filter + virtualization (I14); trip detail route (I4). |
| Fleet/Drivers | Basic lists | Utilization charts; maintenance schedule; driver availability; detail drawers. |
| Payments/Billing | Ledger only | New Billing view (F2): invoices, settlements, exports. |
| Documents | Real panel | Upload + OCR review (F3); expiry filters; bulk actions. |
| Reports | Real compute | Report runner UI (pick type → render chart/table → export). |
| Voice | Panel + gateway | Live transcript stream; cost/latency mini-dashboard; guardrail indicators. |
| Settings | Minimal | Profile, org/tax profile (F2), notification prefs (F5), sessions/security, theme. |

**Cross-cutting UX system upgrades:**
- **Navigation & hierarchy:** URL routes (I4), breadcrumbs, command palette (cmdk already present) wired to real actions.
- **Spacing & typography:** replace one-off `text-[9.5px]`/hex with a type scale + tokens (I10); enforce min 12px body, AA contrast.
- **Loading/skeleton/empty/error:** standardize via `DataState`/skeletons (I17); every list has all four states.
- **Transitions/animation:** keep framer-motion; centralize durations/easings as tokens; respect `prefers-reduced-motion` everywhere.
- **Forms:** adopt react-hook-form + zod resolver consistently; inline field errors; optimistic submit + rollback.
- **Filters/search:** shared `SearchBar` + URL-synced filters; debounced server queries.
- **Tables/cards/charts:** virtualized tables; consistent `StatCard`; recharts theming via tokens.
- **Maps:** real tiles (Mapbox/MapLibre) with clustered trucks, route polylines, geofences.
- **Responsive/touch:** mobile nav (bottom tab or drawer), ≥44px touch targets, table→card collapse on small screens.
- **Dark mode:** semantic tokens make it real; audit contrast in both themes.
- **Keyboard nav:** focus-visible, escape-to-close, arrow nav in menus/tables; skip-to-content.
- **Design tokens & reuse:** `tokens.css` + primitives library + a Storybook to lock visual consistency.

---

## 6. AI Roadmap

TYRE's AI is real (Python gateway + agents) but loosely coupled and unevaluated. Evolve along three axes: **deeper product integration, orchestration, and evaluation/guardrails.**

| Capability | Now | Next |
|---|---|---|
| Voice | Pipeline + `VoiceInteraction` logging | Streaming STT, barge-in, per-locale accuracy dashboard, guardrails on actions (confirm before money moves). |
| OCR | Absent | Document/RC/insurance extraction (F3) with confidence gating. |
| ETA prediction | Absent/static | Baseline → GBM model, live GPS recompute, confidence bands (F4). |
| Pricing intelligence | Single agent call | Lane stats + model + rationale + acceptance tracking (F4). |
| Demand forecasting | Absent | Lane×time forecasts feeding dispatch and pricing. |
| Route optimization | Absent | Multi-stop + return-load matching; carbon-aware option. |
| Dispatch intelligence | Rule-ish | Constraint-aware match scoring surfaced with explanations. |
| Fraud / risk scoring | Agents exist | Unified feature store, real-time scoring on booking/assign, case management. |
| Knowledge retrieval / RAG | Copilot chat | Ground copilot in org data (loads/trips/docs) via retrieval + citations. |
| Agents & orchestration | Independent agents | A declarative orchestration config; tool-calling contracts; typed tool I/O. |
| Memory | Stateless | Per-user/org long-term memory store for the copilot with scoping + TTL. |
| Reasoning | Single-shot | Multi-step plans with confidence-gated human approval (surface in-product). |
| Evaluation | None | An **AI eval harness** (golden sets, MAE/accuracy thresholds) in CI; block regressions. |
| Guardrails | Minimal | Action allowlists, PII redaction, output schemas, refusal on low confidence. |
| Prompt architecture | Inline | Versioned prompt registry with templates + variables + A/B. |
| Fallbacks | Partial (loads code fallback) | Every AI call has a deterministic fallback + `source` label. |
| Hallucination reduction | N/A | Structured outputs (zod-validated), retrieval grounding, citations. |
| Cost/latency | Untracked | Per-call cost/latency logged (schema already has cost fields on `VoiceInteraction`) → dashboards + budgets. |
| Offline resilience | N/A | Cache last-good predictions; degrade gracefully; queue voice for later processing. |

**Foundational AI infra:** a thin **model-orchestration layer** in the gateway (provider-agnostic, per-task routing, retries, cost caps), a **prompt registry**, and an **eval CI job** are the three highest-leverage investments; every feature above plugs into them.

---

## 7. Backend Evolution

- **API architecture:** consistent envelope + `withRoute()` wrapper (I5); OpenAPI (I6); finish `@tyre/api` extraction (I7); versioning policy (`/v1` frozen, additive changes only; `/v2` for breaking).
- **Validation:** every write route zod-validated (mostly done); centralize schemas in `@tyre/api`; share zod between FE and BE.
- **Caching:** read-through Redis for aggregates + `Cache-Control`/CDN for public GETs (I3).
- **Queues/Workers/Cron:** BullMQ (I1) for escrow, notifications, OCR, PDF, expiry scans, lane-stat refresh, reconciliation; a scheduler for cron.
- **Streaming:** SSE backbone (F1); consider partner webhooks off the same bus.
- **DB indexing:** covering indexes for new query shapes (billing registers, notifications inbox); review N+1 in dashboard/trip includes.
- **Transactions/Concurrency:** optimistic locking (I8); keep transactional state machines; move side-effects out of transactions (I1).
- **Idempotency/Retry:** idempotency keys (I12); worker retry/backoff + DLQ.
- **Rate limiting:** identity tiering (I13).
- **Storage:** object store + signed URLs (I9).
- **Search:** start with Postgres trigram/`ILIKE` (in use); graduate marketplace/loads search to a dedicated index (Meilisearch/OpenSearch) when facets/geo demand it.
- **Schema evolution:** expand-migrate-contract discipline; never destructive in one deploy; partitioning + retention for telemetry (I20).

---

## 8. Frontend Evolution

- **Rendering:** move public pages to SSR/ISR; app views stay client but gain per-view routes (I4) enabling selective SSR.
- **Data fetching:** standardize on react-query; typed client from OpenAPI (I6); consistent query keys + invalidation via realtime (F1).
- **Prefetching:** hover/intent prefetch for trip/listing details; `queryClient.prefetchQuery` on nav.
- **Optimistic updates:** for booking/assign/status changes with rollback on 409 (pairs with I8).
- **Error boundaries/Suspense:** per-view boundaries (I15); streaming where useful.
- **Offline mode:** cache last-good data (RQ persist); queue mutations for driver PWA; show stale badges.
- **Caching:** RQ persistence + HTTP caching; dedupe in-flight.
- **Accessibility:** WCAG AA (I16); Radix primitives; axe in CI.
- **Animation system:** tokenized durations/easings; reduced-motion respected globally.
- **Component architecture:** primitives library (I17) + Storybook; feature-folder co-location.
- **Performance/bundle:** route-level code-split (I4 enables it), lazy-load heavy views (three.js/maps), image optimization via `next/image`, bundle budget in CI.
- **Virtualization:** large tables/lists (I14).
- **State management:** keep Zustand for UI state; server state strictly in react-query; URL as the source of truth for view/filter state.
- **Reusable patterns:** shared hooks (`useTableState`, `useRealtime`, `useDataState`).

---

## 9. Infrastructure Evolution

| Area | Now | Next |
|---|---|---|
| Docker/Containers | Dockerfiles + compose | Multi-stage slim images; non-root; healthchecks; MinIO + Redis + Postgres in compose for a one-command local stack. |
| Build system | Turbo monorepo | Remote cache; affected-only CI; bundle budgets. |
| Deployment | `deploy.yml` on main | Gate deploy on E2E + image scan; blue/green or canary; automatic rollback on SLO breach. |
| Environment mgmt | `.env` | Typed env schema (zod) validated at boot; per-env config; no secrets in repo. |
| Secrets | Env vars | Secret manager (Vault/cloud KMS); rotation policy; the PII key + JWT secret rotated on schedule. |
| Monitoring | Collector/Prom/Grafana YAML | Actually emit metrics (I2); RED + business dashboards; SLOs (availability, p95, error rate). |
| Logging | console | Structured JSON to collector (I11) with correlation IDs. |
| Tracing | None | OTel spans across request→Prisma→gateway (I2). |
| Alerting | None | Alertmanager rules on SLO burn, DLQ depth, webhook failure, escrow mismatch → on-call. |
| DR/Backups | Undocumented | Automated Postgres PITR backups + tested restore runbook; object-store versioning. |
| Scaling | Single instance assumptions | Stateless app pods (SSE via Redis), HPA on CPU/RPS, connection pooling (PgBouncer). |
| Multi-region | None | Read replicas per region; region-pinned data (schema already has a `Region` enum); latency-based routing later. |
| CDN | None | CDN for static + signed object reads + cacheable public GETs. |
| Worker architecture | None | Dedicated worker deployment (BullMQ) separate from web; autoscaled by queue depth. |

**Boot-time config validation** (typed env) and **PgBouncer + HPA** are the two cheapest high-impact infra wins alongside actually turning on observability.

---

## 10. Testing Strategy

| Layer | Now | Target |
|---|---|---|
| Unit | vitest (freight/loads) + pytest (gateway) | Cover billing math, settlement, notify fan-out, cache/idempotency helpers, tax golden files. |
| Integration | Sparse | Route+DB tests per resource (Testcontainers Postgres) asserting envelope, authz, transactions. |
| E2E | Playwright harness (freight) | Wire into CI (I19); add auth, dispatch/assign, trip lifecycle, documents, reports, billing. |
| Performance | None | k6 load profiles on marketplace/dashboard/assign; track p95 budgets. |
| Accessibility | None | axe in CI on key screens (I16); keyboard-traversal tests. |
| Security | None | ZAP baseline scan; authz matrix tests (role×route); dependency/image scans (I18). |
| Load | None | Soak test SSE (10k connections), queue throughput, DB under HPA. |
| Chaos | None | Kill Redis/gateway/DB-replica in staging; assert graceful degradation + fallbacks. |
| Regression | Ad hoc | Golden snapshots for serializers + PDFs; visual diffs on key views. |
| Visual | None | Storybook + Chromatic/Playwright screenshots. |
| API contract | None | OpenAPI-driven contract tests (I6); fail on drift. |
| Database | Manual | Migration up/down tests; constraint/cascade tests; seed determinism. |
| AI evaluation | None | Eval harness with golden sets + thresholds (ETA MAE, price acceptance, OCR accuracy); block regressions in CI. |

**Testing pyramid target:** many unit, solid integration, focused E2E on money/dispatch/auth, plus a standing load+chaos suite in staging. CI budget: unit+integration <5 min, E2E <10 min, nightly load/chaos/AI-eval.

---

## 11. Production Readiness Checklist

| # | Item | Purpose | Owner | Dependencies | Verification | Done when |
|---|---|---|---|---|---|---|
| 1 | Boot-time env validation | Fail fast on misconfig | Platform | zod env schema | Start with a missing var → refuses to boot | All envs validated in CI + runtime |
| 2 | Secrets in a manager + rotation | Remove secret sprawl | Security | Vault/KMS | No secrets in repo/env dumps | JWT/PII/webhook secrets rotated on schedule |
| 3 | OTel traces + Sentry live (I2) | Observability | Platform | collector | A real error appears with trace+orgId | Dashboards + alerts green in staging |
| 4 | SLOs + alerting | Detect regressions | SRE | metrics | Induced latency triggers alert | On-call receives + runbook exists |
| 5 | Postgres PITR backups + restore drill | Data safety | DBA | backup infra | Restore to a scratch env succeeds | RPO/RTO documented + tested |
| 6 | Job queue + DLQ (I1) | Reliable side-effects | Backend | Redis | Kill downstream → work retried | Escrow/notifications via workers, DLQ monitored |
| 7 | Idempotency on money/webhooks (I12) | No double-charge | Backend | table | Replay webhook 5× → one effect | Adopted on all money routes |
| 8 | Rate-limit tiering (I13) | Abuse protection | Backend | Redis | Brute-force blocked, users isolated | Tiers on auth/money verified by load test |
| 9 | Object storage + signed URLs (I9) | Durable uploads | Backend | S3/MinIO | File survives redeploy | No local disk writes |
| 10 | E2E in CI (I19) | Regression gate | QA | Postgres service | PR blocked on failing E2E | Suite green + traces on fail |
| 11 | Dependency + image scans (I18) | Supply-chain safety | Security | OSV/Trivy | Planted CVE fails CI | High-sev blocks merge/deploy |
| 12 | a11y AA on key screens (I16) | Compliance + reach | Frontend | axe | 0 axe criticals | Keyboard + contrast pass |
| 13 | Canary deploy + auto-rollback | Safe releases | SRE | metrics/SLO | Bad deploy auto-rolls back | Verified in staging |
| 14 | Load test to target RPS | Capacity proof | SRE | k6 | Meets p95 at target load | Documented headroom |
| 15 | PgBouncer + HPA | Scale under load | Platform | pooling | Survives connection storm | Autoscale verified |
| 16 | Data retention/partitioning (I20) | Sustainable growth | DBA | partman | Inserts flat at volume | Retention job runs |
| 17 | Audit coverage on all mutations | Forensics/compliance | Security | audit lib | Every write has an audit row | Verified via test |
| 18 | Runbooks (incident/DR/on-call) | Operational readiness | SRE | docs | Game-day exercise passes | Signed off |

---

## 12. Future Vision (12–24 months)

**Thesis:** evolve from a freight *marketplace with AI features* into an **AI-native logistics operating system** where the network, the money rails, and the intelligence compound into a moat.

**Phase A — Reliability & realtime foundation (this phase).** Realtime backbone, queues, observability, settlement/tax, storage/OCR, notifications. Outcome: enterprise-trustworthy operations.

**Phase B — Intelligence layer.** ETA/pricing/demand models + eval harness + orchestration + grounded copilot with memory. Outcome: measurable margin/utilization lift and a data moat that grows with volume.

**Phase C — Network & ecosystem.** Partner/API platform (OpenAPI-first), driver PWA/mobile with offline, TMS/ERP integrations, e-invoicing/e-way-bill, insurance/fuel/FASTag partners. Outcome: TYRE as the system-of-record other tools plug into.

**Phase D — Multi-region & scale.** Regional replicas, data residency (the `Region` enum is already there), edge caching, autoscaled workers. Outcome: national scale, 24×7, multi-tenant enterprise SLAs.

**Architectural north star:** a small set of durable primitives — **event bus, job queue, idempotent money ledger, prediction service, notification hub, object storage, observability** — that every future feature composes from. Resist feature bloat; each new capability should be a thin composition over these primitives, fully instrumented, evaluated, and guarded.

---

*End of NEXT.md — this document is the implementation contract for the next phase. Sequence the "do-first" five (Realtime, Queue, Observability, Settlement, URL routing); everything else composes on top.*
