# TYRE — Phase Plan

> *Batches, not a timeline. Each phase has an exit gate (a condition that must be true), not a duration. Builds on `MERGE_REPORT.md` (the 3-repo consolidation, now archived under `docs/archive/`) and the original monetization strategy, and adds new ideas marked **[NEW]**.*
>
> **Cross-references:** [`ARCHITECTURE.md`](./ARCHITECTURE.md) §8 ("Stub vs Real") is the load-bearing audit that Phase 0 exists to close. [`CHANGELOG.md`](./CHANGELOG.md) tracks how the codebase got to the state Phase 0 starts from.

---

## Summary table

| # | Phase | Exit gate (one line) | Revenue / Moat impact | New? |
|---|---|---|---|---|
| 0 | Ground Truth: Close the Demo-to-Real Gap | One driver + one broker + one load complete accept → ₹10K advance → POD → balance, end-to-end, with DB rows not LLM guesses | None directly — precondition for every phase below being honest | — |
| 1 | Trust Score: One Engine, Not Three | Trust tier shown to broker before escrow funding matches the tier shown to driver in their app, same day, same write | Highest-leverage moat phase — the one asset that compounds with time | [NEW] score decay & recency weighting |
| 2 | Escrow & Instant Settlement: Make the Money Real | 10 real transactions complete with zero manual intervention, advance release < 60s, reconciliation zero drift | First phase that generates real revenue (1% take rate) | [NEW] public append-only settlement ledger per load |
| 3 | WhatsApp & Voice: The Real Front Door | A driver who has never opened the web app completes a full load cycle using only WhatsApp/voice | Indirect — distribution layer that makes Phase 2 volume possible | [NEW] "explain this number" voice command |
| 4 | Return-Load Engine & Corridor Density | Measured empty-leg % for active fleet-owner users in the wedge corridor drops measurably vs. baseline | Direct revenue + strongest network-effect moat candidate | — |
| 5 | Fleet & Broker Command Center | A fleet owner answers "how much am I owed right now" from this dashboard faster + more accurately than from their own WhatsApp/Excel | First subscription-shaped product (Tier 2) — per-truck/month pricing | — |
| 6 | Compliance Automation & Digital Trust Passport | A real shipper's ops team replaces a specific named manual process using the passport/compliance automation, confirms in writing it's faster | Unlocks Tier 1 shippers (highest ACV) once trust is demonstrable | [NEW] Digital Compliance Passport |
| 7 | Embedded Financial Products | First real loan/advance issued + repaid through the platform, end to end, repayment auto-reconciled against settlement | Highest-margin tier in the strategy doc, now buildable on real data | [NEW] community-guaranteed micro-lending circles |
| 8 | Data Monetization Layer | One signed data-licensing or referral agreement with an external financial partner, revenue with zero incremental engineering | Monetizes the Phase 1/4/7 moat a second + third time | [NEW PHASE] |
| 9 | Intelligence & Safety Layer | Dynamic pricing demonstrably increases utilization/fill-rate vs. fixed-rate-card baseline in A/B; fatigue nudges live for real drivers | Deepens vernacular-voice moat; small revenue-share from insurer | [NEW PHASE] |
| 10 | Open Trust Network & Platform API | One external, non-TYRE-built app completes a real transaction using only the public API | "Stripe for freight trust" — longest-horizon moat | [NEW PHASE] |
| 11 | Enterprise Shipper Layer & Multi-Corridor Expansion Engine | First enterprise shipper contract signed referencing a real historical SLA number; second corridor selected using the codified playbook | Enterprise revenue + repeatable expansion | — |

---

## Before Phase 1: what I found re-opening the codebase for this plan

I went back into the actual repo to ground this in reality rather than write generic advice on top of the strategy doc. Three load-bearing checks:

