"use client";

/**
 * Documents — fleet compliance CRUD (insurance, RC, permit, fitness,
 * pollution, license) over /api/v1/documents*. Status (valid/expiring/
 * expired) is derived server-side from expiry_date, never stored.
 */
import { useState } from "react";
import { useDocuments, useDeleteDocument, type TyreDocument } from "@/lib/api/queries/documents";
import { useTrucks } from "@/lib/api/queries/trucks";
import { useDrivers } from "@/lib/api/queries/drivers";
import { DocumentDialog } from "./documents/document-dialog";
import { SceneLoader } from "../loading/scene-loader";
import { FileText, Plus, Search, Pencil, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  VALID: { bg: "#ECFDF5", text: "#10B981" },
  EXPIRING: { bg: "#FFF7ED", text: "#F97316" },
  EXPIRED: { bg: "#FEF2F2", text: "#EF4444" },
  UNKNOWN: { bg: "#F3F4F6", text: "#6B7280" },
};

type StatusFilter = "ALL" | "VALID" | "EXPIRING" | "EXPIRED";
const FILTERS: { id: StatusFilter; label: string }[] = [
  { id: "ALL", label: "All Documents" },
  { id: "EXPIRING", label: "Expiring Soon" },
  { id: "EXPIRED", label: "Expired" },
  { id: "VALID", label: "Valid" },
];

