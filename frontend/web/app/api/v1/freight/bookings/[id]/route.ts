import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { rateLimitOrNull } from "@tyre/auth";
import { clientIp } from "@/lib/http";
import { capture } from "@/lib/analytics";
import {
  FREIGHT_BOOKING_FEE_INR,
  requireActor,
  serializeBooking,
  internalError,
} from "@/lib/freight/server";

export const dynamic = "force-dynamic";

const ActionSchema = z.object({
  action: z.enum(["accept", "reject", "cancel", "complete"]),
});

/**
 * PATCH /api/v1/freight/bookings/[id]  { action }
 *
 * State machine + money rules (all inside one DB transaction):
 *   accept   (lister only, PENDING → ACCEPTED)
 *            → debit ₹49 BOOKING_FEE from the lister's payout ledger,
 *              mark listing BOOKED, auto-reject other PENDING requests.
 *   reject   (lister only, PENDING → REJECTED). No money moves.
 *   cancel   (lister or booker, PENDING/ACCEPTED → CANCELLED)
 *            → if the ₹49 fee was charged, credit a BOOKING_FEE_REFUND;
 *              listing returns to ACTIVE.
 *   complete (lister only, ACCEPTED → COMPLETED). Fee stays charged;
 *            listing returns to ACTIVE.
 */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const limited = await rateLimitOrNull("standard", clientIp(req));
  if (limited) return NextResponse.json(limited.body, { status: limited.status });
  const { actor, response } = requireActor(req);
  if (response) return response;

  try {
    const { id } = await ctx.params;
    const body = await req.json();
    const parsed = ActionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: "Invalid action" }, { status: 400 });
    }
    const { action } = parsed.data;

    const booking = await db.freightBooking.findUnique({
      where: { id },
      include: { listing: true },
    });
    if (!booking) {
      return NextResponse.json({ success: false, error: "Booking not found" }, { status: 404 });
    }

    const isLister = booking.listing.ownerId === actor;
    const isBooker = booking.bookerId === actor;
    if (!isLister && !isBooker) {
      return NextResponse.json({ success: false, error: "Not your booking" }, { status: 403 });
    }

    const fail = (msg: string, status = 409) =>
      NextResponse.json({ success: false, error: msg }, { status });

    let updated;

    if (action === "accept") {
      if (!isLister) return fail("Only the lister can accept a booking", 403);
      if (booking.status !== "PENDING") return fail(`Cannot accept a ${booking.status.toLowerCase()} booking`);

      updated = await db.$transaction(async (tx) => {
        const b = await tx.freightBooking.update({
          where: { id: booking.id, status: "PENDING" }, // status guard vs. concurrent action
          data: { status: "ACCEPTED", feeCharged: true, acceptedAt: new Date() },
          include: { listing: true },
        });
        // ₹49 platform fee — immutable ledger row, negative amount.
        await tx.freightPayoutEntry.create({
          data: {
            ownerId: booking.listing.ownerId,
            listingId: booking.listingId,
            bookingId: booking.id,
            type: "BOOKING_FEE",
            amount: -FREIGHT_BOOKING_FEE_INR,
            note: `Booking fee — ${booking.bookerName} on ${booking.listing.code}`,
          },
        });
        await tx.freightListing.update({
          where: { id: booking.listingId },
          data: { status: "BOOKED" },
        });
        // A vehicle can serve one accepted booking at a time.
        await tx.freightBooking.updateMany({
          where: { listingId: booking.listingId, status: "PENDING", id: { not: booking.id } },
          data: { status: "REJECTED" },
        });
        return b;
      });

      void capture(actor!, "freight_booking_accepted", {
        booking_id: booking.id,
        listing_id: booking.listingId,
        fee_inr: FREIGHT_BOOKING_FEE_INR,
      });
    } else if (action === "reject") {
      if (!isLister) return fail("Only the lister can reject a booking", 403);
      if (booking.status !== "PENDING") return fail(`Cannot reject a ${booking.status.toLowerCase()} booking`);

      updated = await db.freightBooking.update({
        where: { id: booking.id },
        data: { status: "REJECTED" },
        include: { listing: true },
      });
      void capture(actor!, "freight_booking_rejected", { booking_id: booking.id });
    } else if (action === "cancel") {
      if (!["PENDING", "ACCEPTED"].includes(booking.status)) {
        return fail(`Cannot cancel a ${booking.status.toLowerCase()} booking`);
      }

      updated = await db.$transaction(async (tx) => {
        const b = await tx.freightBooking.update({
          where: { id: booking.id },
          data: { status: "CANCELLED", cancelledAt: new Date(), feeCharged: false },
          include: { listing: true },
        });
        // Automatic ₹49 refund — only if the acceptance fee was actually charged.
        if (booking.status === "ACCEPTED" && booking.feeCharged) {
          await tx.freightPayoutEntry.create({
            data: {
              ownerId: booking.listing.ownerId,
              listingId: booking.listingId,
              bookingId: booking.id,
              type: "BOOKING_FEE_REFUND",
              amount: FREIGHT_BOOKING_FEE_INR,
              note: `Booking cancelled — fee refunded (${booking.listing.code})`,
            },
          });
        }
        if (booking.status === "ACCEPTED") {
          await tx.freightListing.update({
            where: { id: booking.listingId },
            data: { status: "ACTIVE" },
          });
        }
        return b;
      });

      void capture(actor!, "freight_booking_cancelled", {
        booking_id: booking.id,
        refunded: booking.status === "ACCEPTED" && booking.feeCharged,
        refund_inr: booking.status === "ACCEPTED" && booking.feeCharged ? FREIGHT_BOOKING_FEE_INR : 0,
      });
    } else {
      // complete
      if (!isLister) return fail("Only the lister can mark a booking complete", 403);
      if (booking.status !== "ACCEPTED") return fail(`Cannot complete a ${booking.status.toLowerCase()} booking`);

      updated = await db.$transaction(async (tx) => {
        const b = await tx.freightBooking.update({
          where: { id: booking.id },
          data: { status: "COMPLETED" },
          include: { listing: true },
        });
        await tx.freightListing.update({
          where: { id: booking.listingId },
          data: { status: "ACTIVE" },
        });
        return b;
      });
      void capture(actor!, "freight_booking_completed", { booking_id: booking.id });
    }

    return NextResponse.json({ success: true, data: serializeBooking(updated, actor) });
  } catch (e) {
    return internalError("freight:booking-action", e);
  }
}
