"use client";

/**
 * Marketplace — searchable freight vehicle marketplace (primary tab) plus the
 * live load board (secondary tab, consolidates the old Load Board view).
 */
import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  Package,
  Plus,
  Search,
  ShieldCheck,
  Star,
  Truck,
  Wallet,
} from "lucide-react";
import { SceneLoader } from "../loading/scene-loader";
import { useLoads } from "@/lib/api/queries/loads";
import {
  type FreightListing,
  useFreightListings,
  useFreightStats,
} from "@/lib/api/queries/freight";
import { useTyreUI } from "@/lib/tyre/store";
import { ListingCard, formatINR } from "./freight/listing-card";
import { BookDialog } from "./freight/book-dialog";
import { VEHICLE_TYPES } from "./freight/listing-form";

const FILTER_TYPES = ["All", ...VEHICLE_TYPES];

export function MarketplaceView() {
  const [tab, setTab] = useState<"freight" | "loads">("freight");

  return (
    <div className="p-5 sm:p-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-extrabold tracking-tight text-[#1F2937]">Marketplace</h1>
          <p className="text-[12.5px] text-[#6B7280] mt-0.5">
            Find freight vehicles, book directly, talk to the owner — no middlemen
          </p>
        </div>
        {/* Tab switch */}
        <div className="flex p-1 rounded-xl bg-[#F3F4F6]">
          {(
            [
              { id: "freight", label: "Freight vehicles", icon: Truck },
              { id: "loads", label: "Load board", icon: Package },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`relative inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[12.5px] font-semibold transition-colors ${
                tab === t.id ? "text-[#1F2937]" : "text-[#6B7280] hover:text-[#374151]"
              }`}
            >
              {tab === t.id && (
                <motion.span
                  layoutId="marketplace-tab"
                  className="absolute inset-0 rounded-lg bg-white shadow-sm"
                  transition={{ type: "spring", stiffness: 400, damping: 32 }}
                />
              )}
              <t.icon className="relative w-3.5 h-3.5" />
              <span className="relative">{t.label}</span>
            </button>
          ))}
        </div>
      </div>

      {tab === "freight" ? <FreightTab /> : <LoadsTab />}
    </div>
  );
}

/* ── Freight vehicles tab ─────────────────────────────────────────────────── */