- **`backend/ai/gateway/app/agents/payment.py`** (the UPI escrow "Payment Agent") doesn't call Razorpay. It asks an LLM to *generate JSON pretending a transaction happened* — including a fabricated `razorpay_transfer_id` and `upi_transaction_ref`. The real escrow service it should be using, **`backend/ai/gateway/app/ai/payments/upi_escrow.py`**, is excellently designed — correct Razorpay Route flow, correct fee math, the actual `POST /v1/payouts` shape sketched in comments — but every method literally has `# Stub for now — real impl uses razorpay-python SDK` above a block that fabricates a fake account ID and returns `success=True`. **No money has ever moved in this system.**
- **Trust scoring exists three separate times and none of them talk to each other.** A genuinely good, deterministic scoring algorithm lives in `backend/ai/gateway/app/ai/trust/trust_score.py` (0–1000 score, 4 weighted categories, 5 tiers — the code comment literally says *"THE MOAT"*). It's exposed at `POST /wedge/trust/score` — but that endpoint is stateless: it computes and returns, never writes to the `TrustScore` Postgres table. Meanwhile the frontend (`frontend/web/components/tyre/app/views/trust.tsx`) renders trust scores from **hardcoded static numbers** in `frontend/web/lib/tyre/data.ts` (`trustScore: 91`, `87`, `95`...). Three implementations of the single feature the team itself identified as the moat, zero of them connected.
- **The WhatsApp driver bot** (`backend/ai/gateway/app/ai/whatsapp/driver_bot.py`) has genuinely good Hindi/Bhojpuri/English intent detection (regex patterns for load search, accept, emergency, onboarding). But `_handle_load_search` returns **hardcoded canned loads** ("Patna → Delhi | ₹45,000..."), not a database query, and `self._whatsapp_token = ""` — there's no actual Meta Graph API send-call implemented anywhere.

This isn't a criticism of the architecture — the architecture and domain modeling are genuinely strong, better than either source repo's. It's a specific, fixable fact: **the parts of TYRE that look most impressive in a demo are the parts most likely to be entirely simulated.** This has to be Phase 0, not a footnote, because every later phase in this plan assumes real data is flowing through real services. Building Phase 4's return-load matching on top of a fake escrow layer just produces a more impressive fake.

---

## Phase 0 — Ground Truth: Close the Demo-to-Real Gap

**What ships:**
- Wire `payment.py` to actually call `upi_escrow.py`'s methods instead of asking an LLM to hallucinate a transaction. Implement the commented-out Razorpay calls for real (sandbox/test mode first) using the `razorpay` Python SDK.
- Make `POST /wedge/trust/score` write its result to the `TrustScore` table (via a callback to the BFF, or a direct DB connection from the Python service — pick one, document why).
- Replace `trust.tsx`'s static mock array with a real fetch against persisted trust scores.
- Implement one real WhatsApp send-call (Meta Graph API) and make `_handle_load_search` query the real `Load` table instead of returning canned text.
- Audit `FastagWallet`, `VoiceOnboarding`, `ComplianceDoc`, and the Whisper/ElevenLabs voice pipeline with this exact method (grep for `# Stub`, `# Real impl`, hardcoded return values, empty-string credentials) and produce a one-line verdict per subsystem: REAL / STUB / MOCK-UI-ONLY.
- Apply the rate-limit-on-every-route and `RBAC.can()`-enforcement gaps already flagged in `MERGE_REPORT.md` §6.

**Exit gate:** one driver, one broker, one load can go through accept → ₹10K advance actually lands in a real (sandbox) UPI account → POD upload → balance release, with every step backed by a database row, not an LLM guess. If you can't demo this without faking anything, the phase isn't done.

**Revenue/moat impact:** none directly — this phase generates zero new revenue. It's the precondition for every phase below being honest. Skipping it doesn't save time, it just moves the discovery of "this was never real" from now (cheap) to after a pilot broker has been burned by a fake advance promise (catastrophic, and exactly the trust violation TYRE exists to prevent).

---

## Phase 1 — Trust Score: One Engine, Not Three

**Why now:** Escrow risk decisions (Phase 2), lending underwriting (Phase 7), and broker-verified-pool pricing (Phase 5) all need a trust score that's actually real and actually current. Build the single source of truth before anything else depends on it.

