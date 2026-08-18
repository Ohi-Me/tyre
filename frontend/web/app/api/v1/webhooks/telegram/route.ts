import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";

export const dynamic = "force-dynamic";

/**
 * Telegram inbound webhook — Week 1 of the WhatsApp↔Telegram bridge.
 *
 * Telegram's webhook model is simpler than Meta's:
 *  - No GET challenge handshake. You register the webhook with a POST to
 *    /bot<token>/setWebhook (done from the deploy runbook — see bot_client.set_webhook),
 *    and from then on Telegram POSTs every Update here.
 *  - Auth is a single shared secret in the `X-Telegram-Bot-Api-Secret-Token`
 *    header, set when you call setWebhook. No HMAC body computation needed.
 *  - The body is a single Update object (not a batch like Meta's entry[].changes[]
 *    envelope), so no flattening is needed at the BFF layer.
 *
 * This BFF route verifies the secret header, then forwards the raw JSON to
 * the AI gateway's /wedge/telegram/webhook handler (which runs the broker bot
 * and sends the reply via the bot client). We respond 200 immediately and
 * let the gateway process asynchronously — Telegram retries failed deliveries
 * but expects a fast 200, same pattern as the WhatsApp webhook.
 */

const SECRET_TOKEN = process.env.TYRE_TELEGRAM_WEBHOOK_SECRET || "";

/**
 * Verify the X-Telegram-Bot-Api-Secret-Token header.
 * Telegram allows the secret to be 1-256 chars of [A-Za-z0-9_-]; we compare
 * with crypto.timingSafeEqual to prevent timing attacks.
 */
function verifySecret(provided: string): boolean {
  if (!SECRET_TOKEN) {
    if (process.env.NODE_ENV === "production") {
      console.error(
        "[telegram-webhook] TYRE_TELEGRAM_WEBHOOK_SECRET not set — rejecting all webhooks in production",
      );
      return false;
    }
    console.warn(
      "[telegram-webhook] TYRE_TELEGRAM_WEBHOOK_SECRET not set — accepting unverified webhook (dev only)",
    );
    return true;
  }
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(SECRET_TOKEN);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// Inbound Telegram Update — verify secret, then forward to ai-gateway.
export async function POST(req: NextRequest) {
  const providedSecret = req.headers.get("x-telegram-bot-api-secret-token") || "";
  if (!verifySecret(providedSecret)) {
    console.warn("[telegram-webhook] rejected invalid secret_token");
    return NextResponse.json({ error: "Invalid secret_token" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    console.warn("[telegram-webhook] invalid JSON body");
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const gatewayUrl = process.env.AI_GATEWAY_URL;
  const internalToken = process.env.TYRE_INTERNAL_SERVICE_TOKEN;

  if (gatewayUrl) {
    // Fire-and-forget — Telegram expects a fast 200 and retries on slow responses.
    // Same pattern as the WhatsApp webhook forward.
    fetch(`${gatewayUrl}/wedge/telegram/webhook`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Pass the secret_token through so the gateway can re-verify it (defence
        // in depth: even if someone can hit /wedge/telegram/webhook directly,
        // they still need the secret). The gateway's InternalAuthMiddleware
        // also accepts this path as exempt from bearer auth when the secret matches.
        "X-Telegram-Bot-Api-Secret-Token": providedSecret,
        ...(internalToken ? { Authorization: `Bearer ${internalToken}` } : {}),
      },
      body: JSON.stringify(body),
    }).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[telegram-webhook] gateway forward failed", msg);
    });
  } else {
    console.warn("[telegram-webhook] AI_GATEWAY_URL not set — inbound update dropped");
  }

  return NextResponse.json({ received: true });
}

// Telegram doesn't require a GET handshake, but we respond to it for health
// checks (e.g. uptime monitors pinging the webhook URL).
export async function GET() {
  return NextResponse.json({ ok: true, service: "tyre-telegram-webhook" });
}
