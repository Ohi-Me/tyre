"""
JWT verification for direct browser → ai-gateway calls.

Ported & adapted during the TYRE 3-repo consolidation (see MERGE_REPORT.md).
The web BFF (frontend/web, via @tyre/auth/jwt.ts) signs short-lived HS256 access
tokens with TYRE_JWT_ACCESS_SECRET. Most ai-gateway traffic is reached via
the BFF over the internal network (trusted), but a few endpoints are called
directly by the browser and need independent verification:

  - /voice/sessions/{id}/events (SSE) — can't carry Next.js cookies across
    the BFF/gateway origin boundary in production.
  - Any future mobile-direct or webhook-replay calls.

This intentionally mirrors the payload shape signed in
backend/shared/auth/src/jwt.ts (`sub`, `role`, `orgId`, `phone`, `email`) so a
single token works against both services.
"""
from __future__ import annotations

from dataclasses import dataclass

import jwt
from fastapi import Header, HTTPException

from app.config import settings


@dataclass
class JwtUser:
    user_id: str
    role: str
    org_id: str
    phone: str | None = None
    email: str | None = None


def verify_access_token(token: str) -> JwtUser:
    try:
        payload = jwt.decode(token, settings.jwt_access_secret, algorithms=["HS256"])
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=401, detail=f"Invalid or expired access token: {exc}") from exc

    return JwtUser(
        user_id=payload["sub"],
        role=payload.get("role", "driver"),
        org_id=payload.get("orgId", ""),
        phone=payload.get("phone"),
        email=payload.get("email"),
    )


async def require_bearer_auth(authorization: str | None = Header(default=None)) -> JwtUser:
    """FastAPI dependency: `user: JwtUser = Depends(require_bearer_auth)`."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or malformed Authorization header")
    return verify_access_token(authorization[len("Bearer ") :])


async def optional_bearer_auth(authorization: str | None = Header(default=None)) -> JwtUser | None:
    """Like require_bearer_auth, but returns None instead of raising when absent/invalid."""
    if not authorization or not authorization.startswith("Bearer "):
        return None
    try:
        return verify_access_token(authorization[len("Bearer ") :])
    except HTTPException:
        return None
