import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireInternalService } from "@tyre/auth";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/brokers/unlink-telegram — clear telegram_chat_id on any Broker
 * row that has it. Idempotent — returns success even if no row was linked.
 *
 * Used by the broker bot's `/unlink` command (e.g. when a broker switches
 * phones or wants to stop notifications).
 */
export async function POST(req: NextRequest) {
  const denied = requireInternalService(req);
  if (denied) return denied;

  try {
    const body = await req.json();
    const { telegram_chat_id } = body || {};
    if (!telegram_chat_id || typeof telegram_chat_id !== "string") {
      return NextResponse.json(
        { success: false, error: "telegram_chat_id is required" },
        { status: 400 },
      );
    }

    // Clear on every broker that has this chat_id (should be at most 1 due
    // to the unique constraint, but updateMany is safe either way).
    const result = await db.broker.updateMany({
      where: { telegramChatId: telegram_chat_id },
      data: {
        telegramChatId: null,
        telegramUsername: null,
        telegramLinkedAt: null,
      },
    });

    return NextResponse.json({
      success: true,
      data: { cleared: result.count },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Internal error";
    if (process.env.NODE_ENV !== "production") console.error("[brokers/unlink-telegram]", msg);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
