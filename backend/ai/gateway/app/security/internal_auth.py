"""
Internal auth middleware — AI-C3 fix.

Enforces authentication on every inbound request to the AI gateway.
Two auth paths:
  1. Internal service token (TYRE_INTERNAL_SERVICE_TOKEN) — for BFF→gateway calls.
     Sent as `Authorization: Bearer <token>`. The token is a shared secret rotated
     out-of-band; it is NOT a JWT.
  2. JWT access token — for direct browser→gateway calls (e.g. voice SSE).
     Verified via the existing verify_access_token() in jwt_auth.py.

Exempt paths (no auth required):
  - GET /health, GET /ready  — K8s probes
  - GET /i18n/locales        — public locale registry
  - POST /wedge/whatsapp/webhook  — uses X-Hub-Signature-256 HMAC instead (AI-C4)
  - POST /wedge/telegram/webhook  — uses X-Telegram-Bot-Api-Secret-Token instead
  - GET /metrics             — Prometheus scrape (scrape is network-isolated)
  - /docs, /openapi.json, /redoc — FastAPI auto-docs (disabled in prod via OpenAPI url)
"""
from __future__ import annotations

import hashlib
import hmac
from collections.abc import Awaitable, Callable

from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from app.config import settings

# Paths exempt from auth (prefix match; method-agnostic except where noted).
EXEMPT_PREFIXES: tuple[str, ...] = (
    "/health",
    "/ready",
    "/metrics",
    "/docs",
    "/openapi.json",
    "/redoc",
    "/i18n/locales",
)
# Webhooks exempt from bearer auth — they use their own per-channel verification:
#   - WhatsApp: X-Hub-Signature-256 HMAC against TYRE_WHATSAPP_APP_SECRET (AI-C4)
#   - Telegram: X-Telegram-Bot-Api-Secret-Token shared secret (Week 1 of bridge)
EXEMPT_WEBHOOK_PATHS: dict[str, str] = {
    "/wedge/whatsapp/webhook": "POST",
    "/wedge/telegram/webhook": "POST",
}


class InternalAuthMiddleware(BaseHTTPMiddleware):
    """
    Enforce auth on every request. Order of checks:
      1. If path is exempt → allow.
      2. If path is the WhatsApp webhook → verify X-Hub-Signature-256 (AI-C4).
      3. If path is the Telegram webhook → verify X-Telegram-Bot-Api-Secret-Token.
      4. If Authorization header is a Bearer token:
         a. If token == TYRE_INTERNAL_SERVICE_TOKEN → allow (internal service).
         b. Else try JWT verification → allow if valid.
      5. Else → 401.
    """

    async def dispatch(
        self, request: Request, call_next: Callable[[Request], Awaitable]
    ):
        path = request.url.path
        method = request.method.upper()

        # 1. Exempt prefixes
        for prefix in EXEMPT_PREFIXES:
            if path == prefix or path.startswith(prefix + "/") or path.startswith(prefix):
                return await call_next(request)

        # 2. WhatsApp webhook — verify HMAC signature (AI-C4)
        # 3. Telegram webhook — verify secret_token (Week 1 of bridge)
        webhook_method = EXEMPT_WEBHOOK_PATHS.get(path)
        if webhook_method and method == webhook_method:
            if path == "/wedge/whatsapp/webhook":
                return await self._verify_whatsapp_signature(request, call_next)
            if path == "/wedge/telegram/webhook":
                return await self._verify_telegram_secret(request, call_next)

        # 4. Authorization header
        auth = request.headers.get("authorization", "")
        if not auth.startswith("Bearer "):
            return JSONResponse(
                status_code=401,
                content={"error": "Missing or malformed Authorization header"},
            )
        token = auth[len("Bearer ") :]

        # 4a. Internal service token
        internal_token = getattr(settings, "internal_service_token", None) or (
            __import__("os").environ.get("TYRE_INTERNAL_SERVICE_TOKEN")
        )
        if internal_token and hmac.compare_digest(token, internal_token):
            return await call_next(request)

        # 4b. JWT
        try:
            from app.security.jwt_auth import verify_access_token
            verify_access_token(token)
        except HTTPException as exc:
            return JSONResponse(
                status_code=401,
                content={"error": f"Invalid token: {exc.detail}"},
            )
        except Exception as exc:  # noqa: BLE001
            return JSONResponse(
                status_code=401,
                content={"error": f"Token verification failed: {exc}"},
            )

        return await call_next(request)

    async def _verify_whatsapp_signature(
        self, request: Request, call_next: Callable[[Request], Awaitable]
    ):
        """Verify X-Hub-Signature-256 HMAC against TYRE_WHATSAPP_APP_SECRET (AI-C4)."""
        app_secret = getattr(settings, "whatsapp_app_secret", None) or (
            __import__("os").environ.get("TYRE_WHATSAPP_APP_SECRET")
        )
        if not app_secret:
            return JSONResponse(
                status_code=503,
                content={"error": "Webhook secret not configured (TYRE_WHATSAPP_APP_SECRET)"},
            )
        signature = request.headers.get("x-hub-signature-256", "")
        # Read body once — must clone for downstream handler
        body = await request.body()
        expected = "sha256=" + hmac.new(
            app_secret.encode("utf-8"), body, hashlib.sha256
        ).hexdigest("utf-8") if isinstance(app_secret, str) else hmac.new(
            app_secret, body, hashlib.sha256
        ).hexdigest("utf-8")
        if not signature or not hmac.compare_digest(signature, expected):
            return JSONResponse(
                status_code=401,
                content={"error": "Invalid X-Hub-Signature-256"},
            )
        # Re-inject body so downstream handler can read it
        async def receive():
            return {"type": "http.request", "body": body, "more_body": False}
        request._receive = receive  # type: ignore[attr-defined]
        return await call_next(request)

    async def _verify_telegram_secret(
        self, request: Request, call_next: Callable[[Request], Awaitable]
    ):
        """Verify X-Telegram-Bot-Api-Secret-Token against TYRE_TELEGRAM_WEBHOOK_SECRET.

        Telegram's webhook auth is simpler than Meta's — one shared secret set
        when calling /bot<token>/setWebhook, sent verbatim on every webhook
        delivery. No HMAC body computation, no GET challenge step. See
        docs/WEBHOOKS.md §3."""
        secret = getattr(settings, "telegram_webhook_secret", None) or (
            __import__("os").environ.get("TYRE_TELEGRAM_WEBHOOK_SECRET")
        )
        if not secret:
            return JSONResponse(
                status_code=503,
                content={"error": "Webhook secret not configured (TYRE_TELEGRAM_WEBHOOK_SECRET)"},
            )
        provided = request.headers.get("x-telegram-bot-api-secret-token", "")
        if not provided or not hmac.compare_digest(provided, secret):
            return JSONResponse(
                status_code=401,
                content={"error": "Invalid X-Telegram-Bot-Api-Secret-Token"},
            )
        # Read body so downstream handler can re-read it after we consume it here
        body = await request.body()
        async def receive():
            return {"type": "http.request", "body": body, "more_body": False}
        request._receive = receive  # type: ignore[attr-defined]
        return await call_next(request)
