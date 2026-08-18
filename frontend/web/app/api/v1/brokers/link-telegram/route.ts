import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireInternalService } from "@tyre/auth";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/brokers/link-telegram — link a Telegram chat_id to a Broker row.
 *
 * Internal-service route (called by the AI gateway's broker bot when a broker
 * runs `/link BRK-CODE +91XXXXXXXXXX` in @tyrebrokerbot). Same shape as
 * /api/v1/consignee-confirmations — bearer-token gated via requireInternalService.
 *
 * Verification: (broker_code, broker_phone) must match a real Broker row.
 * This stops a random Telegram user from linking themselves to an arbitrary
 * broker just by knowing the broker code — they also need the phone number
 * on file. Week 2 will add an OTP challenge via the WhatsApp driver bot
 * (the same driver phone that's already on file gets a 6-digit code) as a
 * real second factor.
 *
 * On success, writes telegram_chat_id + telegram_username + telegram_linked_at
 * onto the Broker row and returns the broker record.
 */
export async function POST(req: NextRequest) {
  const denied = requireInternalService(req);
  if (denied) return denied;

  try {
    const body = await req.json();
    const { broker_code, broker_phone, telegram_chat_id, telegram_username } = body || {};

    if (!broker_code || !broker_phone || !telegram_chat_id) {
      return NextResponse.json(
        { success: false, error: "broker_code, broker_phone, and telegram_chat_id are required" },
        { status: 400 },
      );
    }
    if (typeof telegram_chat_id !== "string" || telegram_chat_id.length > 64) {
      return NextResponse.json(
        { success: false, error: "telegram_chat_id must be a string (max 64 chars)" },
        { status: 400 },
      );
    }

    // Verify broker_code + broker_phone match a real broker row.
    // Normalize phone for comparison (strip +91 prefix, keep last 10 digits).
    const normalizedPhone = broker_phone.replace(/[^\d]/g, "").slice(-10);
    const broker = await db.broker.findFirst({
      where: { brokerCode: broker_code },
    });

    if (!broker) {
      return NextResponse.json(
        { success: false, error: "broker_not_found", message: `No broker with code ${broker_code}` },
        { status: 404 },
      );
    }
    const brokerPhoneNormalized = broker.phone.replace(/[^\d]/g, "").slice(-10);
    if (brokerPhoneNormalized !== normalizedPhone) {
      return NextResponse.json(
        { success: false, error: "phone_mismatch", message: "Phone does not match broker on file" },
        { status: 403 },
      );
    }

    // Prevent one chat_id from being linked to two brokers — steal-check.
    const existing = await db.broker.findFirst({
      where: { telegramChatId: telegram_chat_id },
    });
    if (existing && existing.id !== broker.id) {
      return NextResponse.json(
        {
          success: false,
          error: "chat_already_linked",
          message: `Telegram chat ${telegram_chat_id} is already linked to broker ${existing.brokerCode}`,
        },
        { status: 409 },
      );
    }

    const updated = await db.broker.update({
      where: { id: broker.id },
      data: {
        telegramChatId: telegram_chat_id,
        telegramUsername: telegram_username || null,
        telegramLinkedAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        id: updated.id,
        broker_code: updated.brokerCode,
        name: updated.name,
        phone: updated.phone,
        region: updated.region,
        telegram_chat_id: updated.telegramChatId,
        telegram_username: updated.telegramUsername,
        telegram_linked_at: updated.telegramLinkedAt,
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Internal error";
    if (process.env.NODE_ENV !== "production") console.error("[brokers/link-telegram]", msg);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
