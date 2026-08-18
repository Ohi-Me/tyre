# ADR-001 — Status of `backend/api/*` vs. the Next.js BFF API

**Status:** Accepted (documented during the July 2026 production-readiness audit)
**Related audit item:** ARCH-1

## Context

There are two places that look like "the API":

1. **`frontend/web/app/api/v1/*`** — the live, request-serving API. These Next.js
   route handlers are what production actually runs. All ~70 endpoints (auth,
   freight, loads, trips, trucks, drivers, escrow, webhooks, etc.) resolve here.

2. **`backend/api/*`** (package `@tyre/api`) — a **partial extraction** of pure,
   framework-agnostic logic: `schemas.ts` (Zod), `serializer.ts`, and `service.ts`
   for `loads`, `trucks`, and `trips`. Several subfolders (`auth`, `escrow`,
   `fastag`, `pricing`, `trust`, `voice`, `webhooks`) are still only `.gitkeep` +
   `README.md` placeholders.

This is **not dead code**: `frontend/web/vitest.config.ts` aliases `@tyre/api/*`
to these files, and `lib/api/__tests__/loads.test.ts` unit-tests the extracted
Zod schemas. But it **is** a duplication risk — the live route handlers currently
carry their own inline schemas/serialization that overlap with the extracted ones.

## Decision

Treat `backend/api/*` as the **intended home for pure domain logic** (validation
schemas, serializers, services with no `NextRequest`/`NextResponse` coupling).
The Next.js route handlers should progressively become thin adapters that:

1. do auth / rate-limit / parse the request,
2. delegate to a `@tyre/api/<domain>` service,
3. serialize the result.

Do **not** delete `backend/api/*` — it is tested and is the target architecture.
Do **not** add new business logic that duplicates an already-extracted schema;
import it from `@tyre/api` instead.

## Consequences

- New endpoints for `loads`/`trucks`/`trips` should import schemas from
  `@tyre/api/<domain>/schemas` rather than redefining them inline.
- The empty placeholder folders should either be filled following the same
  pattern or removed in a dedicated cleanup PR (they currently mislead readers
  into thinking the extraction is more complete than it is).
- A follow-up task should migrate the inline Zod in `app/api/v1/loads/route.ts`
  to consume `@tyre/api/loads/schemas` to remove the current duplication.
