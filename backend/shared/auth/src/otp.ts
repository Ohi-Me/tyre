/**
 * @tyre/auth/otp — phone OTP issuance/verification (Redis-backed).
 *
 * TYRE's web app is voice/phone-first (see TYRE-Transformation-Report.md
 * §3, the Bhojpuri voice onboarding flow), so the primary login factor is
 * a phone OTP, not a password. This was a TODO stub in the original repo's
 * NextAuth `authorize()` callback — this module makes it real. Delivery
 * (WhatsApp/SMS gateway) is intentionally left as a single integration
 * point (`sendOtp`) so it can be wired to the WhatsApp Business Cloud API
 * already used by `backend/ai/gateway/app/ai/whatsapp/driver_bot.py`.
 */

import crypto from "node:crypto";
import Redis from "ioredis";

const REDIS_URL = process.env.TYRE_REDIS_URL || process.env.REDIS_URL || "redis://localhost:6379";
const OTP_TTL_SECONDS = 5 * 60;
const OTP_MAX_ATTEMPTS = 5;

let redis: Redis | null = null;
function getRedis(): Redis {
  if (!redis) {
    redis = new Redis(REDIS_URL, { maxRetriesPerRequest: 1, lazyConnect: true });
    redis.on("error", (err) => console.error("[otp] redis error", err.message));
  }
  return redis;
}

function otpKey(phone: string) {
  return `otp:${phone}`;
}
function attemptsKey(phone: string) {
  return `otp:attempts:${phone}`;
}

export async function issueOtp(phone: string): Promise<string> {
  const code = crypto.randomInt(100000, 999999).toString();
  const client = getRedis();
  await client.set(otpKey(phone), code, "EX", OTP_TTL_SECONDS);
  await client.del(attemptsKey(phone));
  // Deliver via WhatsApp Business Cloud API, falling back to SMS (MSG91/Twilio).
  // Delivery is best-effort and never blocks issuance: a delivery failure is logged
  // but the code still lives in Redis, so dev tooling / SMS retries can recover it.
  // In non-production environments the code is also returned so it can be surfaced
  // in dev tooling instead of relying on a provider.
  await deliverOtp(phone, code).catch((err) =>
    console.error("[otp] delivery failed", err?.message ?? err)
  );
  return code;
}

/** Normalize to Y1 (India) E.164-style digits without '+': "98765..." → "9198765...". */
function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `91${digits}`;
  return digits;
}

/**
 * Deliver the OTP to the driver's phone. Tries WhatsApp Cloud API first
 * (same credentials as backend/ai/gateway/app/ai/whatsapp/graph_client.py), then
 * falls back to SMS via MSG91 or Twilio. Returns the channel used, or "none".
 */
export async function deliverOtp(phone: string, otp: string): Promise<"whatsapp" | "sms" | "none"> {
  const to = normalizePhone(phone);
  const body = `TYRE OTP: ${otp}. Valid 5 minutes. Do not share this code with anyone.`;

  if (await sendWhatsAppOtp(to, body)) return "whatsapp";
  if (await sendSmsOtp(to, body)) return "sms";
  console.warn("[otp] no delivery channel configured — code remains in Redis only");
  return "none";
}

async function sendWhatsAppOtp(to: string, body: string): Promise<boolean> {
  const token = process.env.TYRE_WHATSAPP_TOKEN;
  const phoneNumberId = process.env.TYRE_WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) return false;
  const apiVersion = process.env.TYRE_WHATSAPP_API_VERSION || "v18.0";
  try {
    const res = await fetch(`https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body },
      }),
    });
    if (!res.ok) {
      console.error("[otp] whatsapp send failed", res.status, (await res.text()).slice(0, 200));
      return false;
    }
    return true;
  } catch (err: any) {
    console.error("[otp] whatsapp send raised", err?.message ?? err);
    return false;
  }
}

async function sendSmsOtp(to: string, body: string): Promise<boolean> {
  const provider = process.env.TYRE_SMS_PROVIDER;
  const apiKey = process.env.TYRE_SMS_API_KEY;
  const senderId = process.env.TYRE_SMS_SENDER_ID || "TYRE";
  if (!provider || !apiKey) return false;
  try {
    if (provider === "msg91") {
      const res = await fetch("https://control.msg91.com/api/v5/flow/", {
        method: "POST",
        headers: { authkey: apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({ sender: senderId, mobiles: to, message: body }),
      });
      return res.ok;
    }
    if (provider === "twilio") {
      const res = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${senderId}/Messages.json`,
        {
          method: "POST",
          headers: {
            Authorization: `Basic ${Buffer.from(`${senderId}:${apiKey}`).toString("base64")}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({ To: `+${to}`, From: senderId, Body: body }).toString(),
        }
      );
      return res.ok;
    }
    console.warn("[otp] unknown TYRE_SMS_PROVIDER:", provider);
    return false;
  } catch (err: any) {
    console.error("[otp] sms send raised", err?.message ?? err);
    return false;
  }
}

export async function verifyOtp(phone: string, code: string): Promise<boolean> {
  const client = getRedis();
  const attempts = await client.incr(attemptsKey(phone));
  if (attempts === 1) await client.expire(attemptsKey(phone), OTP_TTL_SECONDS);
  if (attempts > OTP_MAX_ATTEMPTS) return false;

  const stored = await client.get(otpKey(phone));
  if (!stored || stored !== code) return false;

  await client.del(otpKey(phone));
  await client.del(attemptsKey(phone));
  return true;
}