**What ships:**
- `TrustScoreService` becomes the only place a score is computed. Triggered on: trip completion, payment dispute, verification document upload, peer rating submission.
- A write path: Python computes → BFF persists to `TrustScore` via `@tyre/db` → cache invalidation so the UI never shows a stale tier.
- Surface the score and its breakdown (verification/transaction/behavioral/peer, already modeled) to all three sides of a transaction — driver, broker, shipper — at the point of decision (before accepting a load, before funding escrow), not buried in a profile page.
- **[NEW] Score decay and recency weighting.** A driver who was great 18 months ago and has gone quiet shouldn't carry the same score as one who's active weekly. Add a time-decay factor to `transaction_score` so the score reflects recent reliability, not historical reliability — this matters specifically because trust scores will start gating money (Phase 2/7) and a stale "Platinum" badge on an inactive account is a fraud vector, not a convenience.

**Exit gate:** trust tier shown to a broker before they fund escrow matches the tier shown to the driver in their own app, computed from the same write, same day.

**Moat impact:** this is the highest-leverage phase in the whole plan for the long-term moat — it's the one asset that gets harder to copy the longer it runs (real history compounds; a competitor starting today has zero).

---

## Phase 2 — Escrow & Instant Settlement: Make the Money Real

**Why now:** This is the actual revenue engine identified in the strategy doc (1.5–3%/1% take rate on every transaction) — and per Phase 0, it currently doesn't exist as a real money-moving system at all.

**What ships:**
- Production Razorpay Route integration: real linked accounts, real transfers, real payouts, real webhook handling for funding/payout confirmation (not polling, not LLM-narrated status).
- Idempotency on every money-moving call (the original `TYRE-Transformation-Report.md` flagged this gap — close it here, where it actually matters, not as an abstract principle).
- GPS-verified POD → consignee WhatsApp confirmation → balance release, wired end to end using the now-real WhatsApp send path from Phase 0.
- A reconciliation job: every escrow account's `totalFunded` must equal `advanceReleased + balanceReleased + refundToBroker` at all times, alerting on drift — this is the kind of boring correctness work that's invisible until a broker disputes ₹2,000 and you need to prove, with a ledger, exactly where it went.
- **[NEW] A public, append-only settlement ledger view per load** (not the whole platform's books — just that one transaction's lifecycle), shown to both broker and driver. This converts "trust me, the money moved" into "here's the timestamped proof" — directly answers the #1 complaint in the industry (disputed deductions, "where's my money") with evidence instead of a support ticket.

**Exit gate:** ten real (or real-sandbox) transactions complete with zero manual intervention, latency on advance release measured and under the 60-second target the code already aspires to, reconciliation job shows zero drift.

**Revenue impact:** this phase is the first one that can generate real revenue (the 1% take rate). Everything before it was cost; this is where TYRE starts being a business.

---

## Phase 3 — WhatsApp & Voice: The Real Front Door

**Why now:** Phase 1–2 give you something worth showing a driver. This phase is how they actually see it — most of the target user will never download an app.

**What ships:**
- Real load search against the live `Load` table from WhatsApp, real accept-flow that triggers real escrow funding (Phase 2) and writes a real `Trip`.
- Voice path: Whisper STT → intent extraction → response, in Hindi/Bhojpuri, with the existing regex intent router as a fast-path fallback when the LLM path is slow/down (don't throw away the regex work — it's a legitimate low-latency degradation path, not dead code).
- POD upload via WhatsApp image message → `TruckPhoto` + `ConsigneeConfirmation`, feeding Phase 2's release trigger for real.
- **[NEW] A "explain this number" voice command.** A driver asks (in voice) "kitna milega" (how much will I get) at any point in a trip and gets a real, current answer — advance already released, balance pending, TYRE fee deducted, expected release trigger — pulled from the real ledger in Phase 2, not a static FAQ. This single feature is disproportionately valuable because it's the exact question driving the #1 fear (will I actually get paid, and when) and answering it in their own voice, instantly, accurately, is the kind of thing that creates word-of-mouth in a trucker community before any marketing spend does.

**Exit gate:** a driver who has never opened the web app can complete an entire load cycle — search, accept, advance received, deliver, POD, balance received — using only WhatsApp/voice.

**Revenue impact:** indirect — this is the distribution layer that makes Phase 2's transaction volume possible at the driver population TYRE actually needs (low-literacy, low-smartphone-capability, vernacular-first).

---

## Phase 4 — Return-Load Engine & Corridor Density

