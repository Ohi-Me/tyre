import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";

export const dynamic = "force-dynamic";

/**
 * WhatsApp inbound webhook — TYRE v1.1 item #7.
 *
 * Meta requires a GET challenge handshake (hub.mode/hub.verify_token/hub.challenge)
 * before it will deliver any webhook events. Without this route, inbound driver
 * messages ("load chahiye") never reach backend/ai/gateway's driver_bot.py.
 *
 * FE-C7 fix: the POST handler now verifies the X-Hub-Signature-256 HMAC header
 * against the raw request body before forwarding to the ai-gateway. Previously
 * it accepted any JSON and forwarded it — an attacker could POST a forged
 * inbound message ("release the held balance for trip X") and trigger
 * downstream agent actions.
 *
 * The POST handler proxies verified inbound events to the ai-gateway, which
 * runs the WhatsApp driver bot. We do not block on the ai-gateway: Meta retries
 * failed deliveries, but it also expects a fast 200, so we respond 200
 * immediately and let the gateway process asynchronously.
 */

const VERIFY_TOKEN = process.env.TYRE_WHATSAPP_VERIFY_TOKEN || "";
const APP_SECRET = process.env.TYRE_WHATSAPP_APP_SECRET || "";

/**
 * Verify the X-Hub-Signature-256 header against the raw request body.
 * Returns true if the signature matches; false otherwise.
 * Uses crypto.timingSafeEqual to prevent timing attacks.
 */
function verifySignature(rawBody: string, signature: string): boolean {
  if (!APP_SECRET) {
    if (process.env.NODE_ENV === "production") {
      console.error("[whatsapp-webhook] TYRE_WHATSAPP_APP_SECRET not set — rejecting all webhooks in production");
      return false;
    }
    console.warn("[whatsapp-webhook] TYRE_WHATSAPP_APP_SECRET not set — accepting unverified webhook (dev only)");
    return true;
  }
  if (!signature || !signature.startsWith("sha256=")) {
    return false;
  }
  const expected = "sha256=" + crypto
    .createHmac("sha256", APP_SECRET)
    .update(rawBody, "utf8")
    .digest("hex");
  if (signature.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

// Meta webhook verification handshake
export async function GET(req: NextRequest) {
  const mode = req.nextUrl.searchParams.get("hub.mode");
  const token = req.nextUrl.searchParams.get("hub.verify_token");
  const challenge = req.nextUrl.searchParams.get("hub.challenge");

  if (mode === "subscribe" && VERIFY_TOKEN && token === VERIFY_TOKEN) {
    return new NextResponse(challenge ?? "", {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

// Inbound message delivery — proxy to ai-gateway's WhatsApp webhook handler.
export async function POST(req: NextRequest) {
  // FE-C7: read raw body for signature verification (cannot verify after .json())
  const rawBody = await req.text();
  const signature = req.headers.get("x-hub-signature-256") || "";

  if (!verifySignature(rawBody, signature)) {
    console.warn("[whatsapp-webhook] rejected invalid signature");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    console.warn("[whatsapp-webhook] invalid JSON body");
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const gatewayUrl = process.env.AI_GATEWAY_URL;
  const internalToken = process.env.TYRE_INTERNAL_SERVICE_TOKEN;

  if (gatewayUrl) {
    // SH-C4 fix: include Authorization header so the gateway's auth middleware accepts the call
    fetch(`${gatewayUrl}/wedge/whatsapp/webhook`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(internalToken ? { Authorization: `Bearer ${internalToken}` } : {}),
      },
      body: JSON.stringify(body),
    }).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[whatsapp-webhook] gateway forward failed", msg);
    });
  } else {
    console.warn("[whatsapp-webhook] AI_GATEWAY_URL not set — inbound message dropped");
  }

  return NextResponse.json({ received: true });
}
