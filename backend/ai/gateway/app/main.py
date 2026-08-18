"""
TYRE AI Gateway — application entrypoint.

Routes:
  GET  /health                  — liveness probe
  GET  /ready                   — readiness probe (checks Groq/Redis/Qdrant)
  POST /voice/process           — STT → NLU → MT → TTS pipeline
  POST /agents/negotiate        — game-theory counter-offer
  POST /agents/dispatch         — load matching
  POST /agents/pricing          — rate calculation with cost breakdown
  POST /agents/fraud            — broker risk assessment
  POST /agents/compliance       — e-way bill / GST / fastag automation
  POST /agents/route            — multi-stop ETA + toll/fuel optimization
  POST /agents/copilot          — operator chat assistant
  POST /agents/contract         — contract drafting from accepted quote
  POST /agents/payment          — escrow release + invoice reconciliation
  POST /i18n/translate          — NLLB-200 batch translation
  POST /i18n/detect             — language detection
  GET  /i18n/locales            — list all supported locales + capabilities
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

try:
    from prometheus_fastapi_instrumentator import Instrumentator
except Exception:  # metrics are best-effort — never block startup on them
    Instrumentator = None

from app.api import (
    agents_router,
    health_router,
    i18n_router,
    voice_router,
)
from app.config import settings

# ── Sentry error tracking (TYRE v1.1 item #8) ────────────────────────────────
# Guarded so the gateway still boots if sentry-sdk isn't installed or no DSN is set.
# Install: pip install "sentry-sdk[fastapi]". A silent UPI advance failure (Razorpay
# error → bff_client retries → logs → continues) was previously invisible; with a DSN
# set it now raises an alert.
if settings.sentry_dsn:
    try:
        import sentry_sdk
        sentry_sdk.init(
            dsn=settings.sentry_dsn,
            traces_sample_rate=settings.sentry_traces_sample_rate,
            environment="production",
        )
    except Exception as _sentry_err:  # noqa: BLE001 — never block startup on telemetry
        import logging
        logging.getLogger("tyre").warning("[sentry] init skipped: %s", _sentry_err)
from app.api.voice_workflows import router as voice_workflows_router
from app.api.wedge import router as wedge_router
from app.orchestrator import Orchestrator
from app.security.rate_limiter import RateLimiter
from app.telemetry import setup_telemetry

# Maps URL path prefixes to the RateLimiter "limit_type" buckets defined in
# security/rate_limiter.py. This is the piece that was missing before the
# 3-repo merge: RateLimiter existed but was never instantiated or called
# from anywhere (see MERGE_REPORT.md, "Dead Code").
_RATE_LIMIT_ROUTES = {
    "/voice": "voice",
    "/wedge/onboarding": "onboarding",
    "/wedge/verification": "verification",
    "/agents": "default",
}


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup + shutdown hooks."""
    setup_telemetry()
    app.state.orchestrator = Orchestrator()
    app.state.orchestrator.start()
    app.state.rate_limiter = RateLimiter(use_redis=bool(settings.redis_url), redis_url=settings.redis_url)
    yield
    app.state.orchestrator.stop()


app = FastAPI(
    title="TYRE AI Gateway",
    version="3.0.0",
    description="AI orchestrator + voice pipeline for emerging-market logistics.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

# AI-C3 fix: enforce auth on every request except exempt paths.
# InternalAuthMiddleware runs AFTER CORS (Starlette runs middleware in LIFO order,
# so this is the first to see the request after CORS preflight passes).
from app.security.internal_auth import InternalAuthMiddleware  # noqa: E402

app.add_middleware(InternalAuthMiddleware)


@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    """Per-IP rate limiting, tiered by route. Health/metrics are exempt."""
    path = request.url.path
    if path in ("/health", "/ready", "/metrics"):
        return await call_next(request)

    limit_type = "default"
    for prefix, bucket in _RATE_LIMIT_ROUTES.items():
        if path.startswith(prefix):
            limit_type = bucket
            break

    limiter: RateLimiter = request.app.state.rate_limiter
    client_ip = request.client.host if request.client else "unknown"
    result = await limiter.check(f"ip:{client_ip}", limit_type)
    if not result.allowed:
        return JSONResponse(
            status_code=429,
            content={"success": False, "error": f"Rate limit exceeded for '{limit_type}'. Try again shortly."},
            headers={"Retry-After": str(max(1, int(result.reset_at - __import__("time").time())))},
        )
    return await call_next(request)


# Prometheus metrics — best-effort. Guarded so a missing or version-incompatible
# instrumentator (e.g. the _IncludedRouter/route.path mismatch on some FastAPI
# versions) can't crash the gateway; metrics just won't be exposed in that case.
if Instrumentator is not None:
    try:
        Instrumentator().instrument(app).expose(app, endpoint="/metrics")
    except Exception as _metrics_err:  # pragma: no cover
        import logging
        logging.getLogger("tyre").warning("[metrics] instrumentator disabled: %s", _metrics_err)

app.include_router(health_router)
app.include_router(voice_router, prefix="/voice", tags=["voice"])
app.include_router(agents_router, prefix="/agents", tags=["agents"])
app.include_router(i18n_router, prefix="/i18n", tags=["i18n"])
app.include_router(voice_workflows_router, prefix="/voice", tags=["voice-workflows"])
app.include_router(wedge_router, prefix="/wedge", tags=["wedge-y1"])


@app.exception_handler(Exception)
async def unhandled_exception_handler(request, exc):
    # Starlette exception handlers MUST return a Response, not a tuple. Returning
    # ({...}, 500) made every error path crash with "'tuple' object is not callable",
    # masking the real error. Return a proper JSONResponse instead.
    return JSONResponse(
        status_code=500,
        content={"success": False, "error": str(exc), "path": str(request.url.path)},
    )