function fmtDate(iso: string | null): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export function DocumentsView() {
  const { data, isLoading } = useDocuments();
  const { data: trucks } = useTrucks();
  const { data: drivers } = useDrivers();
  const del = useDeleteDocument();

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<StatusFilter>("ALL");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TyreDocument | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const truckName = (id: string | null) => (id ? trucks?.find((t) => t.id === id)?.vehicle_number ?? id : null);
  const driverName = (id: string | null) => (id ? drivers?.find((d) => d.id === id)?.name ?? id : null);

  const all = data?.items ?? [];
  const summary = data?.summary ?? { valid: 0, expiring: 0, expired: 0, unknown: 0 };
  const docs = all.filter((d) => {
    const okStatus = filter === "ALL" || d.status === filter;
    const linked = truckName(d.truck_id) ?? driverName(d.driver_id) ?? "";
    const okSearch = !search || `${d.type} ${d.doc_number ?? ""} ${linked}`.toLowerCase().includes(search.toLowerCase());
    return okStatus && okSearch;
  });

  const cards: { label: string; value: number; bg: string; f: StatusFilter }[] = [
    { label: "Total Documents", value: all.length, bg: "#10B981", f: "ALL" },
    { label: "Expiring Soon", value: summary.expiring, bg: "#F97316", f: "EXPIRING" },
    { label: "Expired", value: summary.expired, bg: "#EF4444", f: "EXPIRED" },
    { label: "Valid", value: summary.valid, bg: "#3B82F6", f: "VALID" },
  ];

  function openCreate() {
    setEditing(null);
    setDialogOpen(true);
  }
  function openEdit(d: TyreDocument) {
    setEditing(d);
    setDialogOpen(true);
  }
  async function onDelete(d: TyreDocument) {
    setDeletingId(d.id);
    try {
      await del.mutateAsync(d.id);
      toast.success("Document removed");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Delete failed";
      toast.error(msg.includes("403") ? "You do not have permission to manage documents" : msg);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="p-5 sm:p-6 max-w-[1600px] mx-auto">
      <DocumentDialog open={dialogOpen} onOpenChange={setDialogOpen} document={editing} />

      <div className="mb-5 flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-[22px] font-extrabold tracking-tight text-[#1F2937]">Documents</h1>
          <p className="text-[12.5px] text-[#6B7280] mt-0.5">Insurance, RC, permits, fitness &amp; pollution certificates</p>
        </div>
        <button
          onClick={openCreate}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#F97316] hover:bg-[#EA580C] text-white text-[12.5px] font-semibold transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Add document
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        {cards.map((c) => (
          <button
            key={c.label}
            onClick={() => setFilter(c.f)}
            aria-pressed={filter === c.f}
            className={`text-left rounded-lg p-3 text-white transition-transform hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-[#F97316] ${filter === c.f ? "ring-2 ring-offset-1 ring-white/70" : ""}`}
            style={{ background: c.bg }}
          >
            <div className="text-[20px] font-extrabold leading-tight">{c.value}</div>
            <div className="text-[10.5px] text-white/85 mt-0.5">{c.label}</div>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-5 p-3 rounded-xl border border-black/[0.06] bg-white">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            aria-pressed={filter === f.id}
            className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border text-[11.5px] font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-[#F97316]/40 ${filter === f.id ? "border-[#1F2937] bg-[#1F2937] text-white" : "border-black/[0.08] text-[#374151] hover:bg-[#F8FAFC]"}`}
          >
            {f.label}
          </button>
        ))}
        <div className="flex-1 min-w-[180px] relative ml-auto">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#9CA3AF]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search documents…"
            aria-label="Search documents"
            className="w-full h-8 pl-8 pr-3 rounded-md bg-[#F3F4F6] text-[12px] focus:outline-none focus:ring-1 focus:ring-[#F97316]/30"
          />
        </div>
      </div>

      {isLoading ? (
        <SceneLoader scene="fleet" compact />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-black/[0.06] bg-white">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider text-[#9CA3AF] bg-[#FAFBFC]">
                <th className="px-4 py-3 font-semibold">Type</th>
                <th className="px-4 py-3 font-semibold">Linked to</th>
                <th className="px-4 py-3 font-semibold">Doc number</th>
                <th className="px-4 py-3 font-semibold">Issuer</th>
                <th className="px-4 py-3 font-semibold">Expiry</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {docs.map((d) => {
                const sc = STATUS_COLORS[d.status] ?? STATUS_COLORS.UNKNOWN!;
                const linked = truckName(d.truck_id) ?? driverName(d.driver_id) ?? "-";
                const busy = deletingId === d.id;
                return (
                  <tr key={d.id} className="border-t border-black/[0.04] hover:bg-[#FAFBFC]">
                    <td className="px-4 py-3 font-semibold text-[#1F2937]">{d.type.charAt(0) + d.type.slice(1).toLowerCase()}</td>
                    <td className="px-4 py-3 text-[#374151]">{linked}</td>
                    <td className="px-4 py-3 font-mono text-[#6B7280]">{d.doc_number ?? "-"}</td>
                    <td className="px-4 py-3 text-[#6B7280]">{d.issuer ?? "-"}</td>
                    <td className="px-4 py-3 text-[#374151]">{fmtDate(d.expiry_date)}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex px-1.5 py-0.5 rounded-md text-[10.5px] font-semibold" style={{ backgroundColor: sc.bg, color: sc.text }}>
                        {d.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => openEdit(d)}
                          className="p-1.5 rounded-md text-[#6B7280] hover:bg-[#F3F4F6] hover:text-[#1F2937] transition-colors"
                          aria-label={`Edit ${d.type}`}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => onDelete(d)}
                          disabled={busy}
                          className="p-1.5 rounded-md text-[#EF4444] hover:bg-[#FEF2F2] disabled:opacity-50 transition-colors"
                          aria-label={`Delete ${d.type}`}
                        >
                          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {docs.length === 0 && (
            <div className="py-16 text-center text-[#6B7280]">
              <FileText className="w-8 h-8 mx-auto mb-2 opacity-40" />
              {all.length === 0 ? (
                <div>
                  <div className="font-semibold text-[#1F2937]">No documents yet</div>
                  <div className="text-[12px] mt-1">Add insurance, RC, or permit records for your fleet.</div>
                </div>
              ) : (
                <div>No documents match your search or filter.</div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
