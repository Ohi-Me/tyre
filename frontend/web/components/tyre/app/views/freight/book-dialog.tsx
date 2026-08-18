"use client";

/**
 * Booking request dialog — sends a booking to the lister and shows the
 * lister's direct contact so the two parties can talk immediately.
 */
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  type FreightListing,
  useBookListing,
  getProfile,
  saveProfile,
} from "@/lib/api/queries/freight";
import { Loader2, MapPin, Phone } from "lucide-react";
import { toast } from "sonner";

const inputCls =
  "w-full h-10 px-3 rounded-lg bg-[#F3F4F6] border border-transparent focus:border-[#F97316]/40 focus:bg-white focus:outline-none text-[13px] placeholder:text-[#9CA3AF] transition-colors";
const labelCls = "block text-[11.5px] font-semibold text-[#374151] mb-1.5";

export function BookDialog({
  listing,
  onOpenChange,
}: {
  listing: FreightListing | null;
  onOpenChange: (o: boolean) => void;
}) {
  const book = useBookListing();
  const [form, setForm] = useState({ booker_name: "", booker_phone: "", pickup: "", dropoff: "", note: "" });

  useEffect(() => {
    if (listing) {
      const p = getProfile();
      setForm((f) => ({ ...f, booker_name: p.name, booker_phone: p.phone }));
    }
  }, [listing]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!listing) return;
    if (!form.booker_name.trim() || !form.booker_phone.trim()) {
      toast.error("Enter your name and phone number");
      return;
    }
    try {
      await book.mutateAsync({
        listingId: listing.id,
        booker_name: form.booker_name.trim(),
        booker_phone: form.booker_phone.trim().replace(/\s+/g, ""),
        pickup: form.pickup.trim(),
        dropoff: form.dropoff.trim(),
        note: form.note.trim(),
      });
      saveProfile({ name: form.booker_name.trim(), phone: form.booker_phone.trim() });
      toast.success(`Booking request sent to ${listing.owner_name}`);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Booking failed");
    }
  }

  return (
    <Dialog open={!!listing} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-[17px] font-extrabold tracking-tight text-[#1F2937]">
            Book {listing?.vehicle_number}
          </DialogTitle>
        </DialogHeader>

        {listing && (
          <div className="flex items-center justify-between p-3 rounded-xl bg-[#F8FAFC] border border-black/[0.05] mb-1">
            <div className="min-w-0">
              <div className="text-[13px] font-bold text-[#1F2937] truncate">{listing.owner_name}</div>
              <div className="text-[11px] text-[#6B7280] flex items-center gap-1 mt-0.5">
                <MapPin className="w-3 h-3" />
                {listing.origin}
                {listing.destination ? ` → ${listing.destination}` : ""}
              </div>
            </div>
            <a
              href={`tel:${listing.phone}`}
              className="inline-flex items-center gap-1.5 shrink-0 px-3 py-2 rounded-lg bg-[#ECFDF5] text-[#059669] text-[12px] font-semibold hover:bg-[#D1FAE5] transition-colors"
            >
              <Phone className="w-3.5 h-3.5" />
              Call now
            </a>
          </div>
        )}

        <form onSubmit={onSubmit} className="space-y-3.5">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Your name *</label>
              <input className={inputCls} value={form.booker_name} onChange={set("booker_name")} placeholder="Your name" />
            </div>
            <div>
              <label className={labelCls}>Your phone *</label>
              <input className={inputCls} value={form.booker_phone} onChange={set("booker_phone")} placeholder="98765 43210" inputMode="tel" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Pickup</label>
              <input className={inputCls} value={form.pickup} onChange={set("pickup")} placeholder="Patna" />
            </div>
            <div>
              <label className={labelCls}>Drop-off</label>
              <input className={inputCls} value={form.dropoff} onChange={set("dropoff")} placeholder="Delhi" />
            </div>
          </div>
          <div>
            <label className={labelCls}>Message to the owner</label>
            <textarea
              className={`${inputCls} h-16 py-2 resize-none`}
              value={form.note}
              onChange={set("note")}
              placeholder="Goods type, weight, dates…"
              maxLength={400}
            />
          </div>

          <button
            type="submit"
            disabled={book.isPending}
            className="w-full h-11 rounded-xl bg-[#F97316] hover:bg-[#EA580C] disabled:opacity-60 text-white text-[13.5px] font-semibold transition-all active:scale-[0.99] flex items-center justify-center gap-2"
          >
            {book.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            Send booking request
          </button>
          <p className="text-[10.5px] text-[#9CA3AF] text-center">
            Free for you. The owner pays a flat ₹49 fee only when they accept.
          </p>
        </form>
      </DialogContent>
    </Dialog>
  );
}
