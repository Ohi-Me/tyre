"use client";

import { useState } from "react";
import { useTrips } from "@/lib/api/queries/trips";
import { useLoads } from "@/lib/api/queries/loads";
import { useAgentActivity, type AgentEvent } from "@/lib/api/queries/agents";
import { useTyreUI } from "@/lib/tyre/store";
import { AssignDialog } from "./dispatch/assign-dialog";
import {
  Radio,
  Truck,
  Bot,
  ChevronRight,
  Activity,
  CheckCircle2,
  Loader2,
  AlertCircle,
  Package,
  ArrowRight,
} from "lucide-react";
import { SceneLoader } from "../loading/scene-loader";

function formatINR(n: number): string {
  return `₹${(Number.isFinite(n) ? n : 0).toLocaleString("en-IN")}`;
}

function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const s = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// Map backend Trip.status -> the visual tone keys the TripCard understands.
function toneKey(status: string): string {
  switch (status) {
    case "PLANNED":
    case "LOADING":
      return "loading";
    case "IN_PROGRESS":
    case "IN_TRANSIT":
      return "in_transit";
    case "UNLOADING":
      return "unloading";
    case "COMPLETED":
    case "DELIVERED":
      return "delivered";
    default:
      return status.toLowerCase();
  }
}

// Turn an AgentLog payload into a one-line human detail without assuming a schema.
function summarizePayload(p: Record<string, unknown>): string {
  if (!p || typeof p !== "object") return "";
  const bits: string[] = [];
  if (p.loadId) bits.push(String(p.loadId));
  if (p.truckId) bits.push(`-> ${p.truckId}`);
  if (p.advance) bits.push(`advance ${formatINR(Number(p.advance))}`);
  if (p.amount) bits.push(formatINR(Number(p.amount)));
  if (p.error) bits.push(String(p.error));
  return bits.join(" · ");
}

const AGENTS = [
  { name: "Dispatch", role: "Load -> truck match", color: "#8FE03A" },
  { name: "Pricing", role: "Lane rate engine", color: "#FF6A2B" },
  { name: "Fraud", role: "GSTIN + broker verify", color: "#FFB74D" },
  { name: "Payment", role: "UPI escrow + advance", color: "#14B8A6" },
  { name: "Trust", role: "Score + penalties", color: "#6366F1" },
];

const STATUS_META = {
  success: { icon: CheckCircle2, color: "#14B8A6", label: "Done" },
  running: { icon: Loader2, color: "#FF6A2B", label: "Running" },
  review: { icon: AlertCircle, color: "#FFB74D", label: "Review" },
} as const;

function isUnassigned(l: any) {
  return !["ASSIGNED", "IN_TRANSIT", "DELIVERED", "CANCELLED"].includes(l.status);
}

