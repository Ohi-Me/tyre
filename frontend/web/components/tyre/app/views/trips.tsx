"use client";

import { useTrips, useStartTrip, useCompleteTrip } from "@/lib/api/queries/trips";
import { Route, Search, Download, ArrowRightLeft, Play, CheckCircle2, Loader2 } from "lucide-react";
import { SceneLoader } from "../loading/scene-loader";
import { useState } from "react";
import { toast } from "sonner";

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  PLANNED: { bg: "#F3F4F6", text: "#6B7280" },
  IN_PROGRESS: { bg: "#EFF6FF", text: "#3B82F6" },
  COMPLETED: { bg: "#ECFDF5", text: "#10B981" },
  CANCELLED: { bg: "#FEF2F2", text: "#EF4444" },
  LOADING: { bg: "#FFF7ED", text: "#F97316" },
  EN_ROUTE: { bg: "#EFF6FF", text: "#3B82F6" },
  UNLOADING: { bg: "#F5F3FF", text: "#8B5CF6" },
  DELIVERED: { bg: "#ECFDF5", text: "#10B981" },
};

type TripFilter = "ALL" | "PLANNED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
const FILTERS: { id: TripFilter; label: string }[] = [
  { id: "ALL", label: "All" },
  { id: "PLANNED", label: "Planned" },
  { id: "IN_PROGRESS", label: "Ongoing" },
  { id: "COMPLETED", label: "Completed" },
  { id: "CANCELLED", label: "Cancelled" },
];

function formatINR(n: number): string {
  return `₹${n.toLocaleString("en-IN")}`;
}

