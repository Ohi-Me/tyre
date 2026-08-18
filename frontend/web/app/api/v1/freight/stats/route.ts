import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { FREIGHT_BOOKING_FEE_INR, internalError } from "@/lib/freight/server";

export const dynamic = "force-dynamic";

// GET /api/v1/freight/stats — marketplace-wide aggregates for the
// dashboard + analytics views. Public (no per-user data).
export async function GET() {
  try {
    const since7d = new Date(Date.now() - 7 * 86400_000);

    const [
      totalListings,
      activeListings,
      bookedListings,
      totalBookings,
      pendingBookings,
      acceptedBookings,
      completedBookings,
      cancelledBookings,
      feeAgg,
      recentBookings,
      byVehicleType,
      bookingsLast7d,
    ] = await Promise.all([
      db.freightListing.count({ where: { deletedAt: null } }),
      db.freightListing.count({ where: { deletedAt: null, status: "ACTIVE" } }),
      db.freightListing.count({ where: { deletedAt: null, status: "BOOKED" } }),
      db.freightBooking.count(),
      db.freightBooking.count({ where: { status: "PENDING" } }),
      db.freightBooking.count({ where: { status: "ACCEPTED" } }),
      db.freightBooking.count({ where: { status: "COMPLETED" } }),
      db.freightBooking.count({ where: { status: "CANCELLED" } }),
      db.freightPayoutEntry.aggregate({ _sum: { amount: true } }),
      db.freightBooking.findMany({
        include: { listing: true },
        orderBy: { createdAt: "desc" },
        take: 6,
      }),
      db.freightListing.groupBy({
        by: ["vehicleType"],
        where: { deletedAt: null },
        _count: { _all: true },
      }),
      db.freightBooking.findMany({
        where: { createdAt: { gte: since7d } },
        select: { createdAt: true, status: true },
      }),
    ]);

    // Net platform revenue from booking fees (fees minus refunds, positive number).
    const netFeeRevenue = -(feeAgg._sum.amount ?? 0);

    // Bookings per day for the last 7 days (fills empty days with 0).
    const perDay: { date: string; bookings: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400_000);
      const key = d.toISOString().slice(0, 10);
      perDay.push({
        date: key,
        bookings: bookingsLast7d.filter((b) => b.createdAt.toISOString().slice(0, 10) === key).length,
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        fee_inr: FREIGHT_BOOKING_FEE_INR,
        listings: {
          total: totalListings,
          active: activeListings,
          booked: bookedListings,
          by_vehicle_type: byVehicleType.map((v) => ({
            vehicle_type: v.vehicleType,
            count: v._count._all,
          })),
        },
        bookings: {
          total: totalBookings,
          pending: pendingBookings,
          accepted: acceptedBookings,
          completed: completedBookings,
          cancelled: cancelledBookings,
          per_day: perDay,
        },
        fees: {
          net_revenue: netFeeRevenue,
          charged_count: Math.round((netFeeRevenue / FREIGHT_BOOKING_FEE_INR) || 0),
        },
        recent: recentBookings.map((b) => ({
          id: b.id,
          listing_code: b.listing.code,
          vehicle_number: b.listing.vehicleNumber,
          booker_name: b.bookerName,
          status: b.status,
          created_at: b.createdAt.toISOString(),
        })),
      },
    });
  } catch (e) {
    return internalError("freight:stats", e);
  }
}
