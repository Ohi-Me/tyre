"use client";

/**
 * My Freight — manage your listings, act on booking requests, and track the
 * ₹49 fee ledger (fees on acceptance, automatic refunds on cancellation).
 */
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowDownRight,
  ArrowUpRight,
  Check,
  MapPin,
  Pause,
  Pencil,
  Phone,
  Play,
  Plus,
  Trash2,
  Truck,
  Wallet,
  X,
} from "lucide-react";
import { SceneLoader } from "../loading/scene-loader";
import { toast } from "sonner";
import {
  type FreightBooking,
  type FreightListing,
  useBookingAction,
  useDeleteListing,
  useFreightBookings,
  useFreightListings,
  useFreightPayouts,
  useUpdateListing,
} from "@/lib/api/queries/freight";
import { ListingFormDialog } from "./freight/listing-form";
import { formatINR } from "./freight/listing-card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const BOOKING_STATUS: Record<FreightBooking["status"], { label: string; cls: string }> = {
  PENDING: { label: "Pending", cls: "bg-[#FEF3C7] text-[#B45309]" },
  ACCEPTED: { label: "Accepted", cls: "bg-[#ECFDF5] text-[#059669]" },
  REJECTED: { label: "Rejected", cls: "bg-[#F3F4F6] text-[#6B7280]" },
  CANCELLED: { label: "Cancelled", cls: "bg-[#FEE2E2] text-[#DC2626]" },
  COMPLETED: { label: "Completed", cls: "bg-[#EDE9FE] text-[#7C3AED]" },
};

