"use client";

/**
 * Diagonal ticker banner — the reference's rotated black strip, restyled
 * violet-on-ink. Two rows scroll in opposite directions; a real capability
 * list, not filler text.
 */
import { Marquee } from "./motion";
import { Dot } from "lucide-react";

const ROW_1 = [
  "Voice Booking",
  "Live GPS Tracking",
  "Instant UPI Settlement",
  "Return-Leg Marketplace",
  "GST Invoicing",
];
const ROW_2 = [
  "Fleet Management",
  "Driver Onboarding",
  "Fraud & GSTIN Checks",
  "Dispatch Automation",
  "49 Indian Languages",
];

function Row({ items }: { items: string[] }) {
  return (
    <span className="inline-flex items-center">
      {items.map((label) => (
        <span key={label} className="inline-flex items-center px-5 shrink-0">
          <span className="text-[18px] sm:text-[22px] font-extrabold tracking-tight text-[#F3F1E8]">{label}</span>
          <Dot className="w-6 h-6 text-[var(--tyre-violet-hot)] shrink-0" />
        </span>
      ))}
    </span>
  );
}

export function TickerBanner() {
  return (
    <div className="relative bg-background overflow-hidden py-8 sm:py-10">
      <div className="tyre-ticker-band bg-[#12100B] py-3.5 sm:py-4 space-y-2.5 sm:space-y-3">
        <Marquee>
          <Row items={ROW_1} />
        </Marquee>
        <Marquee reverse>
          <Row items={ROW_2} />
        </Marquee>
      </div>
    </div>
  );
}
