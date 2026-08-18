import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";
import { LOCALES } from "@tyre/i18n";

// --- API Auth Logic ---
const PUBLIC_PREFIXES = [
  "/api/v1/auth/",
  "/api/v1/health",
  "/api/v1/landing/",
  "/api/v1/languages",
  "/api/v1/leads",
  "/api/v1/subscribe",
  "/api/v1/webhooks/",
] as const;

const INSECURE_FALLBACK_SECRET = "dev-insecure-secret-change-me";

function accessSecret(): string | null {
  const secret =
    process.env.TYRE_JWT_ACCESS_SECRET || process.env.NEXTAUTH_SECRET || INSECURE_FALLBACK_SECRET;
  if (secret === INSECURE_FALLBACK_SECRET) {
    const env = process.env.NODE_ENV;
    if (env !== "development" && env !== "test") return null;
  }
  return secret;
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function deny(error: string, status: number): NextResponse {
  return NextResponse.json(
    { success: false, error },
    { status, headers: { "www-authenticate": 'Bearer realm="api"' } },
  );
}

async function handleApiAuth(req: NextRequest): Promise<NextResponse | null> {
  const { pathname } = req.nextUrl;

  if (PUBLIC_PREFIXES.some((p) => (p.endsWith("/") ? pathname.startsWith(p) : pathname === p))) {
    return null; // continue
  }

  if (process.env.TYRE_STANDALONE === "1") {
    return null; // Bypass auth for demo/standalone mode
  }

  const header = req.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) {
    return deny("Authentication required", 401);
  }

  const internalToken = process.env.TYRE_INTERNAL_SERVICE_TOKEN || "";
  if (internalToken && constantTimeEqual(token, internalToken)) {
    return null; // continue
  }

  const secret = accessSecret();
  if (!secret) {
    return deny(
      "Authentication misconfigured: TYRE_JWT_ACCESS_SECRET (or NEXTAUTH_SECRET) must be set outside development/test",
      503,
    );
  }

  try {
    await jwtVerify(token, new TextEncoder().encode(secret), { algorithms: ["HS256"] });
  } catch {
    return deny("Invalid or expired token", 401);
  }

  return null; // continue
}

// --- Next-Intl Locale Logic ---
const intlMiddleware = createMiddleware(routing);

export default async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 1. If it's an API route, do auth
  if (pathname.startsWith("/api/v1/")) {
    const apiResponse = await handleApiAuth(req);
    if (apiResponse) return apiResponse;
    return NextResponse.next();
  }

  // 2. Otherwise run Next-Intl (which only processes app/page routes as per the matcher)
  const res = intlMiddleware(req);
  
  // Add hreflang alternates for SEO
  const url = req.nextUrl.clone();
  const pathWithoutLocale = url.pathname.replace(/^\/[a-z-]+(\/|$)/, "/");
  const alternates = LOCALES.map(
    (l) => `<${url.origin}/${l}${pathWithoutLocale}>; hreflang="${l}"`
  ).join(", ");
  res.headers.set("Link", alternates);
  return res;
}

export const config = {
  // Match both /api/v1/* and UI routes.
  // We exclude standard Next.js system paths like _next, _vercel, etc.
  matcher: ["/((?!_next|_vercel|.*\\..*).*)"],
};
