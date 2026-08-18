"use client";

/**
 * Direct driver create form — POST /api/v1/drivers (RBAC drivers:manage).
 * Complements voice onboarding: some operators would rather type a phone
 * number than talk to the assistant.
 */
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useCreateDriver } from "@/lib/api/queries/drivers";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

const inputCls =
  "w-full h-10 px-3 rounded-lg bg-[#F3F4F6] border border-transparent focus:border-[#F97316]/40 focus:bg-white focus:outline-none text-[13px] placeholder:text-[#9CA3AF] transition-colors disabled:opacity-60";
const labelCls = "block text-[11.5px] font-semibold text-[#374151] mb-1.5";

const LANGS = [
  { id: "hindi", label: "Hindi" },
  { id: "english", label: "English" },
  { id: "bhojpuri", label: "Bhojpuri" },
];

export function AddDriverDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const create = useCreateDriver();
  const [form, setForm] = useState({ name: "", phone: "", preferred_lang: "hindi", truck_type: "", current_location: "" });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.phone.trim()) {
      toast.error("Enter the driver's name and phone number");
      return;
    }
    try {
      const driver = await create.mutateAsync({
        name: form.name.trim(),
        phone: form.phone.trim().replace(/\s+/g, ""),
        preferred_lang: form.preferred_lang,
        truck_type: form.truck_type.trim() || null,
        current_location: form.current_location.trim() || null,
      });
      toast.success(`${driver.name} added to your fleet`);
      setForm({ name: "", phone: "", preferred_lang: "hindi", truck_type: "", current_location: "" });
      onOpenChange(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not add driver";
      toast.error(msg.includes("403") ? "You do not have permission to manage drivers" : msg);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-[17px] font-extrabold tracking-tight text-[#1F2937]">Add driver</DialogTitle>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-3.5">
          <div>
            <label className={labelCls}>Full name *</label>
            <input className={inputCls} value={form.name} onChange={set("name")} placeholder="Driver's name" disabled={create.isPending} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Phone *</label>
              <input className={inputCls} value={form.phone} onChange={set("phone")} placeholder="98765 43210" inputMode="tel" disabled={create.isPending} />
            </div>
            <div>
              <label className={labelCls}>Preferred language</label>
              <select className={inputCls} value={form.preferred_lang} onChange={set("preferred_lang")} disabled={create.isPending}>
                {LANGS.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Truck type</label>
              <input className={inputCls} value={form.truck_type} onChange={set("truck_type")} placeholder="e.g. 32ft trailer" disabled={create.isPending} />
            </div>
            <div>
              <label className={labelCls}>Current location</label>
              <input className={inputCls} value={form.current_location} onChange={set("current_location")} placeholder="City" disabled={create.isPending} />
            </div>
          </div>

          <button
            type="submit"
            disabled={create.isPending}
            className="w-full h-11 rounded-xl bg-[#F97316] hover:bg-[#EA580C] disabled:opacity-60 text-white text-[13.5px] font-semibold transition-all active:scale-[0.99] flex items-center justify-center gap-2"
          >
            {create.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            Add driver
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
