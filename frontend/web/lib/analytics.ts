/**
 * Product analytics — PostHog (TYRE v1.1 item #8).
 *
 * Captures the PMF-critical events the architecture flags as P0:
 *   - advance_release_latency  — the 60s PMF signal
 *   - load_accept_to_advance   — the accept → advance-received funnel
 *   - whatsapp_send            — WhatsApp/SMS delivery success/failure rate
 *
 * FE-C5 fix: previously used `require("posthog-node")` in an ESM codebase
 * (`"type": "module"` in package.json), which is undefined at runtime and was
 * silently swallowed by the catch — analytics was never captured. Now uses
 * dynamic `await import()` and adds `posthog-node` to dependencies.
 */

type PostHogClient = {
  capture: (args: { distinctId: string; event: string; properties?: Record<string, unknown> }) => void;
  shutdown?: () => Promise<void> | void;
};

let client: PostHogClient | null | undefined;
let clientInitPromise: Promise<PostHogClient | null> | undefined;

async function getClientAsync(): Promise<PostHogClient | null> {
  if (client !== undefined) return client;
  if (clientInitPromise) return clientInitPromise;

  clientInitPromise = (async () => {
    const key = process.env.POSTHOG_API_KEY;
    if (!key) {
      client = null;
      return null;
    }
    try {
      const mod = await import("posthog-node");
      const PostHog = mod.PostHog ?? (mod as any).default?.PostHog;
      if (!PostHog) throw new Error("posthog-node did not export PostHog");
      client = new PostHog(key, {
        host: process.env.POSTHOG_HOST || "https://app.posthog.com",
        flushAt: 1,
        flushInterval: 0,
      }) as PostHogClient;
      return client;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (process.env.NODE_ENV !== "production") {
        console.warn("[analytics] posthog-node unavailable — analytics disabled:", msg);
      }
      client = null;
      return null;
    }
  })();

  return clientInitPromise;
}

export async function capture(
  distinctId: string,
  event: string,
  properties?: Record<string, unknown>
): Promise<void> {
  const ph = await getClientAsync();
  if (!ph) return;
  try {
    ph.capture({ distinctId, event, properties });
  } catch (err: unknown) {
    if (process.env.NODE_ENV !== "production") {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn("[analytics] capture failed:", msg);
    }
  }
}

/** The 60-second PMF signal: how long from load acceptance to advance hitting UPI. */
export function trackAdvanceReleaseLatency(
  driverPhone: string,
  loadId: string,
  latencyMs: number,
  simulated: boolean
): void {
  // FE-C5: fire-and-forget — capture is async but we don't block the caller
  void capture(driverPhone, "advance_release_latency", {
    load_id: loadId,
    latency_ms: latencyMs,
    under_60s: latencyMs <= 60_000,
    simulated,
  });
}

/** Funnel: load accepted → advance received. */
export function trackLoadAcceptToAdvance(
  driverPhone: string,
  loadId: string,
  stage: "accepted" | "advance_received"
): void {
  void capture(driverPhone, "load_accept_to_advance", { load_id: loadId, stage });
}

/** WhatsApp/SMS delivery outcome. */
export function trackWhatsAppSend(
  toPhone: string,
  channel: "whatsapp" | "sms" | "none",
  success: boolean,
  context?: string
): void {
  void capture(toPhone, "whatsapp_send", { channel, success, context });
}

// FE-C5: callers of the track* helpers are sync (route handlers). Since capture is
// now async (dynamic import), we fire-and-forget here. Errors are caught inside capture.
// These wrappers remain sync for backwards compatibility with existing call sites.