**Why now:** Only worth building once there's real transaction volume (Phase 2) and a real front door (Phase 3) to generate the supply/demand density a matching engine needs to actually work — building this on simulated data would just produce a more convincing demo of an engine that doesn't function at real density.

**What ships:**
- Real implementation behind the already-modeled `ReturnLoadMatch` table: proactive matching that fires when a `Trip` is marked delivered, scanning for compatible return loads in the destination region, *before* the driver asks.
- The "return-load guarantee" product from the strategy doc: a real SLA (find a return load within N hours or the platform fee is waived) — which requires this to be a genuinely good matching algorithm, not best-effort, because now there's a financial promise attached to it.
- Corridor-scoped rollout discipline: this only gets turned on for the Bihar-Jharkhand-UP wedge corridor first, deliberately not generalized, because the strategy doc's core insight is that density beats breadth for this specific problem.

**Exit gate:** measured empty-leg percentage for active fleet-owner users in the wedge corridor drops measurably against a baseline taken before this phase — this is the one phase in the whole plan where you need a real before/after number, because "better matching" is a worthless claim without one.

**Revenue/moat impact:** direct revenue (return-load guarantee fee, Tier 1 in the strategy doc) and the strongest network-effect moat candidate — but only if density is real, which depends entirely on Phases 1–3 having actually shipped first.

---

## Phase 5 — Fleet & Broker Command Center

**Why now:** Once individual transactions (Phase 2) and matching (Phase 4) are real, a fleet owner running 10–100 trucks needs one place to see it all instead of reconstructing it from WhatsApp threads.

