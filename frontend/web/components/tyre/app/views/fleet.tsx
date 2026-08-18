"use client";

import { useTrucks, useUpdateTruck } from "@/lib/api/queries/trucks";
import { Truck, Search, Wrench, RotateCcw, Loader2 } from "lucide-react";
import { SceneLoader } from "../loading/scene-loader";
import { useState } from "react";
import { toast } from "sonner";

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  IDLE: { bg: "#F3F4F6", text: "#6B7280" },
  LOADING: { bg: "#FFF7ED", text: "#F97316" },
  IN_TRANSIT: { bg: "#EFF6FF", text: "#3B82F6" },
  UNLOADING: { bg: "#F5F3FF", text: "#8B5CF6" },
  MAINTENANCE: { bg: "#FEF2F2", text: "#EF4444" },
};

const RUNNING = ["LOADING", "IN_TRANSIT", "UNLOADING"];
type FleetFilter = "ALL" | "RUNNING" | "IDLE" | "MAINTENANCE";
const FILTERS: { id: FleetFilter; label: string }[] = [
  { id: "ALL", label: "All Vehicles" },
  { id: "RUNNING", label: "Running" },
  { id: "IDLE", label: "Idle" },
  { id: "MAINTENANCE", label: "Maintenance" },
];

export function FleetView() {
  const { data, isLoading } = useTrucks();
  const updateTruck = useUpdateTruck();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FleetFilter>("ALL");
  const [actingId, setActingId] = useState<string | null>(null);

  const all = data ?? [];
  const matchesFilter = (status: string) =>
    filter === "ALL" || (filter === "RUNNING" ? RUNNING.includes(status) : status === filter);
  const trucks = all.filter((t) => {
    const okStatus = matchesFilter(t.status);
    const okSearch = !search || `${t.vehicle_number} ${t.truck_type ?? ""} ${t.current_location ?? ""}`.toLowerCase().includes(search.toLowerCase());
    return okStatus && okSearch;
  });
  const running = all.filter((t) => RUNNING.includes(t.status)).length;
  const maintenance = all.filter((t) => t.status === "MAINTENANCE").length;
  const idle = all.filter((t) => t.status === "IDLE").length;

  function toggleMaintenance(id: string, current: string) {
    const next = current === "MAINTENANCE" ? "IDLE" : "MAINTENANCE";
    setActingId(id);
    updateTruck.mutate(
      { id, status: next },
      {
        onSuccess: () => toast.success(next === "MAINTENANCE" ? "Vehicle moved to maintenance" : "Vehicle returned to service"),
        onError: (e: any) => toast.error(e?.message?.includes("403") ? "You do not have permission to manage vehicles" : e?.message || "Update failed"),
        onSettled: () => setActingId(null),
      },
    );
  }

  const cards: { label: string; value: number; bg: string; f: FleetFilter }[] = [
    { label: "Total Vehicles", value: all.length, bg: "#10B981", f: "ALL" },
    { label: "Running", value: running, bg: "#3B82F6", f: "RUNNING" },
    { label: "Maintenance", value: maintenance, bg: "#EF4444", f: "MAINTENANCE" },
    { label: "Idle", value: idle, bg: "#F59E0B", f: "IDLE" },
  ];

  return (
    <div className="p-5 sm:p-6 max-w-[1600px] mx-auto">
      <div className="mb-5">
        <h1 className="text-[22px] font-extrabold tracking-tight text-[#1F2937]">Fleet</h1>
        <p className="text-[12.5px] text-[#6B7280] mt-0.5">Manage and monitor your entire fleet</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        {cards.map((c) => (
          <button key={c.label} onClick={() => setFilter(c.f)} aria-pressed={filter === c.f}
            className={`text-left rounded-lg p-3 text-white transition-transform hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-[#F97316] ${filter === c.f ? "ring-2 ring-offset-1 ring-white/70" : ""}`}
            style={{ background: c.bg }}>
            <div className="text-[20px] font-extrabold leading-tight">{c.value}</div>
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
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search vehicles..." aria-label="Search vehicles"
            className="w-full h-8 pl-8 pr-3 rounded-md bg-[#F3F4F6] text-[12px] focus:outline-none focus:ring-1 focus:ring-[#F97316]/30" />
        </div>
      </div>

      {isLoading ? (
        <SceneLoader scene="fleet" compact />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-black/[0.06] bg-white">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider text-[#9CA3AF] bg-[#FAFBFC]">
                <th className="px-4 py-3 font-semibold">Vehicle No.</th>
                <th className="px-4 py-3 font-semibold">Type</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Location</th>
                <th className="px-4 py-3 font-semibold text-right">Today km</th>
                <th className="px-4 py-3 font-semibold text-right">Month km</th>
                <th className="px-4 py-3 font-semibold text-right">Utilization</th>
                <th className="px-4 py-3 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {trucks.map((t) => {
                const sc = (STATUS_COLORS[t.status] ?? STATUS_COLORS.IDLE)!;
                const busy = actingId === t.id;
                const toggleable = t.status === "IDLE" || t.status === "MAINTENANCE";
                return (
                  <tr key={t.id} className="border-t border-black/[0.04] hover:bg-[#FAFBFC]">
                    <td className="px-4 py-3 font-mono font-semibold text-[#1F2937]">{t.vehicle_number}</td>
                    <td className="px-4 py-3 text-[#374151]">{t.truck_type ?? "-"}</td>
                    <td className="px-4 py-3"><span className="inline-flex px-1.5 py-0.5 rounded-md text-[10.5px] font-semibold" style={{ backgroundColor: sc.bg, color: sc.text }}>{t.status.replace(/_/g, " ")}</span></td>
                    <td className="px-4 py-3 text-[#6B7280]">{t.current_location ?? "-"}</td>
                    <td className="px-4 py-3 text-right font-semibold text-[#1F2937]">{t.todays_km}</td>
                    <td className="px-4 py-3 text-right font-semibold text-[#1F2937]">{t.total_km_this_month.toLocaleString("en-IN")}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-16 h-1.5 rounded-full bg-[#F1F5F9] overflow-hidden"><div className="h-full bg-[#F97316]" style={{ width: `${t.utilization_pct}%` }} /></div>
                        <span className="text-[11px] font-semibold text-[#374151] w-8 text-right">{t.utilization_pct}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {toggleable ? (
                        <button onClick={() => toggleMaintenance(t.id, t.status)} disabled={busy}
                          className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold disabled:opacity-60 focus:outline-none focus:ring-2 ${t.status === "MAINTENANCE" ? "bg-[#10B981] text-white hover:bg-[#059669] focus:ring-[#10B981]/40" : "border border-[#EF4444]/30 text-[#EF4444] hover:bg-[#FEF2F2] focus:ring-[#EF4444]/40"}`}>
                          {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : t.status === "MAINTENANCE" ? <RotateCcw className="w-3 h-3" /> : <Wrench className="w-3 h-3" />}
                          {t.status === "MAINTENANCE" ? "Return" : "Maintenance"}
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
          {trucks.length === 0 && (
            <div className="py-16 text-center text-[#6B7280]">
              <Truck className="w-8 h-8 mx-auto mb-2 opacity-40" />
              {all.length === 0 ? (
                <div><div className="font-semibold text-[#1F2937]">No vehicles yet</div><div className="text-[12px] mt-1">Vehicles are added during driver voice onboarding.</div></div>
              ) : (
                <div>No vehicles match your search or filter.</div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
