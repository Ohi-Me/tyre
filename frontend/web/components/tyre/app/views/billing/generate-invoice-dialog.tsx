"use client";

/**
 * Generate-invoice dialog — pick a completed trip that has no invoice yet
 * and run it through the settlement engine (GST/TDS/commission split) via
 * POST /api/v1/invoices (RBAC billing:manage). Idempotent per trip.
 */
import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useTrips } from "@/lib/api/queries/trips";
import { useInvoices, useGenerateInvoice } from "@/lib/api/queries/invoices";
import { Loader2, FileText } from "lucide-react";
import { toast } from "sonner";

const selectCls =
  "w-full h-10 px-3 rounded-lg bg-[#F3F4F6] border border-transparent focus:border-[#F97316]/40 focus:bg-white focus:outline-none text-[13px] transition-colors disabled:opacity-60";
const labelCls = "block text-[11.5px] font-semibold text-[#374151] mb-1.5";

export function GenerateInvoiceDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { data: trips } = useTrips({ status: "COMPLETED" });
  const { data: invoices } = useInvoices();
  const generate = useGenerateInvoice();

  const [tripId, setTripId] = useState("");
  const [placeOfSupply, setPlaceOfSupply] = useState<"intra" | "inter">("inter");

  const invoicedTripIds = useMemo(() => new Set((invoices ?? []).map((i) => i.trip_id)), [invoices]);
  const billable = useMemo(() => (trips ?? []).filter((t) => !invoicedTripIds.has(t.id)), [trips, invoicedTripIds]);
  const selectedTrip = billable.find((t) => t.id === tripId) ?? null;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!tripId) {
      toast.error("Pick a completed trip");
      return;
    }
    try {
      const inv = await generate.mutateAsync({ trip_id: tripId, place_of_supply: placeOfSupply });
      toast.success(`Invoice ${inv.invoice_no} generated — ₹${inv.invoice_total.toLocaleString("en-IN")}`);
      setTripId("");
      onOpenChange(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Invoice generation failed";
      toast.error(msg.includes("403") ? "You do not have permission to manage billing" : msg);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-[17px] font-extrabold tracking-tight text-[#1F2937]">
            Generate invoice
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-3.5">
          <div>
            <label className={labelCls}>Completed trip</label>
            <select className={selectCls} value={tripId} onChange={(e) => setTripId(e.target.value)} disabled={generate.isPending}>
              <option value="">
                {billable.length === 0 ? "No un-invoiced completed trips" : "Select a trip…"}
              </option>
              {billable.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.load_code ?? t.id} — {t.origin} → {t.destination} (₹{t.rate.toLocaleString("en-IN")})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelCls}>Place of supply</label>
            <select
              className={selectCls}
              value={placeOfSupply}
              onChange={(e) => setPlaceOfSupply(e.target.value as "intra" | "inter")}
              disabled={generate.isPending}
            >
              <option value="inter">Inter-state (IGST)</option>
              <option value="intra">Intra-state (CGST + SGST)</option>
            </select>
          </div>

          {selectedTrip && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-[#F8FAFC] border border-black/[0.05] text-[12px]">
              <FileText className="w-3.5 h-3.5 text-[#71717A] shrink-0" />
              <span className="text-[#374151]">
                Freight ₹{selectedTrip.rate.toLocaleString("en-IN")} — GST, commission, and TDS are computed automatically.
              </span>
            </div>
          )}

          <button
            type="submit"
            disabled={generate.isPending || !tripId}
            className="w-full h-11 rounded-xl bg-[#F97316] hover:bg-[#EA580C] disabled:opacity-50 text-white text-[13.5px] font-semibold transition-all active:scale-[0.99] flex items-center justify-center gap-2"
          >
            {generate.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            {generate.isPending ? "Generating…" : "Generate invoice"}
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
