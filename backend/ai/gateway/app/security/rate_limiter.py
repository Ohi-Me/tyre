"""
Rate Limiter — prevents abuse, DoS, and API cost overruns.

Per-phone and per-IP rate limiting using Redis.
"""
from __future__ import annotations

import time
from dataclasses import dataclass


@dataclass
class RateLimitResult:
    allowed: bool
    remaining: int
    reset_at: float
    limit: int


class RateLimiter:
    """
    Rate limiter using Redis (production) or in-memory dict (dev/test).

    Limits:
      - Per phone: 60 requests/minute (1/sec)
      - Per IP: 120 requests/minute (2/sec)
      - Voice commands: 20/minute per driver (prevent API cost overrun)
      - Load search: 10/minute per driver
      - UPI escrow advance: 5/minute per driver (prevent fraud)
    """

    LIMITS = {
        "default": (60, 60),          # 60 requests per 60 seconds
        "voice": (20, 60),            # 20 voice commands per 60 seconds
        "load_search": (10, 60),      # 10 searches per 60 seconds
        "escrow_advance": (5, 60),    # 5 advance releases per 60 seconds
        "onboarding": (3, 3600),      # 3 onboarding attempts per hour
        "verification": (10, 3600),   # 10 verification attempts per hour
    }

    def __init__(self, use_redis: bool = False, redis_url: str | None = None):
        self._use_redis = use_redis
        self._redis = None
        self._redis_url = redis_url
        # In-memory fallback for dev/test, and a fail-open backstop if Redis is down.
        self._memory: dict[str, list[float]] = {}

    async def _get_redis(self):
        if self._redis is None:
            import redis.asyncio as aioredis

            self._redis = aioredis.from_url(self._redis_url or "redis://localhost:6379", decode_responses=True)
        return self._redis

    async def check(self, key: str, limit_type: str = "default") -> RateLimitResult:
        """Check if request is allowed under rate limit."""
        limit, window_sec = self.LIMITS.get(limit_type, self.LIMITS["default"])
        now = time.time()

        if self._use_redis:
            try:
                return await self._check_redis(key, limit, window_sec, now)
            except Exception:
                # Redis unavailable — fail open via the in-memory path rather than
                # taking the whole gateway down.
                return self._check_memory(key, limit, window_sec, now)
        return self._check_memory(key, limit, window_sec, now)

    def _check_memory(self, key: str, limit: int, window_sec: int, now: float) -> RateLimitResult:
        """In-memory rate limit check (dev/test, and Redis-down fallback)."""
        if key not in self._memory:
            self._memory[key] = []

        # Remove expired entries
        cutoff = now - window_sec
        self._memory[key] = [t for t in self._memory[key] if t > cutoff]

        # Check limit
        current_count = len(self._memory[key])
        if current_count >= limit:
            reset_at = self._memory[key][0] + window_sec
            return RateLimitResult(
                allowed=False, remaining=0, reset_at=reset_at, limit=limit
            )

        # Add current request
        self._memory[key].append(now)
        return RateLimitResult(
            allowed=True, remaining=limit - current_count - 1, reset_at=now + window_sec, limit=limit
        )

    async def _check_redis(self, key: str, limit: int, window_sec: int, now: float) -> RateLimitResult:
        """
        Redis sliding-window check using a sorted set: ZREMRANGEBYSCORE trims
        entries older than the window, ZADD records this request, ZCARD counts
        the window, and EXPIRE bounds the key's lifetime. This replaces the
        previous always-falls-back-to-memory stub.
        """
        client = await self._get_redis()
        redis_key = f"ratelimit:{key}:{window_sec}"
        cutoff = now - window_sec

        pipe = client.pipeline()
        pipe.zremrangebyscore(redis_key, 0, cutoff)
        pipe.zcard(redis_key)
        _, current_count = await pipe.execute()

        if current_count >= limit:
            oldest = await client.zrange(redis_key, 0, 0, withscores=True)
            reset_at = (oldest[0][1] + window_sec) if oldest else now + window_sec
            return RateLimitResult(allowed=False, remaining=0, reset_at=reset_at, limit=limit)

        pipe = client.pipeline()
        pipe.zadd(redis_key, {f"{now}": now})
        pipe.expire(redis_key, window_sec)
        await pipe.execute()

        return RateLimitResult(
            allowed=True, remaining=limit - current_count - 1, reset_at=now + window_sec, limit=limit
        )

    def clear(self, key: str = None):
        """Clear rate limit data for a key (or all)."""
        if key:
            self._memory.pop(key, None)
        else:
            self._memory.clear()
