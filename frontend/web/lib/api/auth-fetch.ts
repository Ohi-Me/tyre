"use client";

/**
 * authFetch — the single fetch wrapper for the operator app.
 *
 *  - Attaches `Authorization: Bearer <accessToken>` when a token exists.
 *  - On a 401 from a protected route, transparently rotates the refresh token
 *    via /api/v1/auth/refresh (once), stores the new pair, and retries the
 *    original request exactly once.
 *  - If refresh fails, clears tokens and emits a session-expired event so the
 *    app can bounce the user back to the auth gate.
 *  - Concurrent 401s share a single in-flight refresh (no refresh stampede).
 *
 * Public GET routes ignore the header, so it is always safe to route every
 * request through here.
 */
import { getTokens, setTokens, clearTokens } from "@/lib/tyre/auth-tokens";

export const SESSION_EXPIRED_EVENT = "tyre-session-expired";

let refreshInFlight: Promise<string | null> | null = null;

async function rotateRefreshToken(): Promise<string | null> {
  const tokens = getTokens();
  if (!tokens?.refreshToken) return null;

  // Coalesce parallel refreshes into one network call.
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const res = await fetch("/api/v1/auth/refresh", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ refreshToken: tokens.refreshToken }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json?.data?.accessToken) return null;
        setTokens({ accessToken: json.data.accessToken, refreshToken: json.data.refreshToken });
        return json.data.accessToken as string;
      } catch {
        return null;
      } finally {
        // Reset synchronously: callers that already awaited this promise keep
        // their shared result, but any 401 AFTER this settles starts a fresh
        // refresh (avoids reusing a stale token from a previous refresh).
        refreshInFlight = null;
      }
    })();
  }
  return refreshInFlight;
}

function withAuthHeader(init: RequestInit | undefined, token: string | null): RequestInit {
  const headers = new Headers(init?.headers);
  if (token) headers.set("authorization", `Bearer ${token}`);
  return { ...init, headers };
}

export async function authFetch(input: string, init?: RequestInit): Promise<Response> {
  const token = getTokens()?.accessToken ?? null;
  let res = await fetch(input, withAuthHeader(init, token));

  if (res.status !== 401 || !token) return res;

  // Access token likely expired — try one refresh + retry.
  const fresh = await rotateRefreshToken();
  if (!fresh) {
    clearTokens();
    if (typeof window !== "undefined") window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
    return res; // return the original 401 for the caller to surface
  }
  res = await fetch(input, withAuthHeader(init, fresh));
  return res;
}

/**
 * authJson — convenience wrapper: authFetch + JSON parse + the app's
 * `{ success, data, error }` envelope handling. Throws on !ok / success:false.
 */
export async function authJson<T = any>(input: string, init?: RequestInit): Promise<T> {
  const res = await authFetch(input, init);
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json?.success === false) {
    throw new Error(json?.error || `Request failed: ${res.status}`);
  }
  return (json.data ?? json) as T;
}
