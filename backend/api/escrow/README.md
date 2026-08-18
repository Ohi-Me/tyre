# backend/api/escrow

Shared backend modules for the `/escrow` domain.

## Layout

- `schemas.ts`  — Zod request/response schemas
- `service.ts\  — business logic (DB calls, agent invocations)
- `types.ts`   — TypeScript types for this domain
- `__tests__/` — unit tests

## Consumption

Next.js route handlers in `frontend/web/app/api/v1/escrow/` import from here:

```ts
import { listLoads, createLoadSchema } from "@tyre/api/escrow";
```

The `@tyre/api` workspace package (see `backend/api/package.json`) re-exports
each domain submodule. Route handlers stay in the Next.js app because Next.js
requires route files to live in `app/api/...` — this folder holds the
*shared, framework-agnostic* logic.
