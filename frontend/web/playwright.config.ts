import { defineConfig } from "@playwright/test";

/**
 * E2E harness (audit item: Phase 17). API-level end-to-end tests that exercise
 * the real Next.js route handlers → Prisma → Postgres stack.
 *
 * Run:
 *   pnpm add -D @playwright/test         # one-time
 *   pnpm --filter @tyre/web exec playwright test
 *
 * Requires a reachable database (DATABASE_URL) and a seeded org for the auth
 * flows. The freight suite is login-free (x-tyre-actor) so it runs standalone.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://localhost:3000",
    extraHTTPHeaders: { "content-type": "application/json" },
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "pnpm --filter @tyre/web dev",
        url: "http://localhost:3000/api/v1/health",
        timeout: 120_000,
        reuseExistingServer: !process.env.CI,
      },
});
