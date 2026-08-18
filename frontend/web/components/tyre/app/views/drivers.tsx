"use client";

import { useDrivers } from "@/lib/api/queries/drivers";
import { useTyreUI } from "@/lib/tyre/store";
import { AddDriverDialog } from "./drivers/add-driver-dialog";
import { Users, Star, Phone, Plus, Search, Mic } from "lucide-react";
import { SceneLoader } from "../loading/scene-loader";
import { useState } from "react";
import { toast } from "sonner";

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  AVAILABLE: { bg: "#ECFDF5", text: "#10B981" },
  ON_TRIP: { bg: "#EFF6FF", text: "#3B82F6" },
  OFFLINE: { bg: "#F3F4F6", text: "#6B7280" },
};

type DriverFilter = "ALL" | "AVAILABLE" | "ON_TRIP" | "OFFLINE";
const FILTERS: { id: DriverFilter; label: string }[] = [
  { id: "ALL", label: "All Drivers" },
  { id: "AVAILABLE", label: "Active" },
  { id: "ON_TRIP", label: "On Trip" },
  { id: "OFFLINE", label: "Offline" },
];

export function DriversView() {
  const { data, isLoading } = useDrivers();
  const setAppView = useTyreUI((s) => s.setAppView);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<DriverFilter>("ALL");
  const [addOpen, setAddOpen] = useState(false);

  const all = data ?? [];
  const drivers = all.filter((d) => {
    const matchesStatus = filter === "ALL" || d.status === filter;
    const matchesSearch = !search || `${d.name} ${d.phone ?? ""}`.toLowerCase().includes(search.toLowerCase());
    return matchesStatus && matchesSearch;
  });
  const active = all.filter((d) => d.status === "AVAILABLE").length;
  const onTrip = all.filter((d) => d.status === "ON_TRIP").length;
  const inactive = all.filter((d) => d.status === "OFFLINE").length;

  function onboardByVoice() {
    toast.info("Onboard a driver by voice - no typing needed.");
    setAppView("voice");
  }

  const cards: { label: string; value: number; bg: string; f: DriverFilter }[] = [
    { label: "Total Drivers", value: all.length, bg: "#10B981", f: "ALL" },
    { label: "Active", value: active, bg: "#3B82F6", f: "AVAILABLE" },
    { label: "On Trip", value: onTrip, bg: "#F59E0B", f: "ON_TRIP" },
    { label: "Inactive", value: inactive, bg: "#9CA3AF", f: "OFFLINE" },
  ];

  return (
    <div className="p-5 sm:p-6 max-w-[1600px] mx-auto">
      <AddDriverDialog open={addOpen} onOpenChange={setAddOpen} />

      <div className="mb-5">
        <h1 className="text-[22px] font-extrabold tracking-tight text-[#1F2937]">Drivers</h1>
        <p className="text-[12.5px] text-[#6B7280] mt-0.5">Manage your drivers and their performance</p>
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
            placeholder="Search drivers..."
            aria-label="Search drivers"
            className="w-full h-8 pl-8 pr-3 rounded-md bg-[#F3F4F6] text-[12px] focus:outline-none focus:ring-1 focus:ring-[#F97316]/30"
          />
        </div>
        <button
          onClick={onboardByVoice}
          aria-label="Onboard a driver by voice"
          title="Onboard by voice"
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-black/[0.08] text-[#374151] text-[11.5px] font-medium hover:bg-[#F8FAFC] focus:outline-none focus:ring-2 focus:ring-[#F97316]/40"
        >
          <Mic className="w-3 h-3" /> Voice
        </button>
        <button
          onClick={() => setAddOpen(true)}
          aria-label="Add a driver"
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-[#1F2937] text-white text-[11.5px] font-semibold hover:bg-[#374151] focus:outline-none focus:ring-2 focus:ring-[#F97316]/40"
        >
          <Plus className="w-3 h-3" /> Add Driver
        </button>
      </div>

      {isLoading ? (
        <SceneLoader scene="drivers" compact />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-black/[0.06] bg-white">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider text-[#9CA3AF] bg-[#FAFBFC]">
                <th className="px-4 py-3 font-semibold">Driver</th>
                <th className="px-4 py-3 font-semibold">Contact</th>
                <th className="px-4 py-3 font-semibold text-right">Trips</th>
                <th className="px-4 py-3 font-semibold">Rating</th>
                <th className="px-4 py-3 font-semibold">Performance</th>
                <th className="px-4 py-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {drivers.map((d) => {
                const sc = (STATUS_COLORS[d.status] ?? STATUS_COLORS.OFFLINE)!;
                const initials = d.name.split(" ").map((n) => n[0]).join("").slice(0, 2);
                const performance = Math.round((d.rating / 5) * 100);
                return (
                  <tr key={d.id} className="border-t border-black/[0.04] hover:bg-[#FAFBFC]">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#F97316] to-[#FB923C] text-white text-[11px] font-bold flex items-center justify-center shrink-0">{initials}</div>
                        <span className="font-semibold text-[#1F2937]">{d.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[#6B7280]"><span className="inline-flex items-center gap-1"><Phone className="w-3 h-3" />{d.phone ?? "-"}</span></td>
                    <td className="px-4 py-3 text-right font-semibold text-[#1F2937]">{d.total_trips}</td>
                    <td className="px-4 py-3"><span className="inline-flex items-center gap-1"><Star className="w-3 h-3 text-[#F59E0B] fill-[#F59E0B]" /><span className="font-semibold text-[#1F2937]">{d.rating.toFixed(1)}</span></span></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 rounded-full bg-[#F1F5F9] overflow-hidden"><div className="h-full rounded-full bg-[#10B981]" style={{ width: `${performance}%` }} /></div>
                        <span className="text-[11px] text-[#6B7280]">{performance}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3"><span className="inline-flex px-1.5 py-0.5 rounded-md text-[10.5px] font-semibold" style={{ backgroundColor: sc.bg, color: sc.text }}>{d.status.replace(/_/g, " ")}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {drivers.length === 0 && (
            <div className="py-16 text-center text-[#6B7280]">
              <Users className="w-8 h-8 mx-auto mb-2 opacity-40" />
              {all.length === 0 ? (
                <div>
                  <div className="font-semibold text-[#1F2937]">No drivers yet</div>
                  <div className="text-[12px] mt-1">Add your first driver directly or onboard one by voice.</div>
                </div>
              ) : (
                <div>No drivers match your search or filter.</div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
