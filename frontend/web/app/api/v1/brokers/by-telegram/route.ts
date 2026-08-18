import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireInternalService } from "@tyre/auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/brokers/by-telegram?chat_id=<telegram_chat_id>
 *
 * Look up the broker linked to a Telegram chat_id. Returns 404 (not an error)
 * when no broker is linked so the broker bot can prompt the user to run /link.
 *
 * Internal-service route — called by the AI gateway on every inbound Telegram
 * message to decide whether the sender is a known broker.
 */
export async function GET(req: NextRequest) {
  const denied = requireInternalService(req);
  if (denied) return denied;

  const chat_id = req.nextUrl.searchParams.get("chat_id");
  if (!chat_id) {
    return NextResponse.json(
      { success: false, error: "chat_id query param is required" },
      { status: 400 },
    );
  }

  const broker = await db.broker.findFirst({
    where: { telegramChatId: chat_id },
    select: {
      id: true,
      brokerCode: true,
      name: true,
      phone: true,
      region: true,
      city: true,
      riskScore: true,
      verified: true,
      telegramChatId: true,
      telegramUsername: true,
      telegramLinkedAt: true,
    },
  });

  if (!broker) {
    return NextResponse.json(
      { success: false, error: "not_linked", message: "No broker linked to this Telegram chat" },
      { status: 404 },
    );
  }

  return NextResponse.json({
    success: true,
    data: {
      id: broker.id,
      broker_code: broker.brokerCode,
      name: broker.name,
      phone: broker.phone,
      region: broker.region,
      city: broker.city,
      risk_score: broker.riskScore,
      verified: broker.verified,
      telegram_chat_id: broker.telegramChatId,
      telegram_username: broker.telegramUsername,
      telegram_linked_at: broker.telegramLinkedAt,
    },
  });
}
