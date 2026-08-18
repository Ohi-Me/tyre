import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireInternalService } from "@tyre/auth";

export const dynamic = "force-dynamic";

/**
 * /api/v1/fastag/wallet — Phase 0 fix.
 *
 * `docs/ARCHITECTURE.md` §8: "FASTag wallet — STUB — Returns fabricated wallet balances
 * and toll estimates." `backend/ai/gateway/app/ai/fastag/service.py` had every DB call
 * commented out (`# wallet = await db.fastagWallet.findUnique(...)`) and returned
 * `remaining_balance_inr: 1500  # stub` unconditionally. This route is the real
 * `FastagWallet`/`FastagTransaction` read/write path `fastag/service.py` now calls via
 * `app/clients/bff_client.get_fastag_wallet()` / `record_fastag_event()`.
 */
export async function GET(req: NextRequest) {
  const denied = requireInternalService(req);
  if (denied) return denied;

  const driverPhone = req.nextUrl.searchParams.get("driver_phone");
  if (!driverPhone) {
    return NextResponse.json({ success: false, error: "driver_phone required" }, { status: 400 });
  }

  try {
    const wallet = await db.fastagWallet.findFirst({ where: { driverPhone } });
    if (!wallet) {
      return NextResponse.json({ success: true, data: null, message: "No FASTag linked for this driver" });
    }
    return NextResponse.json({
      success: true,
      data: {
        fastag_id: wallet.fastagId,
        issuer: wallet.fastagIssuer,
        vehicle_number: wallet.vehicleNumber,
        balance_inr: wallet.balance,
        auto_recharge_threshold_inr: wallet.autoRechargeThreshold,
        auto_recharge_amount_inr: wallet.autoRechargeAmount,
        escrow_linked: wallet.escrowLinked,
        total_toll_paid_inr: wallet.totalTollPaid,
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Internal error";
    if (process.env.NODE_ENV !== "production") console.error("[fastag/wallet]", msg);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}

// POST handles both link-new-wallet and toll/recharge events, distinguished by `action`.
export async function POST(req: NextRequest) {
  const denied = requireInternalService(req);
  if (denied) return denied;

  try {
    const body = await req.json();
    const action = body.action || "link";

    if (action === "link") {
      const { driver_id, driver_phone, fastag_id, issuer, vehicle_number } = body;
      const wallet = await db.fastagWallet.upsert({
        where: { fastagId: fastag_id },
        create: {
          driverId: driver_id || "", driverPhone: driver_phone, fastagId: fastag_id,
          fastagIssuer: issuer, vehicleNumber: vehicle_number,
        },
        update: { driverPhone: driver_phone, vehicleNumber: vehicle_number },
      });
      return NextResponse.json({ success: true, data: { wallet_id: wallet.id, balance: wallet.balance } });
    }

    if (action === "toll") {
      const { fastag_id, amount, toll_plaza, toll_plaza_id, highway, transaction_ref } = body;
      const wallet = await db.fastagWallet.findUnique({ where: { fastagId: fastag_id } });
      if (!wallet) return NextResponse.json({ success: false, error: "Wallet not found" }, { status: 404 });

      const autoRecharge = wallet.balance - amount < wallet.autoRechargeThreshold;
      const newBalance = autoRecharge ? wallet.balance - amount + wallet.autoRechargeAmount : wallet.balance - amount;

      const [updated] = await db.$transaction([
        db.fastagWallet.update({
          where: { id: wallet.id },
          data: {
            balance: newBalance,
            totalTollPaid: { increment: amount },
            totalRecharged: autoRecharge ? { increment: wallet.autoRechargeAmount } : undefined,
            lastTollAt: new Date(),
            lastRechargeAt: autoRecharge ? new Date() : undefined,
          },
        }),
        db.fastagTransaction.create({
          data: {
            fastagWalletId: wallet.id, transactionType: "TOLL", amount,
            tollPlaza: toll_plaza, tollPlazaId: toll_plaza_id, highway,
            transactionRef: transaction_ref, status: "SUCCESS",
          },
        }),
      ]);

      return NextResponse.json({
        success: true,
        data: { remaining_balance_inr: updated.balance, auto_recharge_triggered: autoRecharge },
      });
    }

    return NextResponse.json({ success: false, error: `Unknown action: ${action}` }, { status: 400 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Internal error";
    if (process.env.NODE_ENV !== "production") console.error("[fastag/wallet]", msg);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
