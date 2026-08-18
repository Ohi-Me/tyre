"use client";

/**
 * Auth token store — the client-side home of the bearer access token and the
 * opaque refresh token issued by /api/v1/auth/{login,register,refresh}.
 *
 * Storage: localStorage. The backend deliberately issues portable bearer tokens
 * (short-lived access + rotating refresh) for the /api/v1/* surface, mobile, and
 * cross-origin SSE — see backend/shared/auth/src/jwt.ts. A future hardening step
 * (NEXT.md) can move these to httpOnly cookies; the rest of the app only depends
 * on the accessor functions below, so that swap is localized.
 */

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

const KEY = "tyre.auth.v1";
const EVT = "tyre-auth-changed";

export function getTokens(): AuthTokens | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const t = JSON.parse(raw) as AuthTokens;
    return t?.accessToken && t?.refreshToken ? t : null;
  } catch {
    return null;
  }
}

export function getAccessToken(): string | null {
  return getTokens()?.accessToken ?? null;
}

export function setTokens(tokens: AuthTokens) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(tokens));
  window.dispatchEvent(new Event(EVT));
}

export function clearTokens() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(KEY);
  window.dispatchEvent(new Event(EVT));
}

export function isAuthenticated(): boolean {
  return getTokens() !== null;
}

export const AUTH_EVENT = EVT;
