# TYRE

> **Voice-first. UPI escrow. Built for the Bihar–Jharkhand–UP corridor.**

TYRE is the AI-native freight operating system for Indian trucking. Drivers speak Bhojpuri or Hindi to find loads. Brokers post loads with GSTIN-verified trust. UPI escrow releases a ₹10,000 advance on load acceptance and the balance on GPS-verified delivery + consignee WhatsApp confirmation. Return-load matching cuts empty miles.

This repo is the result of a 3-way merge (TYRE v1.0 + axle-platform + AXLE v3.2) — see [`docs/CHANGELOG.md`](./docs/CHANGELOG.md) for how it got here. The wedge thesis, architecture, and domain model are strong; what's stubbed vs real is documented honestly in [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) §8.

---

## Read these three docs first

1. **[`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md)** — System architecture: BFF + AI gateway split, data model, voice pipeline, payments, trust scoring, security, scaling limits, failure modes. Includes a "Stub vs Real" section that calls out every not-yet-real subsystem by name.
2. **[`docs/PHASE-PLAN.md`](./docs/PHASE-PLAN.md)** — Phase 0–11 plan with exit gates. Phase 0 closes the demo-to-real gap. Phase 2 is where revenue starts. Phases 8–10 are new (data monetization, intelligence/safety, open trust network).
3. **[`docs/CHANGELOG.md`](./docs/CHANGELOG.md)** — Milestone-style history: AXLE v3.2 → v3.2 audit → TYRE v1.0 rename → 3-repo merge → current state → next planned phase.

Superseded docs (`V3.2-*`, `MERGE_REPORT`, `TYRE-Transformation-Report`, `I18N_ROADMAP`, `VOICE_PIPELINE`, `SECURITY`, `CONTRIBUTING`, original `ARCHITECTURE`, 3 strategic-brief PDFs) are in [`docs/archive/`](./docs/archive/) for reference.

---

## Quick start

### Prerequisites
- [Node.js](https://nodejs.org) ≥ 18.18 + [pnpm](https://pnpm.io) ≥ 9 (run `corepack enable`)
- Python ≥ 3.11
- Docker
- [Groq API key](https://console.groq.com)
- [Razorpay Route API access](https://razorpay.com/docs/route/) for UPI escrow

### 1. Install
```bash
corepack enable          # activates the pinned pnpm
pnpm install
cd backend/ai/gateway && pip install -e .
```

### 2. Configure environment
```bash
cp .env.example .env
# Set TYRE_GROQ_KEY, TYRE_RAZORPAY_KEY_ID, TYRE_RAZORPAY_KEY_SECRET, DATABASE_URL
```

### 3. Set up database
```bash
pnpm run db:push
pnpm run seed      # Seeds Bihar-Jharkhand-UP demo data
```

### 4. Run development servers
```bash
# Terminal 1: AI gateway
cd backend/ai/gateway && uvicorn app.main:app --reload --port 8000

# Terminal 2: Web app
pnpm --filter @tyre/web dev
```

Open [http://localhost:3000](http://localhost:3000) → land on Hindi (`/hi`).
Switch to Bhojpuri: `/bho` (Y1 launch dialect).

### 5. Or run the full stack via Docker
```bash
docker compose -f infra/docker/docker-compose.yml --env-file .env up -d
```

---

## Repository layout

```
tyre/
├── frontend/
│   ├── web/                  # Next.js 16 — frontend + BFF API routes
│   │   ├── app/
│   │   │   ├── [locale]/     # Locale-aware routing (5 Y1 locales)
│   │   │   └── api/v1/       # BFF routes (loads, trips, voice, auth, etc.)
│   │   ├── components/tyre/  # Landing + app shell + 10 views
│   │   ├── hooks/            # use-voice-command, use-upi-escrow, etc.
│   │   ├── lib/              # Prisma client, tyre store, mock data
│   │   └── messages/         # 7 locale files (en, hi, bho, bn, mr, sw, pt-BR)
│   └── shared-ui/            # Design tokens + locale-aware formatters (@tyre/ui)
├── backend/
│   ├── api/                  # Domain-organized shared API logic (@tyre/api)
│   │   ├── auth/             #   auth domain (schemas, service, types)
│   │   ├── loads/            #   loads domain
│   │   ├── trucks/           #   trucks domain
│   │   ├── trips/            #   trips domain
│   │   ├── pricing/          #   pricing domain
│   │   ├── escrow/           #   escrow domain
│   │   ├── trust/            #   trust domain
│   │   ├── fastag/           #   fastag domain
│   │   ├── voice/            #   voice domain
│   │   └── webhooks/         #   webhooks domain
│   ├── ai/
│   │   ├── gateway/          # Python FastAPI — AI agents + voice pipeline
│   │   │   ├── app/
│   │   │   │   ├── agents/   #   10 agents (4 Y1 active + 6 Y2+)
│   │   │   │   ├── ai/       #   13 sub-modules (payments, trust, voice, etc.)
│   │   │   │   ├── api/      #   FastAPI routes (health, voice, agents, i18n, wedge)
│   │   │   │   ├── security/ #   Rate limit, JWT, PII, input validation
│   │   │   │   └── voice/    #   Voice pipeline + workflows
│   │   │   └── tests/        #   16 test files
│   │   ├── client/           # TS HTTP client for the gateway (@tyre/ai-client)
│   │   ├── agents/           # TS wrappers around gateway agents
│   │   ├── routing/          # TS wrappers for routing AI
│   │   ├── speech/           # TS wrappers for STT/TTS
│   │   ├── translation/      # TS wrappers for translation providers
│   │   ├── localization/     # TS wrappers for localization service
│   │   └── onboarding/       # TS wrappers for onboarding flows
│   ├── database/
│   │   ├── prisma/           # Prisma schema + client (50 models) + PII encryption
│   │   ├── migrations/       # Prisma migration history
│   │   └── seed/             # Seed scripts (Bihar-Jharkhand-UP corridor)
│   ├── shared/
│   │   ├── auth/             # NextAuth + JWT + RBAC + rate limit + audit (@tyre/auth)
│   │   ├── i18n/             # 5 Y1 locales + 110 future (not loaded) (@tyre/i18n)
│   │   ├── utils/            # Main shared entry + regions + helpers (@tyre/shared)
│   │   ├── types/            # TypeScript domain types + Zod schemas
│   │   └── constants/        # Enums + constant tables
│   └── tests/                # Cross-cutting integration tests
├── infra/
│   ├── docker/               # docker-compose + Postgres init + Caddyfile
│   ├── kubernetes/           # K8s manifests (tyre namespace)
│   ├── helm/                 # Helm chart
│   ├── terraform/            # AWS EKS ap-south-1
│   ├── monitoring/           # OTel + Prometheus + Grafana
│   └── ci-cd/                # CI/CD helpers + shared build scripts
├── scripts/                  # sync-locales, translate-messages
├── docs/
│   ├── ARCHITECTURE.md       # ⭐ System architecture (start here)
│   ├── PHASE-PLAN.md         # ⭐ Phase 0–11 plan with exit gates
│   ├── CHANGELOG.md          # ⭐ Milestone history
│   ├── README.md             # You are here (repo root)
│   └── archive/              # Superseded docs (V3.2-*, MERGE_REPORT, etc.)
├── .env.example              # Environment template (copy to .env)
├── package.json              # Workspace root
├── pnpm-workspace.yaml       # pnpm workspace globs (frontend/*, backend/*)
├── turbo.json                # Turborepo config
└── tsconfig.base.json
```

---

## Y1 scope (the wedge)

- **Locales:** `hi`, `bho`, `en` (H1) + `bn`, `mr` (H2). 110 more registered, not loaded.
- **AI agents (active):** Dispatch, Pricing, Fraud, Payment, Trust. 6 more exist as Y2+ files.
- **Payment rail:** UPI only (Razorpay Route). Pix/M-Pesa/Stripe/etc. are Y2+.
- **Country:** India only. Y2: +1. Y3: +2.
- **Wedge corridor:** Bihar–Jharkhand–UP.
- **PMF signal:** 60-second advance release, 95%+ hit rate over 7-day rolling window.

---

## License

Proprietary — © 2026 TYRE Technologies Pvt. Ltd. All rights reserved.

---

## Multi-Panel Dashboard (v2 Update)

The app now defaults to a **multi-panel dashboard** showing all 9 operational sections on a single page in a 3-column grid layout:

1. **Dispatch** — load dispatch operations with status cards + table
2. **Fleet** — vehicle management with fuel/efficiency stats
3. **Drivers** — driver performance with ratings and status
4. **Trips** — trip tracking with status indicators
5. **Load Board** — load posting and management
6. **Documents** — document compliance with donut chart
7. **Insights** — revenue trends, top routes, KPIs
8. **Reports** — downloadable report list
9. **Voice Studio** — voice assistant with commands and conversations

### What's New

- **Updated sidebar** — Flat list of 16 nav items with orange active state, workspace switcher, TYRE Copilot CTA
- **Updated topbar** — "LIVE + 1,745" counter, search, notifications, "Dispatch new load" button
- **New API endpoint** — `GET /api/v1/dashboard` returns aggregated data for all 9 panels
- **New query hooks** — `useDashboard` and `useDrivers` in `lib/api/queries/`
- **New Prisma models** — `Notification`, `RoutePerf`, `RevenuePoint`, `WeatherAlert` for dashboard widgets
- **New seed script** — `scripts/seed-dashboard.ts` populates dashboard support tables
- **Updated views** — Marketplace, Fleet, Drivers, Trips now use the new design language with colored status cards and filter bars
- **New panel components** — 9 reusable panel components in `components/tyre/app/views/panels/`

### Dashboard Setup

```bash
# 1. Push the new Prisma models to your database
pnpm --filter @tyre/db prisma db push

# 2. Seed the dashboard support data
npx tsx scripts/seed-dashboard.ts

# 3. Start the dev server
pnpm --filter @tyre/web dev
```

The dashboard will load at `http://localhost:3000` (defaults to app mode with the dashboard view).

### Dashboard API

`GET /api/v1/dashboard` returns a single JSON response with all data needed for the 9 panels:

```json
{
  "success": true,
  "data": {
    "dispatch": { "totalLoads": 12, "inTransit": 4, ... },
    "fleet": { "totalVehicles": 18, "running": 14, ... },
    "drivers": { "totalDrivers": 10, "active": 7, ... },
    "trips": { "all": 20, "ongoing": 4, ... },
    "loadBoard": { "myLoads": 12, "active": 6, ... },
    "documents": { "valid": 124, "expiring": 8, ... },
    "insights": { "totalRevenue": 1245000, ... },
    "reports": [...],
    "voiceStudio": { "usageThisWeek": 247, ... }
  }
}
```

Every panel query is individually guarded: if the dashboard support tables haven't been migrated yet, the affected sections degrade to empty/zero values — the API does not fabricate numbers.