**What ships:**
- A real dashboard backed by `FleetMetric`, `TrustScore`, `UpiEscrowAccount`, and `ComplianceDoc` — money owed/received, per-truck utilization, document expiry alerts (insurance, permit, fitness certificate — these already have fields in `ComplianceDoc`, they're just not surfaced as a proactive alert anywhere).
- Verified-pool access for brokers: filter/search trucks and drivers by real trust tier, with the guarantee (no-show protection) priced as a feature of access, not bundled free.
- This is the first genuinely subscription-shaped product in the plan (Tier 2 in the strategy doc) — price it per-truck/month, separate from the per-transaction take rate.

**Exit gate:** a fleet owner can answer "how much am I owed right now, across all my trucks" from this dashboard faster and more accurately than from their own WhatsApp/Excel process — test this directly against a real fleet owner's existing workflow, not against a feature checklist.

---

## Phase 6 — Compliance Automation & Digital Trust Passport

**Why now:** Shippers (Tier 1 willingness-to-pay in the strategy doc: SLA + paperwork elimination) become reachable once the trust/settlement core is provably real — they will not be the first users of an unproven system, but they're the highest-ACV target once trust is demonstrable.

**What ships:**
- E-way bill, GST invoice matching, POD-to-invoice reconciliation, against the existing `ComplianceDoc` model — sold as a headcount-savings product.
- **[NEW] Digital Compliance Passport.** A single scannable QR per truck/driver that aggregates verified status across RC, insurance, permit, fitness certificate, and current trip e-way bill into one checkable artifact — usable at a check-post, by a shipper's gate security, or by a broker before booking. This is valuable for three different reasons at once: (1) it's a real product a shipper or check-post officer will use without needing to understand "TYRE" as a brand, (2) it creates a path to a genuine public-sector/NHAI/transport-department partnership conversation, which is both a credibility signal for investors and a potential distribution channel no logistics-tech competitor currently has, and (3) every scan is itself a verification event that feeds back into the trust score (Phase 1), making the passport self-reinforcing rather than a static badge.

**Exit gate:** a real shipper's ops team uses the passport/compliance automation to replace a specific manual process they currently do (named, measured, e.g. "checking insurance validity before dispatch") and confirms in writing it's faster.

---

## Phase 7 — Embedded Financial Products

**Why now:** Underwriting requires real trip-completion and payment-history data — only possible once Phases 1–2 have been live long enough to produce that history. Building lending products on synthetic data is how you make bad loans.

**What ships:**
- Working capital advance against an *accepted but not yet delivered* load, for drivers/small fleets needing fuel money at trip start — underwritten using TYRE's own data (trust score + transaction history), not a generic credit model.
- Cargo and vehicle insurance distribution at the point of booking — sold as an add-on where TYRE already has the route/cargo-value/driver-history context that makes the purchase decision a single tap, not a separate sales process.
- FASTag/fuel-linked lending against `FastagWallet`, repaid automatically from the settlement leg already running in Phase 2.
- **[NEW] Community-guaranteed micro-lending circles** for the 1–2 truck owner segment that even TYRE's own data can't fully de-risk individually. Small groups of geographically-clustered, similarly-tenured drivers in the same corridor cross-guarantee a small revolving credit line — classic micro-finance social-collateral mechanics, adapted to a segment (single-truck owners) that formal lenders structurally ignore and informal lenders structurally exploit. This is specifically valuable in the wedge corridor because corridor density (Phase 4) means these circles can be built from drivers who already know each other.

**Exit gate:** first real loan/advance issued and repaid through the platform, end to end, with the repayment automatically reconciled against settlement data — not a paper underwriting model, an actual cash cycle completed once.

**Revenue impact:** this is the highest-margin tier in the strategy doc, and now it's buildable on real data instead of a hypothetical.

---

## Phase 8 — Data Monetization Layer **[NEW PHASE]**

**Why now:** Once Phase 7 proves TYRE can underwrite better than external lenders using its own data, that underwriting *capability itself* becomes a sellable asset — a separate revenue line from TYRE's own lending.

**What ships:**
- **[NEW] Logistics Credit Bureau.** License anonymized, consented trust/transaction data to external NBFCs and banks who want to underwrite truckers TYRE itself chooses not to lend to (larger fleets, different corridors). This is a B2B2C data-licensing revenue line, structurally similar to how a credit bureau monetizes — and it's defensible specifically because the underlying trust score (Phase 1) took real volume and time to build, which is the actual moat, not the lending product itself.
- **[NEW] Asset valuation / resale marketplace ("verified history" truck resale).** A truck with a clean, high-utilization, verified trip history (GPS-confirmed routes, no fraud incidents, regular maintenance compliance via `ComplianceDoc`) is worth more on resale than one with no verifiable history — same logic as a vehicle history report in used-car markets. TYRE can power valuation and take a referral/listing fee on resale transactions, monetizing accumulated trip-history data in a way that requires no new data collection, only a new product surface on data already being generated by Phases 1–4.
- **[NEW] TYRE Coins** — a closed-loop loyalty currency earned on completed trips, redeemable for fuel, FASTag recharge, or insurance premium discount. Two purposes at once: it's a retention lever that costs less than cash cashback, and it keeps a sliver of settlement value circulating on-platform rather than leaving immediately, slightly improving unit economics on the take rate.

**Exit gate:** one signed data-licensing or referral agreement with an external financial partner, generating revenue with zero incremental engineering cost beyond what Phases 1, 4, and 7 already produced.

**Moat impact:** this phase doesn't create new moat — it monetizes the moat built in Phases 1, 4, and 7 a second and third time. That's the point: the same trust/history data should earn revenue through TYRE's own lending *and* through external licensing *and* through resale valuation, because the marginal cost of each additional use of already-collected data is close to zero.

---

## Phase 9 — Intelligence & Safety Layer **[NEW PHASE]**

**Why now:** Once real GPS, voice, and transaction data are flowing at volume (Phases 1–4 done), there's enough signal to build genuinely differentiated AI features instead of LLM-wrapper agents — this is where the vernacular-voice moat from the strategy doc gets actually deep instead of just claimed.

**What ships:**
- **[NEW] Dynamic yield/pricing engine** for fleet owners and brokers — airline-style: instead of a static rate card, the pricing agent adjusts the floor price in real time based on corridor demand, return-load probability (Phase 4 data), and a given truck's trust tier (better-tier trucks can clear a higher floor faster), maximizing utilization without a human re-pricing manually.
- **[NEW] Driver wellness and fatigue signal**, derived passively from voice cadence changes and trip-duration/rest-pattern data already being collected via `GpsPing` and `VoiceInteraction` — surfaced as a gentle nudge ("you've been driving 6 hours, next safe stop is 12km"), not as surveillance. Pair this with an insurance-premium discount funded by the insurer (Phase 7) who benefits from reduced claims — turning a safety feature into a small but real revenue-share line instead of a pure cost center.
- Deepen the vernacular voice/NLU pipeline beyond Hindi into the dialect range the strategy doc identified as a real, scarce-data moat (Bhojpuri, Maithili, and the next 2–3 highest-volume dialects in the corridor), using the now-real voice interaction volume from Phase 3 as training signal — this is the point where "voice moat" stops being a slide and starts being a measurable model-quality gap versus competitors.

**Exit gate:** dynamic pricing demonstrably increases truck utilization or fill-rate speed against a fixed-rate-card baseline in an A/B comparison; fatigue nudges are live for real drivers with consented data, not a research prototype.

---

## Phase 10 — Open Trust Network & Platform API **[NEW PHASE]**

**Why now:** This is the literal implementation of the "Stripe for freight trust" framing from the strategy doc's 10-year vision — only buildable once Phases 1–2 have produced a trust/settlement engine good enough that *other companies* would rather integrate it than rebuild it.

**What ships:**
- **[NEW] "Embedded TYRE" API** — a real, documented, rate-limited public API (building directly on `packages/auth`'s `ApiKey` model, already scaffolded but unused per `MERGE_REPORT.md`) that lets external logistics apps, ERPs, or even competing platforms call TYRE's trust score and escrow/settlement engine directly, on a revenue-share or per-call basis. This is the highest-ambition, longest-horizon phase in the plan, and deliberately last — it only works once the underlying engine has enough real volume that "is this counterparty real, will this payment clear" is a question TYRE can answer with more confidence than anyone building it from scratch.
- **[NEW] Reputation portability.** A driver or broker's trust score, verification status, and dispute history become checkable (with consent) by a counterparty who found them *outside* TYRE — e.g., a broker who got a phone number from a WhatsApp group can still verify "is this person legitimate" through TYRE without both sides already being TYRE-native users. This is what makes the trust layer infrastructure rather than a walled garden — and it's the single hardest thing on this entire roadmap for a competitor to copy, because it requires both the historical data (Phase 1) and the willingness to expose it outside your own funnel, which a matching-revenue-dependent competitor (BlackBuck, Vahak) has a structural disincentive to do.

**Exit gate:** one external, non-TYRE-built application successfully completes a real transaction using only the public API — proof the trust/settlement engine is genuinely infrastructure-grade, not just internally convenient.

---

## Phase 11 — Enterprise Shipper Layer & Multi-Corridor Expansion Engine

**Why now:** Last, deliberately. Enterprise shippers and new-geography expansion are both things that consume disproportionate sales/ops effort relative to a 3-engineer team, and both only succeed once there's a real, provable SLA to sell — which is the cumulative output of every phase before this one.

**What ships:**
- Enterprise shipper onboarding: SLA guarantees backed by real historical fill-rate and on-time data (not projections), insurance-backed delivery guarantees (Phase 7), full audit trail (Phase 2's settlement ledger) for dispute/claims handling.
- A codified expansion playbook: what made the Bihar-Jharkhand-UP corridor work (density thresholds, driver-to-load ratios, trust-score distribution before return-load matching became reliable) turned into a repeatable checklist for the next corridor — explicitly resisting the temptation to go wide before the wedge corridor's numbers justify it.

**Exit gate:** first enterprise shipper contract signed referencing a real, historical SLA number (not a target); second corridor selected using the codified playbook's criteria, not opportunistically.

---

## What this plan deliberately refuses to do early

- It does not build Phase 8–10's data-monetization and platform-API ideas before Phases 1–2 are real, no matter how good they sound — they're worthless on top of a simulated escrow system, and building them early is exactly the trap the codebase already fell into once (excellent-looking features with nothing real underneath).
- It does not expand geography or currency before the wedge corridor's return-load and trust-density numbers (Phase 4) justify it, even though the schema already supports multi-region/multi-currency — supporting it in the data model and actually using it productively are different things, and the gap between them is most of this plan.
- It does not treat any AI agent as the product. In every phase, the AI agent is in service of a real data write or a real money movement — the lesson from Phase 0 is that an LLM confidently narrating a transaction is indistinguishable from a real one until someone checks, and someone always eventually checks.