function FreightTab() {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("All");
  const [booking, setBooking] = useState<FreightListing | null>(null);
  const { setAppView } = useTyreUI();

  const { data, isLoading, error } = useFreightListings({ q: search || undefined, vehicle_type: typeFilter });
  const { data: stats } = useFreightStats();

  const listings = data ?? [];

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center text-[14px] font-semibold text-red-600">
        Failed to load the marketplace — {(error as Error).message}
      </div>
    );
  }

  return (
    <>
      {/* Stats strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <StatTile value={stats?.listings.active ?? "—"} label="Vehicles available" tone="bg-[#10B981]" />
        <StatTile value={stats?.bookings.pending ?? "—"} label="Booking requests open" tone="bg-[#3B82F6]" />
        <StatTile value={stats?.bookings.completed ?? "—"} label="Trips completed" tone="bg-[#8B5CF6]" />
        <StatTile value={`₹${stats?.fee_inr ?? 49}`} label="Flat fee per accepted booking" tone="bg-[#1F2937]" />
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 mb-5 p-3 rounded-xl border border-black/[0.06] bg-white">
        {FILTER_TYPES.map((t) => (
          <button
            key={t}
            onClick={() => setTypeFilter(t)}
            className={`px-3 py-1.5 rounded-md text-[11.5px] font-medium transition-all active:scale-95 ${
              typeFilter === t ? "bg-[#1F2937] text-white" : "bg-[#F3F4F6] text-[#374151] hover:bg-[#E2E8F0]"
            }`}
          >
            {t}
          </button>
        ))}
        <div className="flex-1 min-w-[200px] relative ml-auto">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#9CA3AF]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search city, route, owner or vehicle number…"
            className="w-full h-9 pl-8 pr-3 rounded-md bg-[#F3F4F6] text-[12px] focus:outline-none focus:ring-1 focus:ring-[#F97316]/30"
          />
        </div>
        <button
          onClick={() => setAppView("my_freight")}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#F97316] text-white px-3.5 py-2 text-[12px] font-semibold hover:bg-[#EA580C] transition-all active:scale-[0.97]"
        >
          <Plus className="w-3.5 h-3.5" />
          List your freight
        </button>
      </div>

      {isLoading ? (
        <SceneLoader scene="marketplace" compact label="Freight arriving on the board" />
      ) : listings.length === 0 ? (
        <div className="text-center py-20 text-[#6B7280]">
          <Truck className="w-10 h-10 mx-auto mb-3 opacity-30" strokeWidth={1.5} />
          <div className="text-[14px] font-semibold text-[#374151]">No vehicles match</div>
          <p className="text-[12px] mt-1">Try a different search — or be the first to list yours.</p>
          <button
            onClick={() => setAppView("my_freight")}
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-[#1F2937] text-white px-4 py-2 text-[12.5px] font-semibold hover:bg-[#374151] transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            List your freight
          </button>
        </div>
      ) : (
        <motion.div layout className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
          <AnimatePresence mode="popLayout">
            {listings.map((l) => (
              <ListingCard key={l.id} listing={l} onBook={setBooking} />
            ))}
          </AnimatePresence>
        </motion.div>
      )}

      <BookDialog listing={booking} onOpenChange={(o) => !o && setBooking(null)} />
    </>
  );
}

function StatTile({ value, label, tone }: { value: string | number; label: string; tone: string }) {
  return (
    <div className={`rounded-xl p-3.5 text-white ${tone}`}>
      <div className="text-[20px] font-extrabold leading-tight tabular-nums">{value}</div>
      <div className="text-[10.5px] text-white/85 mt-0.5">{label}</div>
    </div>
  );
}

/* ── Load board tab (consolidated old Load Board / loads marketplace) ─────── */

const LOAD_TRUCK_TYPES = ["All", "Open", "Container", "Tipper", "Tanker", "Refrigerated"] as const;

function LoadsTab() {
  const { data, isLoading, error } = useLoads();
  const [truckFilter, setTruckFilter] = useState<(typeof LOAD_TRUCK_TYPES)[number]>("All");
  const [search, setSearch] = useState("");

  const filtered = useMemo(
    () =>
      (data ?? []).filter((l) => {
        if (truckFilter !== "All" && l.truck_type_req !== truckFilter) return false;
        if (search && !`${l.origin} ${l.destination} ${l.tyre_code}`.toLowerCase().includes(search.toLowerCase()))
          return false;
        return true;
      }),
    [data, truckFilter, search],
  );

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center text-[14px] font-semibold text-red-600">
        Failed to load the load board
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 mb-5 p-3 rounded-xl border border-black/[0.06] bg-white">
        {LOAD_TRUCK_TYPES.map((t) => (
          <button
            key={t}
            onClick={() => setTruckFilter(t)}
            className={`px-3 py-1.5 rounded-md text-[11.5px] font-medium transition-all ${
              truckFilter === t ? "bg-[#1F2937] text-white" : "bg-[#F3F4F6] text-[#374151] hover:bg-[#E2E8F0]"
            }`}
          >
            {t}
          </button>
        ))}
        <div className="flex-1 min-w-[180px] relative ml-auto">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#9CA3AF]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search loads…"
            className="w-full h-8 pl-8 pr-3 rounded-md bg-[#F3F4F6] text-[12px] focus:outline-none focus:ring-1 focus:ring-[#F97316]/30"
          />
        </div>
      </div>

      {isLoading ? (
        <SceneLoader scene="marketplace" compact label="Streaming open loads in" />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {filtered.map((l) => (
            <article
              key={l.id}
              className="rounded-xl border border-black/[0.06] bg-white p-4 hover:border-black/[0.14] hover:shadow-sm transition-all"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="font-mono text-[10.5px] text-[#9CA3AF]">{l.tyre_code}</div>
                <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[#ECFDF5]">
                  <ShieldCheck className="w-3 h-3 text-[#10B981]" />
                  <span className="text-[10.5px] font-semibold text-[#10B981]">
                    Trust {Math.round((l.broker_rating ?? 0) * 20)}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 mb-3">
                <div className="flex-1 text-[15px] font-bold text-[#1F2937] truncate">{l.origin}</div>
                <ArrowRight className="w-4 h-4 text-[#9CA3AF]" />
                <div className="flex-1 text-[15px] font-bold text-[#1F2937] truncate text-right">{l.destination}</div>
              </div>
              <div className="grid grid-cols-3 gap-2 py-2.5 border-y border-black/[0.05] mb-3 text-center">
                <div>
                  <div className="text-[9.5px] uppercase tracking-wider text-[#9CA3AF]">Distance</div>
                  <div className="text-[12px] font-semibold text-[#1F2937]">{l.distance_km} km</div>
                </div>
                <div>
                  <div className="text-[9.5px] uppercase tracking-wider text-[#9CA3AF]">Truck</div>
                  <div className="text-[12px] font-semibold text-[#1F2937]">{l.truck_type_req}</div>
                </div>
                <div>
                  <div className="text-[9.5px] uppercase tracking-wider text-[#9CA3AF]">Weight</div>
                  <div className="text-[12px] font-semibold text-[#1F2937]">{l.weight_tons} T</div>
                </div>
              </div>
              <div className="flex items-end justify-between">
                <div>
                  <div className="text-[22px] font-extrabold text-[#1F2937]">{formatINR(l.offered_rate)}</div>
                  <div className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-md bg-[#1F2937] text-white text-[10.5px] font-semibold">
                    <Wallet className="w-2.5 h-2.5" />
                    {formatINR(l.advance_offered)} advance
                  </div>
                </div>
                {l.broker_phone && (
                  <a
                    href={`tel:${l.broker_phone}`}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#F97316] text-white px-4 py-2 text-[12.5px] font-semibold hover:bg-[#EA580C] transition-colors"
                  >
                    Contact broker
                  </a>
                )}
              </div>
              <div className="mt-3 pt-3 border-t border-black/[0.05] flex items-center gap-2">
                <div className="w-6 h-6 rounded-md bg-[#F3F4F6] flex items-center justify-center text-[10px] font-bold text-[#374151]">
                  {l.broker_name.slice(0, 1)}
                </div>
                <div className="text-[11.5px] text-[#374151] truncate flex-1">{l.broker_name}</div>
                <div className="flex items-center gap-0.5">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Star
                      key={i}
                      className={`w-2.5 h-2.5 ${
                        i <= Math.round(l.broker_rating ?? 0) ? "text-[#F97316] fill-[#F97316]" : "text-[#E5E7EB]"
                      }`}
                    />
                  ))}
                </div>
              </div>
            </article>
          ))}
          {filtered.length === 0 && (
            <div className="col-span-full text-center py-20 text-[#6B7280]">
              <Package className="w-8 h-8 mx-auto mb-3 opacity-40" />
              <div className="text-[14px] font-semibold">No loads available</div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