export function MyFreightView() {
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<FreightListing | null>(null);
  const [deleting, setDeleting] = useState<FreightListing | null>(null);

  const { data: myListings, isLoading } = useFreightListings({ mine: true });
  const { data: incoming } = useFreightBookings("lister");
  const { data: outgoing } = useFreightBookings("booker");
  const { data: payouts } = useFreightPayouts();
  const del = useDeleteListing();
  const update = useUpdateListing();
  const act = useBookingAction();

  const listings = myListings ?? [];
  const pendingIncoming = (incoming ?? []).filter((b) => b.status === "PENDING");

  async function onAction(b: FreightBooking, action: "accept" | "reject" | "cancel" | "complete") {
    try {
      await act.mutateAsync({ id: b.id, action });
      if (action === "accept") toast.success(`Booking accepted — ₹49 fee deducted from your payout`);
      else if (action === "cancel") toast.success(b.fee_charged ? "Booking cancelled — ₹49 refunded" : "Booking cancelled");
      else toast.success(`Booking ${action === "reject" ? "rejected" : "completed"}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed");
    }
  }

  async function onDelete() {
    if (!deleting) return;
    try {
      await del.mutateAsync(deleting.id);
      toast.success("Listing removed");
      setDeleting(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  }

  async function togglePause(l: FreightListing) {
    try {
      await update.mutateAsync({ id: l.id, status: l.status === "PAUSED" ? "ACTIVE" : "PAUSED" });
      toast.success(l.status === "PAUSED" ? "Listing is live again" : "Listing paused");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    }
  }

  return (
    <div className="p-5 sm:p-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-extrabold tracking-tight text-[#1F2937]">My Freight</h1>
          <p className="text-[12.5px] text-[#6B7280] mt-0.5">
            Your listings, booking requests and payout ledger
          </p>
        </div>
        <button
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#F97316] text-white px-4 py-2.5 text-[13px] font-semibold hover:bg-[#EA580C] transition-all active:scale-[0.97]"
        >
          <Plus className="w-4 h-4" />
          New listing
        </button>
      </div>

      {/* Payout summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <div className="relative overflow-hidden rounded-2xl bg-[#1F2937] p-4 text-white">
          <div className="absolute -top-8 -right-8 w-28 h-28 rounded-full bg-[#F97316]/25 blur-2xl" />
          <div className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-white/60">
            <Wallet className="w-3 h-3" /> Payout balance
          </div>
          <div className={`text-[24px] font-extrabold mt-1 tabular-nums ${(payouts?.balance ?? 0) < 0 ? "text-[#FCA5A5]" : ""}`}>
            {formatINR(payouts?.balance ?? 0)}
          </div>
          <div className="text-[10.5px] text-white/55 mt-0.5">net of platform fees</div>
        </div>
        <SummaryTile label="Fees charged" value={`${payouts?.fees_charged ?? 0} × ₹49`} hint="on accepted bookings" />
        <SummaryTile label="Fees refunded" value={`${payouts?.fees_refunded ?? 0} × ₹49`} hint="from cancellations" />
        <SummaryTile label="Open requests" value={String(pendingIncoming.length)} hint="waiting for your decision" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.2fr_0.8fr] gap-6">
        {/* Left column: listings + incoming */}
        <div className="space-y-6 min-w-0">
          {/* My listings */}
          <section>
            <h2 className="text-[14px] font-bold text-[#1F2937] mb-3">
              Listings <span className="text-[#9CA3AF] font-semibold">({listings.length})</span>
            </h2>
            {isLoading ? (
              <SceneLoader scene="my_freight" compact />
            ) : listings.length === 0 ? (
              <div className="rounded-2xl border-2 border-dashed border-black/[0.08] p-10 text-center">
                <Truck className="w-9 h-9 mx-auto mb-3 text-[#D1D5DB]" strokeWidth={1.5} />
                <div className="text-[13.5px] font-semibold text-[#374151]">No listings yet</div>
                <p className="text-[12px] text-[#6B7280] mt-1 max-w-xs mx-auto">
                  List your vehicle with a photo and route — it appears on the marketplace instantly, free.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <AnimatePresence>
                  {listings.map((l) => (
                    <motion.div
                      key={l.id}
                      layout
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                      className="flex items-center gap-4 rounded-2xl border border-black/[0.06] bg-white p-3.5 hover:shadow-[0_8px_24px_-12px_rgba(0,0,0,0.15)] transition-shadow"
                    >
                      {/* Thumb */}
                      <div className="w-20 h-16 rounded-xl overflow-hidden shrink-0 bg-[#F3F4F6] grid place-items-center">
                        {l.photo_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={l.photo_url} alt={l.vehicle_number} className="w-full h-full object-cover" />
                        ) : (
                          <Truck className="w-6 h-6 text-[#D1D5DB]" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[13.5px] font-bold text-[#1F2937]">{l.vehicle_number}</span>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[9.5px] font-bold ${
                              l.status === "ACTIVE"
                                ? "bg-[#ECFDF5] text-[#059669]"
                                : l.status === "BOOKED"
                                  ? "bg-[#FEF3C7] text-[#B45309]"
                                  : "bg-[#F3F4F6] text-[#6B7280]"
                            }`}
                          >
                            {l.status}
                          </span>
                          {(l.pending_bookings ?? 0) > 0 && (
                            <span className="px-1.5 py-0.5 rounded bg-[#FEE2E2] text-[#DC2626] text-[9.5px] font-bold">
                              {l.pending_bookings} new request{l.pending_bookings! > 1 ? "s" : ""}
                            </span>
                          )}
                        </div>
                        <div className="text-[11.5px] text-[#6B7280] mt-1 flex items-center gap-1 truncate">
                          <MapPin className="w-3 h-3 shrink-0" />
                          {l.origin}
                          {l.destination ? ` → ${l.destination}` : ""} · {l.vehicle_type} · {l.capacity_tons} T
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <IconBtn title={l.status === "PAUSED" ? "Resume" : "Pause"} onClick={() => togglePause(l)}>
                          {l.status === "PAUSED" ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                        </IconBtn>
                        <IconBtn
                          title="Edit"
                          onClick={() => {
                            setEditing(l);
                            setFormOpen(true);
                          }}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </IconBtn>
                        <IconBtn title="Remove" danger onClick={() => setDeleting(l)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </IconBtn>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </section>

          {/* Incoming booking requests */}
          <section>
            <h2 className="text-[14px] font-bold text-[#1F2937] mb-3">
              Booking requests on your freight{" "}
              <span className="text-[#9CA3AF] font-semibold">({(incoming ?? []).length})</span>
            </h2>
            {(incoming ?? []).length === 0 ? (
              <p className="text-[12px] text-[#9CA3AF] rounded-xl border border-black/[0.05] bg-white p-4">
                No requests yet. When someone books your vehicle it shows up here.
              </p>
            ) : (
              <div className="space-y-2.5">
                {(incoming ?? []).map((b) => (
                  <div key={b.id} className="rounded-xl border border-black/[0.06] bg-white p-3.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[13px] font-bold text-[#1F2937]">{b.booker_name}</span>
                      <a href={`tel:${b.booker_phone}`} className="inline-flex items-center gap-1 text-[11.5px] text-[#059669] font-semibold hover:underline">
                        <Phone className="w-3 h-3" />
                        {b.booker_phone}
                      </a>
                      <span className={`ml-auto px-2 py-0.5 rounded-full text-[10px] font-bold ${BOOKING_STATUS[b.status].cls}`}>
                        {BOOKING_STATUS[b.status].label}
                      </span>
                    </div>
                    <div className="text-[11.5px] text-[#6B7280] mt-1.5">
                      {b.listing?.vehicle_number} · {b.pickup || "—"} → {b.dropoff || "—"}
                      {b.note && <span className="block mt-1 text-[#374151] italic">“{b.note}”</span>}
                    </div>
                    {b.status === "PENDING" && (
                      <div className="flex items-center gap-2 mt-3">
                        <button
                          onClick={() => onAction(b, "accept")}
                          disabled={act.isPending}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-[#10B981] text-white px-3.5 py-1.5 text-[12px] font-semibold hover:bg-[#059669] transition-all active:scale-95 disabled:opacity-60"
                        >
                          <Check className="w-3.5 h-3.5" />
                          Accept · ₹49 fee
                        </button>
                        <button
                          onClick={() => onAction(b, "reject")}
                          disabled={act.isPending}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-[#F3F4F6] text-[#374151] px-3.5 py-1.5 text-[12px] font-semibold hover:bg-[#E5E7EB] transition-all active:scale-95 disabled:opacity-60"
                        >
                          <X className="w-3.5 h-3.5" />
                          Reject
                        </button>
                      </div>
                    )}
                    {b.status === "ACCEPTED" && (
                      <div className="flex items-center gap-2 mt-3">
                        <button
                          onClick={() => onAction(b, "complete")}
                          disabled={act.isPending}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-[#8B5CF6] text-white px-3.5 py-1.5 text-[12px] font-semibold hover:bg-[#7C3AED] transition-all active:scale-95 disabled:opacity-60"
                        >
                          <Check className="w-3.5 h-3.5" />
                          Mark completed
                        </button>
                        <button
                          onClick={() => onAction(b, "cancel")}
                          disabled={act.isPending}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-[#FEE2E2] text-[#DC2626] px-3.5 py-1.5 text-[12px] font-semibold hover:bg-[#FECACA] transition-all active:scale-95 disabled:opacity-60"
                        >
                          <X className="w-3.5 h-3.5" />
                          Cancel · refund ₹49
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* My outgoing bookings */}
          {(outgoing ?? []).length > 0 && (
            <section>
              <h2 className="text-[14px] font-bold text-[#1F2937] mb-3">Bookings I made</h2>
              <div className="space-y-2.5">
                {(outgoing ?? []).map((b) => (
                  <div key={b.id} className="flex flex-wrap items-center gap-2.5 rounded-xl border border-black/[0.06] bg-white p-3.5">
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-bold text-[#1F2937] truncate">
                        {b.listing?.vehicle_number} · {b.listing?.owner_name}
                      </div>
                      <div className="text-[11.5px] text-[#6B7280] mt-0.5 truncate">
                        {b.pickup || "—"} → {b.dropoff || "—"}
                      </div>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${BOOKING_STATUS[b.status].cls}`}>
                      {BOOKING_STATUS[b.status].label}
                    </span>
                    {b.listing && (
                      <a
                        href={`tel:${b.listing.phone}`}
                        className="grid place-items-center w-8 h-8 rounded-lg bg-[#ECFDF5] text-[#059669] hover:bg-[#D1FAE5] transition-colors"
                        aria-label="Call owner"
                      >
                        <Phone className="w-3.5 h-3.5" />
                      </a>
                    )}
                    {["PENDING", "ACCEPTED"].includes(b.status) && (
                      <button
                        onClick={() => onAction(b, "cancel")}
                        disabled={act.isPending}
                        className="rounded-lg bg-[#F3F4F6] text-[#374151] px-3 py-1.5 text-[11.5px] font-semibold hover:bg-[#E5E7EB] transition-colors disabled:opacity-60"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* Right column: fee ledger */}
        <aside>
          <h2 className="text-[14px] font-bold text-[#1F2937] mb-3">Fee ledger</h2>
          <div className="rounded-2xl border border-black/[0.06] bg-white overflow-hidden">
            {(payouts?.entries ?? []).length === 0 ? (
              <p className="text-[12px] text-[#9CA3AF] p-5 text-center">
                No fee activity yet.
                <span className="block mt-1">₹49 is charged when you accept a booking, refunded if it&apos;s cancelled.</span>
              </p>
            ) : (
              <div className="divide-y divide-black/[0.04] max-h-[480px] overflow-y-auto tyre-scroll">
                {(payouts?.entries ?? []).map((e) => {
                  const refund = e.type === "BOOKING_FEE_REFUND";
                  return (
                    <div key={e.id} className="flex items-center gap-3 px-4 py-3">
                      <div
                        className={`w-8 h-8 rounded-full grid place-items-center shrink-0 ${
                          refund ? "bg-[#ECFDF5] text-[#059669]" : "bg-[#FEE2E2] text-[#DC2626]"
                        }`}
                      >
                        {refund ? <ArrowDownRight className="w-3.5 h-3.5" /> : <ArrowUpRight className="w-3.5 h-3.5" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-[12px] font-semibold text-[#1F2937]">
                          {refund ? "Fee refunded" : "Booking fee"}
                        </div>
                        <div className="text-[10.5px] text-[#9CA3AF] truncate">{e.note}</div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className={`text-[13px] font-bold tabular-nums ${refund ? "text-[#059669]" : "text-[#DC2626]"}`}>
                          {refund ? "+" : "−"}₹{Math.abs(e.amount)}
                        </div>
                        <div className="text-[9.5px] text-[#9CA3AF]">
                          {new Date(e.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* Dialogs */}
      <ListingFormDialog open={formOpen} onOpenChange={setFormOpen} listing={editing} />
      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {deleting?.vehicle_number}?</AlertDialogTitle>
            <AlertDialogDescription>
              The listing disappears from the marketplace and pending requests are declined. Accepted bookings must
              be cancelled first (that also refunds the ₹49 fee).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction onClick={onDelete} className="bg-[#DC2626] hover:bg-[#B91C1C]">
              Remove listing
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SummaryTile({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-2xl border border-black/[0.06] bg-white p-4">
      <div className="text-[10.5px] font-semibold uppercase tracking-wider text-[#9CA3AF]">{label}</div>
      <div className="text-[22px] font-extrabold text-[#1F2937] mt-1 tabular-nums">{value}</div>
      <div className="text-[10.5px] text-[#9CA3AF] mt-0.5">{hint}</div>
    </div>
  );
}

function IconBtn({
  children,
  title,
  onClick,
  danger,
}: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      title={title}
      aria-label={title}
      onClick={onClick}
      className={`grid place-items-center w-8 h-8 rounded-lg transition-all active:scale-90 ${
        danger ? "text-[#DC2626] hover:bg-[#FEE2E2]" : "text-[#6B7280] hover:bg-black/[0.05] hover:text-[#1F2937]"
      }`}
    >
      {children}
    </button>
  );
}
