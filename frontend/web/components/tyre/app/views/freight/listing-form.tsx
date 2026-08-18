"use client";

/**
 * Add / edit freight listing dialog — photo upload, owner + vehicle details.
 * Used by the My Freight view for create and edit flows.
 */
import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  type FreightListing,
  type ListingInput,
  useCreateListing,
  useUpdateListing,
  uploadFreightPhoto,
  getProfile,
  saveProfile,
} from "@/lib/api/queries/freight";
import { Camera, Loader2, Truck, X } from "lucide-react";
import { toast } from "sonner";

export const VEHICLE_TYPES = ["Open", "Container", "Tipper", "Tanker", "Refrigerated", "Trailer"];

const inputCls =
  "w-full h-10 px-3 rounded-lg bg-[#F3F4F6] border border-transparent focus:border-[#F97316]/40 focus:bg-white focus:outline-none text-[13px] placeholder:text-[#9CA3AF] transition-colors";
const labelCls = "block text-[11.5px] font-semibold text-[#374151] mb-1.5";

export function ListingFormDialog({
  open,
  onOpenChange,
  listing,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  listing?: FreightListing | null;
}) {
  const isEdit = !!listing;
  const create = useCreateListing();
  const update = useUpdateListing();
  const fileRef = useRef<HTMLInputElement>(null);

  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState({
    owner_name: "",
    phone: "",
    vehicle_number: "",
    vehicle_type: "Open",
    capacity_tons: "",
    origin: "",
    destination: "",
    rate_per_km: "",
    expected_rate: "",
    description: "",
  });

  useEffect(() => {
    if (!open) return;
    if (listing) {
      setForm({
        owner_name: listing.owner_name,
        phone: listing.phone,
        vehicle_number: listing.vehicle_number,
        vehicle_type: listing.vehicle_type,
        capacity_tons: String(listing.capacity_tons),
        origin: listing.origin,
        destination: listing.destination ?? "",
        rate_per_km: listing.rate_per_km != null ? String(listing.rate_per_km) : "",
        expected_rate: listing.expected_rate != null ? String(listing.expected_rate) : "",
        description: listing.description,
      });
      setPhotoUrl(listing.photo_url);
    } else {
      const profile = getProfile();
      setForm((f) => ({
        ...f,
        owner_name: profile.name,
        phone: profile.phone,
        vehicle_number: "",
        capacity_tons: "",
        origin: "",
        destination: "",
        rate_per_km: "",
        expected_rate: "",
        description: "",
      }));
      setPhotoUrl(null);
    }
  }, [open, listing]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function onPickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadFreightPhoto(file);
      setPhotoUrl(url);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const capacity = parseFloat(form.capacity_tons);
    if (!form.owner_name.trim() || !form.phone.trim() || !form.vehicle_number.trim() || !form.origin.trim() || !capacity) {
      toast.error("Fill in name, phone, vehicle number, base city and capacity");
      return;
    }
    const input: ListingInput = {
      owner_name: form.owner_name.trim(),
      phone: form.phone.trim().replace(/\s+/g, ""),
      photo_url: photoUrl,
      vehicle_number: form.vehicle_number.trim(),
      vehicle_type: form.vehicle_type,
      capacity_tons: capacity,
      origin: form.origin.trim(),
      destination: form.destination.trim() || null,
      rate_per_km: form.rate_per_km ? parseFloat(form.rate_per_km) : null,
      expected_rate: form.expected_rate ? parseFloat(form.expected_rate) : null,
      description: form.description.trim(),
    };
    try {
      if (isEdit) {
        await update.mutateAsync({ id: listing!.id, ...input });
        toast.success("Listing updated");
      } else {
        await create.mutateAsync(input);
        toast.success("Your freight is live on the marketplace");
      }
      saveProfile({ name: input.owner_name, phone: input.phone });
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  const busy = create.isPending || update.isPending || uploading;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto tyre-scroll">
        <DialogHeader>
          <DialogTitle className="text-[17px] font-extrabold tracking-tight text-[#1F2937]">
            {isEdit ? "Edit freight listing" : "List your freight"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4 mt-1">
          {/* Photo */}
          <div>
            <span className={labelCls}>Vehicle photo</span>
            {photoUrl ? (
              <div className="relative rounded-xl overflow-hidden border border-black/[0.08] group">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photoUrl} alt="Vehicle" className="w-full h-40 object-cover" />
                <button
                  type="button"
                  onClick={() => setPhotoUrl(null)}
                  className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 text-white grid place-items-center opacity-0 group-hover:opacity-100 transition-opacity"
                  aria-label="Remove photo"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="w-full h-28 rounded-xl border-2 border-dashed border-black/[0.12] hover:border-[#F97316]/50 hover:bg-[#FFF7ED]/50 transition-colors grid place-items-center text-[#6B7280]"
              >
                {uploading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <span className="flex flex-col items-center gap-1.5">
                    <Camera className="w-5 h-5" />
                    <span className="text-[11.5px] font-medium">Add a photo (JPEG/PNG, max 5 MB)</span>
                  </span>
                )}
              </button>
            )}
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={onPickPhoto} />
          </div>

          {/* Owner */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Your name *</label>
              <input className={inputCls} value={form.owner_name} onChange={set("owner_name")} placeholder="Ramesh Kumar" />
            </div>
            <div>
              <label className={labelCls}>Phone number *</label>
              <input className={inputCls} value={form.phone} onChange={set("phone")} placeholder="98765 43210" inputMode="tel" />
            </div>
          </div>

          {/* Vehicle */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Vehicle number *</label>
              <input className={inputCls} value={form.vehicle_number} onChange={set("vehicle_number")} placeholder="BR01 GA 1234" />
            </div>
            <div>
              <label className={labelCls}>Vehicle type *</label>
              <select className={inputCls} value={form.vehicle_type} onChange={set("vehicle_type")}>
                {VEHICLE_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={labelCls}>Capacity (tons) *</label>
              <input className={inputCls} value={form.capacity_tons} onChange={set("capacity_tons")} placeholder="16" inputMode="decimal" />
            </div>
            <div>
              <label className={labelCls}>Base city *</label>
              <input className={inputCls} value={form.origin} onChange={set("origin")} placeholder="Patna" />
            </div>
            <div>
              <label className={labelCls}>Preferred route</label>
              <input className={inputCls} value={form.destination} onChange={set("destination")} placeholder="Delhi (optional)" />
            </div>
          </div>

          {/* Rates */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Rate per km (₹)</label>
              <input className={inputCls} value={form.rate_per_km} onChange={set("rate_per_km")} placeholder="e.g. 28" inputMode="decimal" />
            </div>
            <div>
              <label className={labelCls}>Expected trip rate (₹)</label>
              <input className={inputCls} value={form.expected_rate} onChange={set("expected_rate")} placeholder="e.g. 32000" inputMode="numeric" />
            </div>
          </div>

          <div>
            <label className={labelCls}>Notes for bookers</label>
            <textarea
              className={`${inputCls} h-20 py-2 resize-none`}
              value={form.description}
              onChange={set("description")}
              placeholder="Availability, routes you prefer, loading equipment…"
              maxLength={600}
            />
          </div>

          {/* Fee notice */}
          <div className="flex items-start gap-2.5 p-3 rounded-lg bg-[#FFF7ED] border border-[#F97316]/15">
            <Truck className="w-4 h-4 text-[#F97316] mt-0.5 shrink-0" />
            <p className="text-[11.5px] text-[#7C2D12] leading-relaxed">
              Listing is free. A flat <strong>₹49 platform fee</strong> is deducted from your payout only when you
              <strong> accept</strong> a booking — and refunded automatically if that booking is cancelled.
            </p>
          </div>

          <button
            type="submit"
            disabled={busy}
            className="w-full h-11 rounded-xl bg-[#1F2937] hover:bg-[#374151] disabled:opacity-60 text-white text-[13.5px] font-semibold transition-all active:scale-[0.99] flex items-center justify-center gap-2"
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            {isEdit ? "Save changes" : "Publish listing"}
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
