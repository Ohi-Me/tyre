/**
 * @tyre/auth/rate-limit — tiered request throttling for Next.js route handlers.
 *
 * Ported from axle-platform's `rateLimit.middleware.ts`, which used
 * express-rate-limit + rate-limit-redis. TYRE's BFF is Next.js App Router
 * route handlers, not Express, so there's no middleware chain to hang an
 * express-style limiter off of — this is a from-scratch reimplementation
 * of the same fixed-window-counter algorithm against Redis, exposing a
 * single `checkRateLimit()` call usable at the top of any route handler.
 *
 * Three tiers, matching the original repo's design:
 *   - standard: general API traffic
 *   - auth:     login/register/refresh — slows credential stuffing
 *   - ai:       LLM-backed routes (voice, copilot, negotiate, pricing) —
 *               protects per-request API spend, not just abuse
 *
 * Before this merge, TYRE had zero rate limiting anywhere in the stack
 * (see MERGE_REPORT.md, "Conflict Analysis" — this was a clean win for
 * axle-platform's implementation).
 */

import Redis from "ioredis";

const REDIS_URL = process.env.TYRE_REDIS_URL || process.env.REDIS_URL || "redis://localhost:6379";

let redis: Redis | null = null;
function getRedis(): Redis {
  if (!redis) {
    redis = new Redis(REDIS_URL, { maxRetriesPerRequest: 1, lazyConnect: true });
    redis.on("error", (err) => console.error("[rate-limit] redis error", err.message));
  }
  return redis;
}

export type RateLimitTier = "standard" | "auth" | "ai";

const TIER_CONFIG: Record<RateLimitTier, { windowMs: number; max: number }> = {
  standard: { windowMs: 60_000, max: 120 },
  auth: { windowMs: 15 * 60_000, max: 10 },
  ai: { windowMs: 60_000, max: 20 },
};

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetMs: number;
  message?: string;
}

/**
 * Fixed-window counter in Redis: INCR + EXPIRE-once-per-window.
 * `key` should be a stable per-caller identifier (user id if authenticated,
 * otherwise IP address).
 */
export async function checkRateLimit(tier: RateLimitTier, key: string): Promise<RateLimitResult> {
  const { windowMs, max } = TIER_CONFIG[tier];
  const redisKey = `rl:${tier}:${key}`;

  try {
    const client = getRedis();
    const count = await client.incr(redisKey);
    if (count === 1) {
      await client.pexpire(redisKey, windowMs);
    }
    const ttl = await client.pttl(redisKey);
    const resetMs = ttl > 0 ? ttl : windowMs;

    if (count > max) {
      return {
        allowed: false,
        remaining: 0,
        resetMs,
        message:
          tier === "auth"
            ? "Too many auth attempts. Try again in 15 minutes."
            : tier === "ai"
              ? "AI request limit reached. Try again shortly."
              : "Too many requests, slow down.",
      };
    }
    return { allowed: true, remaining: Math.max(0, max - count), resetMs };
  } catch (err) {
    // Fail open: Redis being unavailable should not take down the whole API.
    console.error("[rate-limit] check failed, failing open", err);
    return { allowed: true, remaining: max, resetMs: windowMs };
  }
}

/** Convenience wrapper that returns a ready-to-send 429 NextResponse body, or null if allowed. */
export async function rateLimitOrNull(
  tier: RateLimitTier,
  key: string
): Promise<{ status: 429; body: { success: false; error: string } } | null> {
  const result = await checkRateLimit(tier, key);
  if (result.allowed) return null;
  return { status: 429, body: { success: false, error: result.message ?? "Rate limit exceeded" } };
}
