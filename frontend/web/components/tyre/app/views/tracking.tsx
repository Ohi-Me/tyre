"use client";

import { useTrips } from "@/lib/api/queries/trips";
import {
  MapPin,
  Truck,
  Navigation,
  Clock,
  Fuel,
  CheckCircle2,
  Circle,
  Loader2,
} from "lucide-react";
import { SceneLoader } from "../loading/scene-loader";

function formatINR(n: number): string {
  return `₹${n.toLocaleString("en-IN")}`;
}

export function TrackingView() {
  const { data, isLoading, error } = useTrips();
  // useTrips returns Trip[] directly (not {trips: [...]}), so `data` IS the array.
  const trips = data ?? [];
  const activeTrip = trips[0];

  if (error) {
    return (
      <div className="p-5 sm:p-8 max-w-7xl mx-auto">
        <div className="text-center py-20 text-[#71717A]">
          <div className="text-[14px] font-semibold text-[#ef4444]">Failed to load trips</div>
          <div className="text-[12.5px] mt-1">{error.message}</div>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="p-5 sm:p-8 max-w-7xl mx-auto">
        <SceneLoader scene="tracking" />
      </div>
    );
  }

  if (!activeTrip) return null;

  return (
    <div className="p-5 sm:p-8 max-w-7xl mx-auto">
      <div className="mb-7">
        <h1 className="text-[26px] font-extrabold tracking-[-0.03em] text-[#181410] mb-2">
          Live tracking
        </h1>
        <p className="text-[13.5px] text-[#71717A]">
          GPS + FASTag + last-mile AI · {trips.length} trips in corridor
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Map column (span 2) */}
        <div className="lg:col-span-2 space-y-4">
          {/* Map mock */}
          <div className="relative rounded-2xl border border-black/[0.06] bg-white overflow-hidden h-[400px]">
            {/* Stylized map background */}
            <div
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(135deg, #FAFAFA 0%, #F4F4F5 100%)",
              }}
            >
              {/* Grid */}
              <div
                className="absolute inset-0 opacity-50"
                style={{
                  backgroundImage:
                    "linear-gradient(rgba(0,0,0,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.04) 1px, transparent 1px)",
                  backgroundSize: "32px 32px",
                }}
              />
              {/* "Roads" */}
              <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
                <path
                  d="M 80 320 Q 200 200, 350 280 T 700 120"
                  stroke="url(#roadGrad)"
                  strokeWidth="3"
                  fill="none"
                  strokeLinecap="round"
                  strokeDasharray="6 6"
                />
                <defs>
                  <linearGradient id="roadGrad" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#8FE03A" />
                    <stop offset="100%" stopColor="#FF6A2B" />
                  </linearGradient>
                </defs>
              </svg>

              {/* Origin pin */}
              <div className="absolute" style={{ left: "8%", top: "78%" }}>
                <div className="relative">
                  <div className="w-4 h-4 rounded-full bg-[#181410] border-2 border-white shadow-md" />
                  <div className="absolute top-6 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10.5px] font-semibold text-[#181410] bg-white/90 px-2 py-0.5 rounded-md shadow-sm">
                    {activeTrip.load_id}
                  </div>
                </div>
              </div>

              {/* Destination pin */}
              <div className="absolute" style={{ right: "8%", top: "22%" }}>
                <div className="relative">
                  <div className="w-4 h-4 rounded-full tyre-bg-gradient border-2 border-white shadow-md" />
                  <div className="absolute top-6 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10.5px] font-semibold text-[#181410] bg-white/90 px-2 py-0.5 rounded-md shadow-sm">
                    {activeTrip.truck_id}
                  </div>
                </div>
              </div>

              {/* Live truck marker */}
              <div
                className="absolute transition-all duration-1000"
                style={{ left: `${50}%`, top: `${50}%` }}
              >
                <div className="relative -translate-x-1/2 -translate-y-1/2">
                  <div className="w-9 h-9 rounded-full bg-white border-2 border-[#8FE03A] shadow-lg flex items-center justify-center">
                    <Truck className="w-4 h-4 text-[#8FE03A]" />
                  </div>
                  <div className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-[#14B8A6] border-2 border-white tyre-pulse-dot" />
                </div>
              </div>
            </div>

            {/* Map overlay info */}
            <div className="absolute top-4 left-4 right-4 flex items-center justify-between">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/95 backdrop-blur border border-black/[0.06] shadow-sm">
                <Navigation className="w-3 h-3 text-[#8FE03A]" />
                <span className="text-[11px] font-semibold text-[#181410]">
                  NH-19 · 87 km/h
                </span>
              </div>
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/95 backdrop-blur border border-black/[0.06] shadow-sm">
                <Fuel className="w-3 h-3 text-[#71717A]" />
                <span className="text-[11px] font-semibold text-[#181410]">
                  Diesel 62% · ₹4,800 to dest
                </span>
              </div>
            </div>
          </div>

          {/* Trip timeline */}
          <div className="rounded-2xl border border-black/[0.06] bg-white p-5">
            <h3 className="text-[13px] font-semibold text-[#181410] mb-4">
              Trip timeline · {activeTrip.id}
            </h3>
            <div className="space-y-4">
              {[
                { icon: CheckCircle2, label: "Load accepted + advance released", sub: "₹10,000 → vikas.y@upi · 47s after accept", tone: "ok", time: "2h 18m ago" },
                { icon: CheckCircle2, label: "Loading complete · Bilaspur yard", sub: "16 T cement bags · 24min load time", tone: "ok", time: "1h 50m ago" },
                { icon: CheckCircle2, label: "Departed Patna · FASTag ₹280", sub: "Sasaram toll plaza · auto-deducted", tone: "ok", time: "1h 44m ago" },
                { icon: Loader2, label: "In transit · NH-19 Aurangabad BR", sub: "437 km covered · 603 km to Delhi", tone: "active", time: "now" },
                { icon: Circle, label: "ETA Delhi unloading yard", sub: "Predicted 9h 0m · dock queue 22min", tone: "pending", time: "in 9h" },
                { icon: Circle, label: "Consignee WhatsApp confirm", sub: "1-tap → balance auto-release", tone: "pending", time: "after POD" },
                { icon: Circle, label: "Balance released · ₹32,000", sub: "GPS + consignee confirm triggers UPI", tone: "pending", time: "after confirm" },
              ].map((step, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className="relative flex flex-col items-center">
                    <step.icon
                      className={`w-4 h-4 ${
                        step.tone === "ok"
                          ? "text-[#14B8A6]"
                          : step.tone === "active"
                          ? "text-[#FF6A2B] animate-spin"
                          : "text-[#d4d4d8]"
                      }`}
                    />
                    {i < 6 && (
                      <div
                        className={`w-px h-6 mt-1 ${
                          step.tone === "ok" ? "bg-[#14B8A6]" : "bg-[#e4e4e7]"
                        }`}
                      />
                    )}
                  </div>
                  <div className="flex-1 pb-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-[12.5px] font-semibold text-[#181410]">
                        {step.label}
                      </div>
                      <div className="text-[10.5px] text-[#a1a1aa] font-mono">{step.time}</div>
                    </div>
                    <div className="text-[11.5px] text-[#71717A] mt-0.5">{step.sub}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right column: telemetry + trip list */}
        <div className="space-y-4">
          {/* Live telemetry */}
          <div className="rounded-2xl border border-black/[0.06] bg-white p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[13px] font-semibold text-[#181410]">Live telemetry</h3>
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#14B8A6] tyre-pulse-dot" />
                <span className="text-[10px] font-semibold uppercase tracking-wider text-[#14B8A6]">
                  Live
                </span>
              </div>
            </div>
            <div className="space-y-3">
              {[
                { label: "Distance covered", value: "—", sub: "GPS data unavailable" },
                { label: "Avg speed", value: "—", sub: "GPS data unavailable" },
                { label: "Diesel", value: "—", sub: "Fuel data unavailable" },
                { label: "FASTag balance", value: "—", sub: "FASTag not linked" },
                { label: "Held in escrow", value: formatINR(activeTrip.balance_released ?? activeTrip.balance ?? 0), sub: "Releases on POD" },
                { label: "Driver trust score", value: "—", sub: "Trust data unavailable" },
              ].map((m) => (
                <div key={m.label} className="flex items-center justify-between py-2 border-b border-black/[0.04] last:border-0">
                  <div>
                    <div className="text-[11.5px] text-[#71717A]">{m.label}</div>
                    <div className="text-[10px] text-[#a1a1aa]">{m.sub}</div>
                  </div>
                  <div className="text-[14px] font-bold text-[#181410] tabular-nums">
                    {m.value}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Other trips */}
          <div className="rounded-2xl border border-black/[0.06] bg-white p-5">
            <h3 className="text-[13px] font-semibold text-[#181410] mb-3">
              Other live trips
            </h3>
            <div className="space-y-2">
              {trips.slice(1).map((t: any) => (
                <div
                  key={t.id}
                  className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-[#FAFAFA] cursor-pointer"
                >
                  <div className="text-[10.5px] font-mono text-[#a1a1aa]">{t.id.slice(-4)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] font-semibold text-[#181410] truncate">
                      {t.origin} → {t.destination}
                    </div>
                    <div className="text-[10.5px] text-[#71717A]">{t.driver}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[11px] font-semibold text-[#181410]">
                      {Math.round(t.progress * 100)}%
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