export function DispatchView() {
  const setAppView = useTyreUI((s) => s.setAppView);
  const { data: trips, isLoading } = useTrips({ status: "IN_PROGRESS" });
  const { data: loads } = useLoads();
  const { data: activity, isLoading: activityLoading } = useAgentActivity();
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignLoadId, setAssignLoadId] = useState<string | null>(null);

  const TRIPS = (trips ?? []).map((t: any) => ({
    id: t.load_code || t.id,
    status: toneKey(t.status),
    startedAt: timeAgo(t.start_time),
    origin: t.origin ?? "—",
    destination: t.destination ?? "—",
    progress: t.status === "COMPLETED" || t.status === "DELIVERED" ? 1 : t.status === "IN_PROGRESS" ? 0.5 : 0.1,
    inTransit: t.status === "IN_PROGRESS" || t.status === "IN_TRANSIT",
    driver: t.driver_name ?? "—",
    truckNo: t.truck_number ?? "—",
    paymentHeld: t.payment_released ? 0 : t.balance ?? 0,
  }));

  const ACTIVITY = (activity ?? []).map((a: AgentEvent) => ({
    id: a.id,
    agent: a.agent_name,
    action: a.event_type,
    detail: summarizePayload(a.payload),
    latencyMs: a.latency_ms,
    timestamp: timeAgo(a.timestamp),
    status: a.success ? "success" : "review",
  }));

  const openLoads = (loads ?? []).filter(isUnassigned);

  const latencies = ACTIVITY.map((a) => a.latencyMs).filter((n) => Number.isFinite(n)).sort((x, y) => x - y);
  const p50 = latencies.length ? latencies[Math.floor(latencies.length / 2)] : null;

  function openAssign(loadId?: string) {
    setAssignLoadId(loadId ?? null);
    setAssignOpen(true);
  }

  if (isLoading) {
    return (
      <div className="p-5 sm:p-8 max-w-7xl mx-auto">
        <SceneLoader scene="dispatch" />
      </div>
    );
  }

  return (
    <div className="p-5 sm:p-8 max-w-7xl mx-auto">
      <AssignDialog open={assignOpen} onOpenChange={setAssignOpen} initialLoadId={assignLoadId} />

      <div className="mb-7 flex items-start justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <h1 className="text-[26px] font-extrabold tracking-[-0.03em] text-[#181410]">Live dispatch</h1>
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[#EBFBD6] border border-[#EBFBD6]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#FF6A2B] tyre-pulse-dot" />
              <span className="text-[10.5px] font-semibold uppercase tracking-wider text-[#8FE03A]">Live</span>
            </span>
          </div>
          <p className="text-[13.5px] text-[#71717A]">
            {TRIPS.length} active {TRIPS.length === 1 ? "trip" : "trips"} · {openLoads.length} open{" "}
            {openLoads.length === 1 ? "load" : "loads"} · {AGENTS.length} agents online
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="tyre-btn-secondary"
            onClick={() => openAssign()}
            disabled={openLoads.length === 0}
            title={openLoads.length === 0 ? "No open loads to assign" : "Assign a truck to a load"}
          >
            <Truck className="w-3.5 h-3.5" />
            Assign truck
          </button>
          <button className="tyre-btn-primary" onClick={() => setAppView("marketplace")}>
            <Radio className="w-3.5 h-3.5" />
            Dispatch new load
          </button>
        </div>
      </div>

      {openLoads.length > 0 && (
        <div className="rounded-2xl border border-black/[0.06] bg-white p-5 mb-5">
          <div className="flex items-center justify-between mb-3">
            <div className="text-[13px] font-semibold text-[#181410] flex items-center gap-2">
              <Package className="w-4 h-4 text-[#FF6A2B]" />
              Awaiting dispatch
            </div>
            <div className="text-[11px] text-[#71717A]">{openLoads.length} unassigned</div>
          </div>
          <div className="space-y-2">
            {openLoads.slice(0, 5).map((l: any) => (
              <div
                key={l.id}
                className="flex items-center justify-between gap-3 p-3 rounded-xl border border-black/[0.05] hover:border-black/[0.12] transition-colors"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="font-mono text-[10.5px] text-[#a1a1aa] shrink-0">{l.tyre_code}</span>
                  <div className="flex items-center gap-1.5 text-[12.5px] font-semibold text-[#181410] min-w-0">
                    <span className="truncate">{l.origin}</span>
                    <ArrowRight className="w-3 h-3 text-[#a1a1aa] shrink-0" />
                    <span className="truncate">{l.destination}</span>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-[11.5px] font-semibold text-[#181410]">{formatINR(l.offered_rate)}</span>
                  <button
                    onClick={() => openAssign(l.id)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-[#181410] text-white text-[11px] font-semibold hover:bg-[#181410]/85 transition-colors"
                  >
                    Assign
                  </button>
                </div>
              </div>
            ))}
          </div>
          {openLoads.length > 5 && (
            <button
              onClick={() => setAppView("marketplace")}
              className="mt-3 text-[11.5px] font-medium text-[#71717A] hover:text-[#181410] cursor-pointer flex items-center gap-1"
            >
              View {openLoads.length - 5} more <ChevronRight className="w-3 h-3" />
            </button>
          )}
        </div>
      )}

      <div className="rounded-2xl border border-black/[0.06] bg-white p-5 mb-5">
        <div className="flex items-center justify-between mb-4">
          <div className="text-[13px] font-semibold text-[#181410] flex items-center gap-2">
            <Bot className="w-4 h-4 text-[#8FE03A]" />
            Agent pipeline
          </div>
          <div className="text-[11px] text-[#71717A]">
            {AGENTS.length}/{AGENTS.length} healthy{p50 !== null ? ` · p50 latency ${p50}ms` : ""}
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {AGENTS.map((a, i) => (
            <div key={a.name} className="relative rounded-xl border border-black/[0.06] bg-[#FAFAFA] p-3.5">
              <div className="flex items-center justify-between mb-1.5">
                <div
                  className="w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-bold text-white"
                  style={{ background: a.color }}
                >
                  {a.name[0]}
                </div>
                <span className="text-[9.5px] font-mono text-[#a1a1aa]">0{i + 1}</span>
              </div>
              <div className="text-[12.5px] font-semibold text-[#181410]">{a.name}</div>
              <div className="text-[10.5px] text-[#71717A] mt-0.5 leading-tight">{a.role}</div>
              <div className="flex items-center gap-1 mt-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[#14B8A6] tyre-pulse-dot" />
                <span className="text-[9.5px] uppercase font-semibold tracking-wider text-[#14B8A6]">Active</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-3">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-[14px] font-semibold text-[#181410] flex items-center gap-2">
              <Truck className="w-4 h-4 text-[#71717A]" />
              Active trips
            </h2>
            <button
              onClick={() => setAppView("trips")}
              className="text-[11.5px] font-medium text-[#71717A] hover:text-[#181410] cursor-pointer flex items-center gap-1"
            >
              View all <ChevronRight className="w-3 h-3" />
            </button>
          </div>
          {TRIPS.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-black/[0.12] bg-white p-8 text-center">
              <Truck className="w-6 h-6 text-[#a1a1aa] mx-auto mb-2" />
              <div className="text-[13px] font-semibold text-[#181410]">No active trips</div>
              <div className="text-[12px] text-[#71717A] mt-1">
                Assign a truck to a load from the marketplace to start dispatching.
              </div>
              <button onClick={() => setAppView("marketplace")} className="tyre-btn-primary mt-4 inline-flex">
                <Radio className="w-3.5 h-3.5" />
                Dispatch new load
              </button>
            </div>
          ) : (
            TRIPS.map((trip: any) => <TripCard key={trip.id} trip={trip} />)
          )}
        </div>

        <div className="space-y-3">
          <h2 className="text-[14px] font-semibold text-[#181410] flex items-center gap-2">
            <Activity className="w-4 h-4 text-[#71717A]" />
            Agent activity
          </h2>
          <div className="rounded-2xl border border-black/[0.06] bg-white overflow-hidden">
            {activityLoading ? (
              <div className="px-4 py-6 flex items-center justify-center text-[#a1a1aa]">
                <Loader2 className="w-4 h-4 animate-spin" />
              </div>
            ) : ACTIVITY.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <Bot className="w-5 h-5 text-[#a1a1aa] mx-auto mb-2" />
                <div className="text-[12px] font-semibold text-[#181410]">No agent activity yet</div>
                <div className="text-[11px] text-[#71717A] mt-1">
                  Events appear here as agents assign loads, price lanes, and release escrow.
                </div>
              </div>
            ) : (
              ACTIVITY.map((a, i) => {
                const meta = (STATUS_META as any)[a.status] || STATUS_META.review;
                return (
                  <div
                    key={a.id}
                    className={`px-4 py-3 ${i !== 0 ? "border-t border-black/[0.06]" : ""} hover:bg-[#FAFAFA] transition-colors`}
                  >
                    <div className="flex items-start gap-2.5">
                      <meta.icon
                        className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${a.status === "running" ? "animate-spin" : ""}`}
                        style={{ color: meta.color }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-[10px] font-mono uppercase tracking-wider text-[#a1a1aa]">{a.agent}</div>
                          <div className="text-[9.5px] font-mono text-[#a1a1aa]">{a.latencyMs}ms</div>
                        </div>
                        <div className="text-[12px] font-semibold text-[#181410] mt-0.5 leading-snug">{a.action}</div>
                        {a.detail ? (
                          <div className="text-[11px] text-[#71717A] mt-0.5 leading-snug truncate">{a.detail}</div>
                        ) : null}
                        <div className="text-[10px] text-[#a1a1aa] mt-1">{a.timestamp}</div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function TripCard({ trip }: { trip: any }) {
  const statusTone: Record<string, { bg: string; fg: string; label: string }> = {
    loading: { bg: "#FFF8E1", fg: "#FF8F00", label: "Loading" },
    in_transit: { bg: "#EBFBD6", fg: "#8FE03A", label: "In transit" },
    unloading: { bg: "#E0F2FE", fg: "#0284C7", label: "Unloading" },
    delivered: { bg: "#DCFCE7", fg: "#16A34A", label: "Delivered" },
  };
  const tone = statusTone[trip.status] ?? { bg: "#F4F4F5", fg: "#71717A", label: trip.status };

  return (
    <article className="rounded-2xl border border-black/[0.06] bg-white p-4 hover:border-black/[0.12] transition-colors">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10.5px] text-[#a1a1aa]">{trip.id}</span>
          <span
            className="px-2 py-0.5 rounded-full text-[10px] font-semibold"
            style={{ background: tone.bg, color: tone.fg }}
          >
            {tone.label}
          </span>
        </div>
        <div className="text-[10.5px] text-[#71717A]">Started {trip.startedAt}</div>
      </div>

      <div className="flex items-center gap-3 mb-3">
        <div className="text-[14px] font-bold text-[#181410]">{trip.origin}</div>
        <div className="relative flex-1 h-1 bg-[#F4F4F5] rounded-full overflow-hidden">
          <div
            className="absolute inset-y-0 left-0 tyre-bg-gradient rounded-full"
            style={{ width: `${trip.progress * 100}%` }}
          />
        </div>
        <div className="text-[14px] font-bold text-[#181410]">{trip.destination}</div>
      </div>

      <div className="grid grid-cols-4 gap-3 text-[11px]">
        <div>
          <div className="text-[#a1a1aa] uppercase tracking-wider text-[9.5px]">Driver</div>
          <div className="font-semibold text-[#181410] mt-0.5 truncate">{trip.driver}</div>
        </div>
        <div>
          <div className="text-[#a1a1aa] uppercase tracking-wider text-[9.5px]">Truck</div>
          <div className="font-mono font-semibold text-[#181410] mt-0.5">{trip.truckNo}</div>
        </div>
        <div>
          <div className="text-[#a1a1aa] uppercase tracking-wider text-[9.5px]">Status</div>
          <div className="font-semibold text-[#181410] mt-0.5">{trip.inTransit ? "En route" : tone.label}</div>
        </div>
        <div>
          <div className="text-[#a1a1aa] uppercase tracking-wider text-[9.5px]">Held in escrow</div>
          <div className="font-semibold text-[#181410] mt-0.5">{formatINR(trip.paymentHeld)}</div>
        </div>
      </div>
    </article>
  );
}
