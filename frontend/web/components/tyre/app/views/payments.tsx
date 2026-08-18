"use client";

/**
 * Payments — payout balance, the ₹49 marketplace fee ledger and settlement
 * info. Every number on this screen is real: it comes from the freight
 * payout ledger (fees charged on accepted bookings, refunds on
 * cancellations).
 */
import { motion } from "framer-motion";
import {
  ArrowDownRight,
  ArrowUpRight,
  BadgeCheck,
  ReceiptText,
  Ticket,
  Undo2,
  Wallet,
} from "lucide-react";
import { SceneLoader } from "../loading/scene-loader";
import { useFreightPayouts, useFreightBookings } from "@/lib/api/queries/freight";
import { useTyreUI } from "@/lib/tyre/store";

function formatINR(n: number): string {
  return `₹${n.toLocaleString("en-IN")}`;
}

export function PaymentsView() {
  const { data: payouts, isLoading } = useFreightPayouts();
  const { data: bookings } = useFreightBookings("lister");
  const { setAppView } = useTyreUI();

  const accepted = (bookings ?? []).filter((b) => b.status === "ACCEPTED").length;
  const completed = (bookings ?? []).filter((b) => b.status === "COMPLETED").length;

  return (
    <div className="p-5 sm:p-6 max-w-[1200px] mx-auto">
      <div className="mb-6">
        <h1 className="text-[22px] font-extrabold tracking-tight text-[#1F2937]">Payments</h1>
        <p className="text-[12.5px] text-[#6B7280] mt-0.5">
          Payout balance and the flat ₹49 booking fee — charged on acceptance, refunded on cancellation
        </p>
      </div>

      {/* Wallet band — three distinct cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        {/* Balance card — dark, hero */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          className="relative rounded-2xl overflow-hidden bg-[#1F2937] p-6 text-white"
        >
          <div className="absolute -top-14 -right-14 w-48 h-48 rounded-full bg-[#F97316]/30 blur-3xl" />
          <div className="absolute -bottom-16 -left-10 w-40 h-40 rounded-full bg-[#8FE03A]/15 blur-3xl" />
          <div className="relative">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/60">
                Payout balance
              </span>
              <Wallet className="w-4 h-4 text-white/60" />
            </div>
            <div className={`text-[38px] font-extrabold tracking-tight tabular-nums ${(payouts?.balance ?? 0) < 0 ? "text-[#FCA5A5]" : ""}`}>
              {isLoading ? "—" : formatINR(payouts?.balance ?? 0)}
            </div>
            <div className="text-[11.5px] text-white/55 mt-1">
              Net of marketplace fees · settled T+1 to UPI
            </div>
            <div className="mt-5 flex items-center gap-1.5 text-[11px] text-white/70">
              <BadgeCheck className="w-3.5 h-3.5 text-[#8FE03A]" />
              Razorpay Route verified
            </div>
          </div>
        </motion.div>

        {/* Fees charged */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
          className="rounded-2xl border border-black/[0.06] bg-white p-6"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#9CA3AF]">
              Booking fees
            </span>
            <span className="grid place-items-center w-8 h-8 rounded-xl bg-[#FEE2E2]">
              <Ticket className="w-4 h-4 text-[#DC2626]" />
            </span>
          </div>
          <div className="text-[38px] font-extrabold tracking-tight text-[#1F2937] tabular-nums">
            {payouts?.fees_charged ?? 0}
          </div>
          <div className="text-[11.5px] text-[#6B7280] mt-1">
            × ₹{payouts?.fee_inr ?? 49} charged on accepted bookings
          </div>
          <div className="mt-4 text-[11px] text-[#9CA3AF]">
            {accepted} active · {completed} completed bookings
          </div>
        </motion.div>

        {/* Refunds */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.16, ease: [0.22, 1, 0.36, 1] }}
          className="rounded-2xl border border-black/[0.06] bg-white p-6"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#9CA3AF]">
              Auto-refunds
            </span>
            <span className="grid place-items-center w-8 h-8 rounded-xl bg-[#ECFDF5]">
              <Undo2 className="w-4 h-4 text-[#059669]" />
            </span>
          </div>
          <div className="text-[38px] font-extrabold tracking-tight text-[#1F2937] tabular-nums">
            {payouts?.fees_refunded ?? 0}
          </div>
          <div className="text-[11.5px] text-[#6B7280] mt-1">
            fees returned for cancelled bookings
          </div>
          <div className="mt-4 text-[11px] text-[#9CA3AF]">
            Net fees paid: <span className="font-bold text-[#1F2937]">{formatINR(payouts?.net_fees_paid ?? 0)}</span>
          </div>
        </motion.div>
      </div>

      {/* Ledger */}
      <div className="rounded-2xl border border-black/[0.06] bg-white overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-black/[0.06]">
          <div className="flex items-center gap-2">
            <ReceiptText className="w-4 h-4 text-[#6B7280]" />
            <h2 className="text-[14px] font-semibold text-[#1F2937]">Fee ledger</h2>
          </div>
          <span className="text-[11px] text-[#9CA3AF]">
            {(payouts?.entries ?? []).length} entries
          </span>
        </div>

        {isLoading ? (
          <SceneLoader scene="payments" compact />
        ) : (payouts?.entries ?? []).length === 0 ? (
          <div className="text-center py-14 px-6">
            <Wallet className="w-9 h-9 mx-auto mb-3 text-[#E5E7EB]" strokeWidth={1.5} />
            <div className="text-[13.5px] font-semibold text-[#374151]">No transactions yet</div>
            <p className="text-[12px] text-[#6B7280] mt-1 max-w-sm mx-auto">
              When you accept a booking on your freight, a ₹49 fee appears here. Cancel the booking and the fee is
              refunded automatically.
            </p>
            <button
              onClick={() => setAppView("my_freight")}
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-[#1F2937] text-white px-4 py-2 text-[12.5px] font-semibold hover:bg-[#374151] transition-colors"
            >
              Go to My Freight
            </button>
          </div>
        ) : (
          <div className="divide-y divide-black/[0.04]">
            {(payouts?.entries ?? []).map((e) => {
              const refund = e.type === "BOOKING_FEE_REFUND";
              return (
                <div key={e.id} className="grid grid-cols-12 gap-3 items-center px-4 py-3.5 hover:bg-[#FAFAFA] transition-colors">
                  <div className="col-span-8 sm:col-span-6 flex items-center gap-3">
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                        refund ? "bg-[#ECFDF5] text-[#059669]" : "bg-[#FEE2E2] text-[#DC2626]"
                      }`}
                    >
                      {refund ? <ArrowDownRight className="w-3.5 h-3.5" /> : <ArrowUpRight className="w-3.5 h-3.5" />}
                    </div>
                    <div className="min-w-0">
                      <div className="text-[12.5px] font-semibold text-[#1F2937]">
                        {refund ? "Booking fee refunded" : "Booking fee"}
                      </div>
                      <div className="text-[10.5px] text-[#9CA3AF] truncate">{e.note}</div>
                    </div>
                  </div>
                  <div className="hidden sm:block col-span-3">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                        refund ? "bg-[#ECFDF5] text-[#059669]" : "bg-[#F3F4F6] text-[#6B7280]"
                      }`}
                    >
                      {refund ? "Refund" : "Platform fee"}
                    </span>
                  </div>
                  <div className="hidden sm:block col-span-2 text-[11px] text-[#9CA3AF]">
                    {new Date(e.created_at).toLocaleString("en-IN", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                  <div className="col-span-4 sm:col-span-1 text-right">
                    <span className={`text-[14px] font-bold tabular-nums ${refund ? "text-[#059669]" : "text-[#DC2626]"}`}>
                      {refund ? "+" : "−"}₹{Math.abs(e.amount)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