function exportCsv(rows: any[]) {
  const headers = ["Trip", "Origin", "Destination", "Truck", "Driver", "Status", "Rate", "Payment"];
  const body = rows.map((t) =>
    [t.load_code ?? t.id, t.origin ?? "", t.destination ?? "", t.truck_number ?? "", t.driver_name ?? "", t.status, t.rate ?? 0, t.payment_released ? "RELEASED" : "PENDING"]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(","),
  );
  const csv = [headers.join(","), ...body].join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `tyre-trips-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function TripsView() {
  const { data, isLoading } = useTrips();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<TripFilter>("ALL");
  const [actingId, setActingId] = useState<string | null>(null);
  const startTrip = useStartTrip();
  const completeTrip = useCompleteTrip();

  const all = data ?? [];
  const trips = all.filter((t) => {
    const okStatus = filter === "ALL" || t.status === filter;
    const okSearch = !search || `${t.load_code ?? ""} ${t.origin ?? ""} ${t.destination ?? ""} ${t.driver_name ?? ""}`.toLowerCase().includes(search.toLowerCase());
    return okStatus && okSearch;
  });
  const ongoing = all.filter((t) => ["PLANNED", "IN_PROGRESS"].includes(t.status)).length;
  const completed = all.filter((t) => t.status === "COMPLETED").length;
  const cancelled = all.filter((t) => t.status === "CANCELLED").length;

  function runStart(id: string) {
    setActingId(id);
    startTrip.mutate(id, {
      onSuccess: () => toast.success("Trip started - driver notified"),
      onError: (e: any) => toast.error(e?.message?.includes("403") ? "You do not have permission to start trips" : e?.message || "Could not start trip"),
      onSettled: () => setActingId(null),
    });
  }
  function runComplete(id: string) {
    setActingId(id);
    completeTrip.mutate(id, {
      onSuccess: () => toast.success("Trip completed - POD verified, balance released"),
      onError: (e: any) => toast.error(e?.message?.includes("403") ? "You do not have permission to complete trips" : e?.message || "Could not complete trip"),
      onSettled: () => setActingId(null),
    });
  }

  const cards = [
    { label: "All Trips", value: all.length, bg: "#10B981", f: "ALL" as TripFilter },
    { label: "Ongoing", value: ongoing, bg: "#3B82F6", f: "IN_PROGRESS" as TripFilter },
    { label: "Completed", value: completed, bg: "#10B981", f: "COMPLETED" as TripFilter },
    { label: "Cancelled", value: cancelled, bg: "#9CA3AF", f: "CANCELLED" as TripFilter },
  ];

  return (
    <div className="p-5 sm:p-6 max-w-[1600px] mx-auto">
      <div className="mb-5">
        <h1 className="text-[22px] font-extrabold tracking-tight text-[#1F2937]">Trips</h1>
        <p className="text-[12.5px] text-[#6B7280] mt-0.5">Track and manage all trips</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        {cards.map((c) => (
          <button key={c.label} onClick={() => setFilter(c.f)} aria-pressed={filter === c.f}
            className={`text-left rounded-lg p-3 text-white transition-transform hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-[#F97316] ${filter === c.f ? "ring-2 ring-offset-1 ring-white/70" : ""}`}
            style={{ background: c.bg }}>
            <div className="text-[20px] font-extrabold leading-tight">{c.value.toLocaleString("en-IN")}</div>
            <div className="text-[10.5px] text-white/85 mt-0.5">{c.label}</div>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-5 p-3 rounded-xl border border-black/[0.06] bg-white">
        {FILTERS.map((f) => (
          <button key={f.id} onClick={() => setFilter(f.id)} aria-pressed={filter === f.id}
            className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border text-[11.5px] font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-[#F97316]/40 ${filter === f.id ? "border-[#1F2937] bg-[#1F2937] text-white" : "border-black/[0.08] text-[#374151] hover:bg-[#F8FAFC]"}`}>
            {f.label}
          </button>
        ))}
        <div className="flex-1 min-w-[180px] relative ml-auto">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#9CA3AF]" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search trips..." aria-label="Search trips"
            className="w-full h-8 pl-8 pr-3 rounded-md bg-[#F3F4F6] text-[12px] focus:outline-none focus:ring-1 focus:ring-[#F97316]/30" />
        </div>
        <button onClick={() => trips.length ? exportCsv(trips) : toast.info("No trips to export")}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-black/[0.08] text-[11.5px] font-medium text-[#374151] hover:bg-[#F8FAFC] focus:outline-none focus:ring-2 focus:ring-[#F97316]/40">
          <Download className="w-3 h-3" /> Export
        </button>
      </div>

      {isLoading ? (
        <SceneLoader scene="trips" compact />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-black/[0.06] bg-white">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider text-[#9CA3AF] bg-[#FAFBFC]">
                <th className="px-4 py-3 font-semibold">Trip ID</th>
                <th className="px-4 py-3 font-semibold">Route</th>
                <th className="px-4 py-3 font-semibold">Truck</th>
                <th className="px-4 py-3 font-semibold">Driver</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold text-right">Rate</th>
                <th className="px-4 py-3 font-semibold">Payment</th>
                <th className="px-4 py-3 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {trips.map((t) => {
                const sc = (STATUS_COLORS[t.status] ?? STATUS_COLORS.PLANNED)!;
                const progress = t.status === "COMPLETED" ? 100 : t.status === "IN_PROGRESS" ? 60 : 0;
                const busy = actingId === t.id;
                return (
                  <tr key={t.id} className="border-t border-black/[0.04] hover:bg-[#FAFBFC]">
                    <td className="px-4 py-3 font-mono font-semibold text-[#1F2937]">{t.load_code ?? t.id.slice(0, 8)}</td>
                    <td className="px-4 py-3 text-[#374151]">
                      <div className="flex items-center gap-1"><span>{t.origin ?? "-"}</span><ArrowRightLeft className="w-3 h-3 text-[#9CA3AF]" /><span>{t.destination ?? "-"}</span></div>
                    </td>
                    <td className="px-4 py-3 font-mono text-[#374151]">{t.truck_number ?? "-"}</td>
                    <td className="px-4 py-3 text-[#374151]">{t.driver_name ?? "-"}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex px-1.5 py-0.5 rounded-md text-[10.5px] font-semibold" style={{ backgroundColor: sc.bg, color: sc.text }}>{t.status.replace(/_/g, " ")}</span>
                        <div className="w-16 h-1.5 rounded-full bg-[#F1F5F9] overflow-hidden"><div className="h-full" style={{ width: `${progress}%`, backgroundColor: sc.text }} /></div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-[#1F2937]">{formatINR(t.rate || 0)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-1.5 py-0.5 rounded-md text-[10.5px] font-semibold ${t.payment_released ? "bg-[#ECFDF5] text-[#10B981]" : "bg-[#FEF3C7] text-[#F59E0B]"}`}>{t.payment_released ? "RELEASED" : "PENDING"}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {t.status === "PLANNED" ? (
                        <button onClick={() => runStart(t.id)} disabled={busy}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-[#3B82F6] text-white text-[11px] font-semibold hover:bg-[#2563EB] disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-[#3B82F6]/40">
                          {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />} Start
                        </button>
                      ) : t.status === "IN_PROGRESS" ? (
                        <button onClick={() => runComplete(t.id)} disabled={busy}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-[#10B981] text-white text-[11px] font-semibold hover:bg-[#059669] disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-[#10B981]/40">
                          {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />} Complete
                        </button>
                      ) : (
                        <span className="text-[#9CA3AF]">-</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {trips.length === 0 && (
            <div className="py-16 text-center text-[#6B7280]">
              <Route className="w-8 h-8 mx-auto mb-2 opacity-40" />
              {all.length === 0 ? "No trips yet - assign a truck to a load to create one." : "No trips match your search or filter."}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
