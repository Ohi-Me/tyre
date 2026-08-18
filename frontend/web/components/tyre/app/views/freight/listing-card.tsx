"use client";

/**
 * Freight listing card — the marketplace's hero unit.
 * Photo header with gradient scrim, vehicle spec chips, rate block and a
 * lister strip with direct-call + book actions.
 */
import { type FreightListing } from "@/lib/api/queries/freight";
import { motion } from "framer-motion";
import { ArrowRight, Gauge, MapPin, Phone, Truck, Weight } from "lucide-react";

export function formatINR(n: number): string {
  return `₹${n.toLocaleString("en-IN")}`;
}

const STATUS_META: Record<FreightListing["status"], { label: string; cls: string }> = {
  ACTIVE: { label: "Available", cls: "bg-[#ECFDF5] text-[#059669]" },
  BOOKED: { label: "Booked", cls: "bg-[#FEF3C7] text-[#B45309]" },
  PAUSED: { label: "Paused", cls: "bg-[#F3F4F6] text-[#6B7280]" },
};

const TYPE_GRADIENT: Record<string, string> = {
  Open: "from-[#F97316] to-[#FDBA74]",
  Container: "from-[#3B82F6] to-[#93C5FD]",
  Tipper: "from-[#8B5CF6] to-[#C4B5FD]",
  Tanker: "from-[#0EA5E9] to-[#7DD3FC]",
  Refrigerated: "from-[#06B6D4] to-[#67E8F9]",
  Trailer: "from-[#10B981] to-[#6EE7B7]",
};

export function ListingCard({
  listing: l,
  onBook,
}: {
  listing: FreightListing;
  onBook: (l: FreightListing) => void;
}) {
  const status = STATUS_META[l.status];
  const canBook = l.status === "ACTIVE" && !l.is_mine;

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -4 }}
      className="group rounded-2xl border border-black/[0.06] bg-white overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.04)] hover:shadow-[0_16px_40px_-16px_rgba(0,0,0,0.18)] transition-shadow"
    >
      {/* Photo header */}
      <div className="relative h-40 overflow-hidden">
        {l.photo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={l.photo_url}
            alt={l.vehicle_number}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.05]"
          />
        ) : (
          <div className={`w-full h-full bg-gradient-to-br ${TYPE_GRADIENT[l.vehicle_type] ?? "from-[#F97316] to-[#FDBA74]"} grid place-items-center`}>
            <Truck className="w-12 h-12 text-white/70" strokeWidth={1.5} />
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/55 to-transparent" />
        {/* status + code */}
        <span className={`absolute top-3 left-3 px-2 py-0.5 rounded-full text-[10.5px] font-bold ${status.cls}`}>
          {status.label}
        </span>
        {l.is_mine && (
          <span className="absolute top-3 right-3 px-2 py-0.5 rounded-full bg-[#1F2937] text-white text-[10px] font-bold">
            Your listing
          </span>
        )}
        <div className="absolute bottom-2.5 left-3 right-3 flex items-end justify-between">
          <div>
            <div className="text-white font-extrabold text-[16px] tracking-tight leading-none drop-shadow">
              {l.vehicle_number}
            </div>
            <div className="text-white/80 text-[11px] mt-1 font-mono">{l.code}</div>
          </div>
          <span className="px-2 py-0.5 rounded-md bg-white/20 backdrop-blur text-white text-[10.5px] font-semibold">
            {l.vehicle_type}
          </span>
        </div>
      </div>

      {/* Body */}
      <div className="p-4">
        {/* Route */}
        <div className="flex items-center gap-1.5 text-[13.5px] font-bold text-[#1F2937]">
          <MapPin className="w-3.5 h-3.5 text-[#F97316] shrink-0" />
          <span className="truncate">{l.origin}</span>
          {l.destination && (
            <>
              <ArrowRight className="w-3.5 h-3.5 text-[#9CA3AF] shrink-0" />
              <span className="truncate">{l.destination}</span>
            </>
          )}
        </div>

        {/* Spec chips */}
        <div className="flex flex-wrap gap-1.5 mt-2.5">
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-[#F3F4F6] text-[11px] font-medium text-[#374151]">
            <Weight className="w-3 h-3 text-[#6B7280]" />
            {l.capacity_tons} T capacity
          </span>
          {l.rate_per_km != null && (
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-[#F3F4F6] text-[11px] font-medium text-[#374151]">
              <Gauge className="w-3 h-3 text-[#6B7280]" />
              ₹{l.rate_per_km}/km
            </span>
          )}
        </div>

        {l.description && (
          <p className="text-[11.5px] text-[#6B7280] mt-2.5 line-clamp-2 leading-relaxed">{l.description}</p>
        )}

        {/* Rate + owner strip */}
        <div className="flex items-end justify-between mt-3 pt-3 border-t border-black/[0.05]">
          <div className="min-w-0">
            {l.expected_rate != null ? (
              <>
                <div className="text-[18px] font-extrabold text-[#1F2937] leading-none">
                  {formatINR(l.expected_rate)}
                </div>
                <div className="text-[10px] text-[#9CA3AF] mt-1">expected / trip</div>
              </>
            ) : (
              <div className="text-[12px] font-semibold text-[#6B7280]">Rate on call</div>
            )}
            <div className="text-[11.5px] text-[#374151] font-medium mt-1.5 truncate">{l.owner_name}</div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <a
              href={`tel:${l.phone}`}
              aria-label={`Call ${l.owner_name}`}
              className="grid place-items-center w-9 h-9 rounded-xl bg-[#ECFDF5] text-[#059669] hover:bg-[#D1FAE5] transition-all active:scale-95"
            >
              <Phone className="w-4 h-4" />
            </a>
            {canBook && (
              <button
                onClick={() => onBook(l)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#F97316] text-white px-3.5 py-2 text-[12.5px] font-semibold hover:bg-[#EA580C] transition-all active:scale-[0.97]"
              >
                Book
                <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </motion.article>
  );
}
