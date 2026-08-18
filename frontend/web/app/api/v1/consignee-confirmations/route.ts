import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireInternalService } from "@tyre/auth";

export const dynamic = "force-dynamic";

/**
 * Consignee confirmations — TYRE v1.1 item #5.
 *
 * `backend/ai/gateway/.../verification/consignee_confirm.py` used to return a
 * `confirmation_id` that was never written to Postgres, so the balance-release
 * trigger (`UpiEscrowTransaction.triggerRef` with trigger=CONSIGNEE_CONFIRM) had a
 * null reference and the audit trail was broken. These routes persist a real
 * `ConsigneeConfirmation` row at send-time and let the confirm/reject flow update it.
 *
 * Same internal-service bearer auth as /api/v1/escrow/events.
 *
 *   POST  — create a PENDING confirmation row (called from send_confirmation_request)
 *   GET    ?link=<confirmationLink>  — fetch a row (used by process_confirmation + the
 *           consignee-facing confirm page)
 *   PATCH  — update status to CONFIRMED|REJECTED|EXPIRED, optionally mark payment released
 */

export async function POST(req: NextRequest) {
  const denied = requireInternalService(req);
  if (denied) return denied;

  try {
    const body = await req.json();
    const {
      trip_id,
      load_id,
      consignee_name,
      consignee_phone,
      consignee_locale,
      whatsapp_message_id,
      confirmation_link,
      driver_photo_url,
      driver_gps_lat,
      driver_gps_lng,
      delivery_timestamp,
      expires_at,
    } = body;

    if (!trip_id || !load_id || !confirmation_link) {
      return NextResponse.json(
        { success: false, error: "trip_id, load_id and confirmation_link are required" },
        { status: 400 }
      );
    }

    const expiresAt = expires_at
      ? new Date(typeof expires_at === "number" ? expires_at * 1000 : expires_at)
      : new Date(Date.now() + 24 * 3600 * 1000);

    const row = await db.consigneeConfirmation.create({
      data: {
        tripId: trip_id,
        loadId: load_id,
        consigneeName: consignee_name ?? "",
        consigneePhone: consignee_phone ?? "",
        consigneeLocale: consignee_locale ?? "hi",
        whatsappMessageId: whatsapp_message_id ?? null,
        confirmationLink: confirmation_link,
        confirmationStatus: "PENDING",
        driverPhotoUrl: driver_photo_url ?? null,
        driverGpsLat: driver_gps_lat ?? null,
        driverGpsLng: driver_gps_lng ?? null,
        deliveryTimestamp: delivery_timestamp ? new Date(delivery_timestamp) : null,
        expiresAt,
      },
    });

    return NextResponse.json({ success: true, data: { id: row.id, status: row.confirmationStatus } });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Internal error";
    if (process.env.NODE_ENV !== "production") console.error("[consignee-confirmations]", msg);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const denied = requireInternalService(req);
  if (denied) return denied;

  const link = req.nextUrl.searchParams.get("link");
  if (!link) {
    return NextResponse.json({ success: false, error: "link query param required" }, { status: 400 });
  }
  const row = await db.consigneeConfirmation.findFirst({ where: { confirmationLink: link } });
  if (!row) {
    return NextResponse.json({ success: false, error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ success: true, data: row });
}

export async function PATCH(req: NextRequest) {
  const denied = requireInternalService(req);
  if (denied) return denied;

  try {
    const body = await req.json();
    const { confirmation_link, status, payment_released } = body;
    if (!confirmation_link || !status) {
      return NextResponse.json(
        { success: false, error: "confirmation_link and status are required" },
        { status: 400 }
      );
    }

    const existing = await db.consigneeConfirmation.findFirst({
      where: { confirmationLink: confirmation_link },
    });
    if (!existing) {
      return NextResponse.json({ success: false, error: "not_found" }, { status: 404 });
    }

    const row = await db.consigneeConfirmation.update({
      where: { id: existing.id },
      data: {
        confirmationStatus: status,
        confirmedAt: status === "CONFIRMED" ? new Date() : existing.confirmedAt,
        paymentReleased: payment_released === true ? true : existing.paymentReleased,
        paymentReleasedAt:
          payment_released === true ? new Date() : existing.paymentReleasedAt,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        id: row.id,
        trip_id: row.tripId,
        load_id: row.loadId,
        status: row.confirmationStatus,
        consignee_phone: row.consigneePhone,
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Internal error";
    if (process.env.NODE_ENV !== "production") console.error("[consignee-confirmations]", msg);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
