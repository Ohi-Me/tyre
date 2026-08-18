"use client";

/**
 * Create/edit dialog for fleet documents (insurance, RC, permit, fitness,
 * pollution, license). Links to a truck or driver; expiry status is derived
 * server-side so this form never sets a status field directly.
 *
 * file_url is a plain link field — there is no object-storage/upload pipeline
 * yet (see NEXT.md), so operators paste an existing URL (e.g. a shared drive
 * link) rather than upload a file here.
 */
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useCreateDocument, useUpdateDocument, type TyreDocument, type DocType } from "@/lib/api/queries/documents";
import { useTrucks } from "@/lib/api/queries/trucks";
import { useDrivers } from "@/lib/api/queries/drivers";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

const DOC_TYPES: DocType[] = ["INSURANCE", "RC", "PERMIT", "FITNESS", "POLLUTION", "LICENSE", "OTHER"];

const inputCls =
  "w-full h-10 px-3 rounded-lg bg-[#F3F4F6] border border-transparent focus:border-[#F97316]/40 focus:bg-white focus:outline-none text-[13px] placeholder:text-[#9CA3AF] transition-colors disabled:opacity-60";
const labelCls = "block text-[11.5px] font-semibold text-[#374151] mb-1.5";

function toDateInput(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toISOString().slice(0, 10);
}

export function DocumentDialog({
  open,
  onOpenChange,
  document,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  document: TyreDocument | null;
}) {
  const isEdit = !!document;
  const create = useCreateDocument();
  const update = useUpdateDocument();
  const { data: trucks } = useTrucks();
  const { data: drivers } = useDrivers();
  const pending = create.isPending || update.isPending;

  const [form, setForm] = useState({
    type: "INSURANCE" as DocType,
    linkKind: "truck" as "truck" | "driver",
    linkId: "",
    doc_number: "",
    issuer: "",
    file_url: "",
    issue_date: "",
    expiry_date: "",
    notes: "",
  });

  useEffect(() => {
    if (!open) return;
    if (document) {
      setForm({
        type: document.type,
        linkKind: document.driver_id ? "driver" : "truck",
        linkId: document.truck_id ?? document.driver_id ?? "",
        doc_number: document.doc_number ?? "",
        issuer: document.issuer ?? "",
        file_url: document.file_url ?? "",
        issue_date: toDateInput(document.issue_date),
        expiry_date: toDateInput(document.expiry_date),
        notes: document.notes ?? "",
      });
    } else {
      setForm({
        type: "INSURANCE",
        linkKind: "truck",
        linkId: "",
        doc_number: "",
        issuer: "",
        file_url: "",
        issue_date: "",
        expiry_date: "",
        notes: "",
      });
    }
  }, [open, document]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isEdit && !form.linkId) {
      toast.error(`Pick a ${form.linkKind}`);
      return;
    }
    try {
      if (isEdit && document) {
        await update.mutateAsync({
          id: document.id,
          type: form.type,
          doc_number: form.doc_number || null,
          issuer: form.issuer || null,
          file_url: form.file_url || null,
          issue_date: form.issue_date || null,
          expiry_date: form.expiry_date || null,
          notes: form.notes,
        });
        toast.success("Document updated");
      } else {
        await create.mutateAsync({
          type: form.type,
          truck_id: form.linkKind === "truck" ? form.linkId : null,
          driver_id: form.linkKind === "driver" ? form.linkId : null,
          doc_number: form.doc_number || null,
          issuer: form.issuer || null,
          file_url: form.file_url || null,
          issue_date: form.issue_date || null,
          expiry_date: form.expiry_date || null,
          notes: form.notes,
        });
        toast.success("Document added");
      }
      onOpenChange(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Save failed";
      toast.error(msg.includes("403") ? "You do not have permission to manage documents" : msg);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-[17px] font-extrabold tracking-tight text-[#1F2937]">
            {isEdit ? "Edit document" : "Add document"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-3.5">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Type</label>
              <select className={inputCls} value={form.type} onChange={set("type")} disabled={pending}>
                {DOC_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t.charAt(0) + t.slice(1).toLowerCase()}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Doc number</label>
              <input className={inputCls} value={form.doc_number} onChange={set("doc_number")} placeholder="e.g. policy no." disabled={pending} />
            </div>
          </div>

          {!isEdit && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Linked to</label>
                <select
                  className={inputCls}
                  value={form.linkKind}
                  onChange={(e) => setForm((f) => ({ ...f, linkKind: e.target.value as "truck" | "driver", linkId: "" }))}
                  disabled={pending}
                >
                  <option value="truck">Vehicle</option>
                  <option value="driver">Driver</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>{form.linkKind === "truck" ? "Vehicle" : "Driver"}</label>
                <select className={inputCls} value={form.linkId} onChange={set("linkId")} disabled={pending}>
                  <option value="">Select…</option>
                  {form.linkKind === "truck"
                    ? (trucks ?? []).map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.vehicle_number}
                        </option>
                      ))
                    : (drivers ?? []).map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                </select>
              </div>
            </div>
          )}

          <div>
            <label className={labelCls}>Issuer</label>
            <input className={inputCls} value={form.issuer} onChange={set("issuer")} placeholder="e.g. RTO / insurer name" disabled={pending} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Issue date</label>
              <input type="date" className={inputCls} value={form.issue_date} onChange={set("issue_date")} disabled={pending} />
            </div>
            <div>
              <label className={labelCls}>Expiry date</label>
              <input type="date" className={inputCls} value={form.expiry_date} onChange={set("expiry_date")} disabled={pending} />
            </div>
          </div>

          <div>
            <label className={labelCls}>File link (optional)</label>
            <input className={inputCls} value={form.file_url} onChange={set("file_url")} placeholder="https://…" disabled={pending} />
          </div>

          <div>
            <label className={labelCls}>Notes</label>
            <textarea
              className={`${inputCls} h-16 py-2 resize-none`}
              value={form.notes}
              onChange={set("notes")}
              maxLength={600}
              disabled={pending}
            />
          </div>

          <button
            type="submit"
            disabled={pending}
            className="w-full h-11 rounded-xl bg-[#F97316] hover:bg-[#EA580C] disabled:opacity-50 text-white text-[13.5px] font-semibold transition-all active:scale-[0.99] flex items-center justify-center gap-2"
          >
            {pending && <Loader2 className="w-4 h-4 animate-spin" />}
            {isEdit ? "Save changes" : "Add document"}
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
