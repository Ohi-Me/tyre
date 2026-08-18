import { defineConfig } from "vitest/config";
import path from "node:path";

const MONOREPO_ROOT = path.resolve(__dirname, "../..");

export default defineConfig({
  root: MONOREPO_ROOT,
  test: {
    environment: "node",
    globals: true,
    include: [
      "frontend/web/**/*.test.{ts,tsx}",
      "backend/**/*.test.{ts,tsx}",
    ],
    // Must be glob patterns: bare "node_modules" only matched the root-level
    // directory, so the include globs descended into nested node_modules and
    // looped forever on pnpm's recursive @tyre/* workspace symlinks (EMFILE).
    exclude: ["**/node_modules/**", "**/.next/**", "**/dist/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: ["node_modules/", ".next/", "**/*.config.*", "**/*.d.ts"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      "@tyre/shared": path.resolve(MONOREPO_ROOT, "backend/shared/utils/index.ts"),
      "@tyre/db": path.resolve(MONOREPO_ROOT, "backend/database/prisma/index.ts"),
      "@tyre/db/models": path.resolve(MONOREPO_ROOT, "backend/database/prisma/models.ts"),
      "@tyre/auth": path.resolve(MONOREPO_ROOT, "backend/shared/auth/src/index.ts"),
      "@tyre/i18n": path.resolve(MONOREPO_ROOT, "backend/shared/i18n/src/index.ts"),
      "@tyre/ai-client": path.resolve(MONOREPO_ROOT, "backend/ai/client/src/index.ts"),
      "@tyre/api": path.resolve(MONOREPO_ROOT, "backend/api/index.ts"),
      "@tyre/api/loads": path.resolve(MONOREPO_ROOT, "backend/api/loads/index.ts"),
      "@tyre/api/loads/schemas": path.resolve(MONOREPO_ROOT, "backend/api/loads/schemas.ts"),
      "@tyre/api/loads/serializer": path.resolve(MONOREPO_ROOT, "backend/api/loads/serializer.ts"),
      "@tyre/api/trucks": path.resolve(MONOREPO_ROOT, "backend/api/trucks/index.ts"),
      "@tyre/api/trips": path.resolve(MONOREPO_ROOT, "backend/api/trips/index.ts"),
    },
  },
});
