# TYRE Web — Next.js 16 (frontend + API routes)
# Multi-stage: deps + build + runtime.

FROM node:20-alpine AS builder
RUN apk add --no-cache libc6-compat
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# Workspace manifests first (better layer caching), then full sources.
COPY package.json pnpm-workspace.yaml .npmrc ./
COPY pnpm-lock.yaml* ./
# Root TS config that every package/app extends via "../../tsconfig.base.json".
COPY tsconfig.base.json ./
# Backend packages the web app depends on (transpiled via transpilePackages).
COPY backend/ ./backend/
# Frontend web app + shared-ui.
COPY frontend/ ./frontend/

# No committed lockfile yet → don't require a frozen one.
RUN pnpm install --no-frozen-lockfile
RUN pnpm run db:generate && \
    pnpm --filter @tyre/web build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=builder /app/frontend/web/.next/standalone ./
COPY --from=builder /app/frontend/web/.next/static ./frontend/web/.next/static
COPY --from=builder /app/frontend/web/public ./frontend/web/public
COPY --from=builder /app/frontend/web/messages ./frontend/web/messages

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --retries=5 --start-period=30s \
  CMD wget -qO- http://127.0.0.1:3000/api/v1/health || exit 1

CMD ["node", "frontend/web/server.js"]
