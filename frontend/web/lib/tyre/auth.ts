"use client";

/**
 * useAuth — centralized authentication for the operator app.
 *
 * Wraps the real /api/v1/auth/{login,register,logout} endpoints, stores the
 * bearer/refresh tokens (auth-tokens.ts), and keeps the local display profile
 * (profile.ts) in sync. Components call login()/register()/logout(); the token
 * plumbing (attach header, refresh on 401) lives in auth-fetch.ts.
 */
import { useEffect, useState } from "react";
import { getTokens, setTokens, clearTokens, AUTH_EVENT } from "./auth-tokens";
import { saveProfile, clearProfile, type TyreRole } from "./profile";
import { SESSION_EXPIRED_EVENT } from "@/lib/api/auth-fetch";

// Map the onboarding role to the backend RBAC role.
const ROLE_MAP: Record<TyreRole, "driver" | "shipper" | "broker" | "fleet_manager" | "operator"> = {
  driver: "driver",
  fleet_owner: "fleet_manager",
  business: "shipper",
  traveller: "shipper",
};

export interface AuthUser {
  id: string;
  name: string;
  email: string | null;
  phone: string;
  role: string;
  org_id: string;
}

interface Credentials {
  email?: string;
  phone?: string;
  password: string;
}

interface RegisterInput extends Credentials {
  name: string;
  role: TyreRole;
}

async function postJson(url: string, body: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json?.success === false) {
    throw new Error(json?.error || `Request failed: ${res.status}`);
  }
  return json.data as { user: AuthUser; accessToken: string; refreshToken: string };
}

export async function login(creds: Credentials): Promise<AuthUser> {
  const data = await postJson("/api/v1/auth/login", {
    email: creds.email || undefined,
    phone: creds.phone || undefined,
    password: creds.password,
  });
  setTokens({ accessToken: data.accessToken, refreshToken: data.refreshToken });
  return data.user;
}

export async function register(input: RegisterInput): Promise<AuthUser> {
  const data = await postJson("/api/v1/auth/register", {
    name: input.name,
    role: ROLE_MAP[input.role] ?? "driver",
    email: input.email || undefined,
    phone: input.phone || undefined,
    password: input.password,
  });
  setTokens({ accessToken: data.accessToken, refreshToken: data.refreshToken });
  return data.user;
}

/** Revoke the server session (best-effort) and wipe all local auth state. */
export async function logout(): Promise<void> {
  const tokens = getTokens();
  if (tokens?.refreshToken) {
    try {
      await fetch("/api/v1/auth/logout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ refreshToken: tokens.refreshToken }),
      });
    } catch {
      // Best-effort — local wipe below is what actually logs the user out.
    }
  }
  clearTokens();
  clearProfile();
}

/** Reactive auth state for guarding UI and showing session status. */
export function useAuth(): { isAuthenticated: boolean; hydrated: boolean } {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const sync = () => setIsAuthenticated(getTokens() !== null);
    sync();
    setHydrated(true);
    const onExpired = () => {
      clearProfile();
      setIsAuthenticated(false);
    };
    window.addEventListener(AUTH_EVENT, sync);
    window.addEventListener("storage", sync);
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => {
      window.removeEventListener(AUTH_EVENT, sync);
      window.removeEventListener("storage", sync);
      window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
    };
  }, []);

  return { isAuthenticated, hydrated };
}

export { saveProfile };
