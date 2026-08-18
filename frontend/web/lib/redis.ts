/**
 * Shared ioredis singleton for the web BFF.
 *
 * Mirrors the connection convention used by @tyre/auth/rate-limit so the whole
 * app talks to one Redis. Lazy-connects; survives Next.js dev hot-reloads by
 * stashing the client on globalThis.
 */
import Redis from "ioredis";

const REDIS_URL = process.env.TYRE_REDIS_URL || process.env.REDIS_URL || "redis://localhost:6379";

const g = globalThis as unknown as { __tyreRedis?: Redis };

export function getRedis(): Redis {
  if (!g.__tyreRedis) {
    g.__tyreRedis = new Redis(REDIS_URL, { maxRetriesPerRequest: 1, lazyConnect: true });
    g.__tyreRedis.on("error", (err) => console.error("[redis] error", err.message));
  }
  return g.__tyreRedis;
}
