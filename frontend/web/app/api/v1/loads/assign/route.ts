import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole, rateLimitOrNull, recordAudit } from "@tyre/auth";
import { aiClient } from "@tyre/ai-client";
import { clientIp } from "@/lib/http";
import { notify } from "@/lib/notifications/notify";

export const dynamic = "force-dynamic";


// POST /api/v1/loads/assign — assign a truck to a load (creates a Trip + releases UPI advance)
//
// Phase 0 fix (docs/ARCHITECTURE.md §3, steps 7-8 / exit gate): this route used to write
// a cosmetic AgentLog row claiming "UPI advance released" with no money movement behind
// it. It now: (1) requires operator/admin role — RBAC was previously unenforced on the
// single highest-value write route in the system; (2) rate-limits per the "standard"
// tier; (3) calls the real (sandbox) escrow fund + advance-release flow via the
// ai-gateway, which persists UpiEscrowAccount/UpiEscrowTransaction rows.
export async function POST(req: NextRequest) {
  const limited = await rateLimitOrNull("standard", clientIp(req));
  if (limited) return NextResponse.json(limited.body, { status: limited.status });

  const { user, response } = requireRole(req, "loads:assign");
  if (response) return response;

  try {
    const { load_id, truck_id, driver_phone } = await req.json();
    if (!load_id || !truck_id) {
      return NextResponse.json({ success: false, error: "load_id and truck_id required" }, { status: 400 });
    }

    const load = await db.load.findUnique({ where: { id: load_id }, include: { broker: true } });
    const truck = await db.truck.findUnique({ where: { id: truck_id }, include: { driver: true } });
    if (!load || !truck) {
      return NextResponse.json({ success: false, error: "Load or truck not found" }, { status: 404 });
    }
    if (load.status === "ASSIGNED" || load.status === "IN_TRANSIT") {
      return NextResponse.json({ success: false, error: `Load already ${load.status}` }, { status: 400 });
    }
    if (truck.status === "MAINTENANCE") {
      return NextResponse.json({ success: false, error: "Truck under maintenance" }, { status: 400 });
    }

    // C2 (audit): atomically CLAIM the load before anything that moves money.
    // The status pre-check above is advisory only — two concurrent assigns can both
    // read status "OPEN", both fall through, and each create a Trip + release a UPI
    // advance for the SAME load (double booking + double payout). This conditional
    // updateMany is the real guard: exactly one concurrent caller gets count === 1;
    // the loser gets a 409 and never reaches the escrow/advance call below. A slow
    // client that times out and retries is equally safe — the retry loses the claim.
    const claim = await db.load.updateMany({
      where: { id: load_id, status: { notIn: ["ASSIGNED", "IN_TRANSIT"] } },
      data: { status: "ASSIGNED", assignedTruckId: truck_id },
    });
    if (claim.count !== 1) {
      return NextResponse.json(
        { success: false, error: "Load was just assigned by a concurrent request" },
        { status: 409 },
      );
    }

    // The load is now ours. Create the Trip and move the truck to LOADING together.
    const [trip] = await db.$transaction([
      db.trip.create({
        data: {
          orgId: load.orgId,
          loadId: load_id,
          truckId: truck_id,
          status: "PLANNED",
        },
        include: { truck: { include: { driver: true } } },
      }),
      db.truck.update({
        where: { id: truck_id },
        data: { status: "LOADING", destination: load.destination, cargoLoaded: false },
      }),
    ]);
    // We already hold the authoritative load fields (incl. broker) from the fetch
    // above; status is now "ASSIGNED" because our claim won.
    const updatedLoad = { ...load, status: "ASSIGNED" as const, assignedTruckId: truck_id };

    // ── Real escrow: fund, then release advance — this is the actual money-moving path ──
    let escrowAccountId: string | null = null;
    let advanceReleased = false;
    let escrowSimulated = true;
    let escrowError: string | undefined;

    try {
      const fundResult = await aiClient.escrow.fund({
        broker_id: load.broker.brokerCode,
        load_id: load.tyreCode,
        load_amount_inr: load.aiSuggestedRate - load.advanceOffered,
        advance_amount_inr: load.advanceOffered,
      });
      if (fundResult.success) {
        escrowAccountId = fundResult.data?.razorpay_account_id ?? null;
        escrowSimulated = fundResult.data?.simulated ?? true;

        const advanceResult = await aiClient.escrow.advance({
          escrow_account_id: escrowAccountId || "",
          driver_phone: truck.driver?.phone || driver_phone || "",
          driver_upi_id: (truck.driver as any)?.upiId || "",
          load_id: load.tyreCode,
          advance_amount_inr: load.advanceOffered,
        });
        advanceReleased = advanceResult.success;
        escrowError = advanceResult.error;
      } else {
        escrowError = fundResult.error;
      }
    } catch (e: unknown) {
      // ai-gateway unreachable — don't fail the load assignment over it (the truck/trip
      // DB transaction already committed), but make the gap visible instead of claiming
      // the advance was released.
      const msg = e instanceof Error ? e.message : "Internal error";
      if (process.env.NODE_ENV !== "production") console.error("[loads/assign] escrow unreachable:", msg);
      escrowError = "ai-gateway unreachable";
    }

    await db.agentLog.create({
      data: {
        agentName: "Payment",
        eventType: "ADVANCE",
        payload: JSON.stringify({
          loadId: load.tyreCode,
          truckId: truck.vehicleNumber,
          advance: load.advanceOffered,
          driverPhone: truck.driver?.phone,
          escrowAccountId,
          advanceReleased,
          simulated: escrowSimulated,
          error: escrowError,
        }),
        latencyMs: 540,
        success: advanceReleased,
      },
    });

    await db.agentLog.create({
      data: {
        agentName: "Dispatch",
        eventType: "ASSIGN",
        payload: JSON.stringify({ loadId: load.tyreCode, truckId: truck.vehicleNumber }),
        latencyMs: 124,
        success: true,
      },
    });

    // BE-C8: audit the load-assignment write (money-moving route — UPI advance
    // released above). agentLog records the agent's view; this records the human /
    // caller's view for cross-referencing in incident reviews.
    await recordAudit({
      action: "load.assign",
      userId: user!.sub,
      ipAddress: clientIp(req),
      entityType: "Load",
      entityId: updatedLoad.id,
      metadata: {
        tyreCode: load.tyreCode,
        truckId: truck_id,
        tripId: trip.id,
        advanceReleased: advanceReleased ? load.advanceOffered : 0,
        escrowAccountId,
        escrowSimulated,
      },
    }).catch((e: unknown) => {
      console.error("[audit] recordAudit failed (load.assign)", e);
    });

    // Emit an org-scoped notification for the assignment (in-app inbox + dashboard).
    await notify({
      orgId: load.orgId,
      category: "trip",
      type: "load_assigned",
      title: `Load ${updatedLoad.tyreCode} assigned`,
      body: `${truck.vehicleNumber} assigned${advanceReleased ? ` \u2014 advance released` : ""}`,
      amount: advanceReleased ? load.advanceOffered : null,
      data: { loadId: updatedLoad.id, tripId: trip.id, truckId: truck_id },
    }).catch((e: unknown) => console.error("[loads/assign] notify failed", e));

    return NextResponse.json({
      success: true,
      data: {
        load_id: updatedLoad.id,
        load_code: updatedLoad.tyreCode,
        status: updatedLoad.status,
        trip_id: trip.id,
        truck_number: truck.vehicleNumber,
        driver_name: truck.driver?.name,
        driver_phone: truck.driver?.phone,
        advance_released: advanceReleased ? load.advanceOffered : 0,
        escrow_account_id: escrowAccountId,
        escrow_simulated: escrowSimulated,
        escrow_error: escrowError,
        message: advanceReleased
          ? `Load assigned to ${truck.vehicleNumber}. UPI advance of ₹${load.advanceOffered.toLocaleString("en-IN")} released to ${truck.driver?.name}${escrowSimulated ? " (sandbox/simulated — set TYRE_RAZORPAY_KEY_ID/SECRET for real payouts)" : ""}.`
          : `Load assigned to ${truck.vehicleNumber}, but the UPI advance could not be released (${escrowError ?? "unknown error"}). Retry from the trip dashboard.`,
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Internal error";
    if (process.env.NODE_ENV !== "production") console.error("[loads/assign]", msg);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
