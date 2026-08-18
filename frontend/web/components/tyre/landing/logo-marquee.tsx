"use client";

/**
 * Trust marquee — honest logo strip. Not fabricated client logos (TYRE
 * doesn't have public case studies yet); instead the real rails the product
 * is built on, which is the truthful equivalent of "who trusts us."
 */
import { Marquee } from "./motion";
import { ShieldCheck, Landmark, Smartphone, FileCheck2, Radio } from "lucide-react";

const MARKS: { label: string; icon: typeof ShieldCheck }[] = [
  { label: "UPI Escrow", icon: Smartphone },
  { label: "FASTag Linked", icon: Radio },
  { label: "GST Invoicing", icon: FileCheck2 },
  { label: "RBI-Compliant Escrow", icon: Landmark },
  { label: "GSTIN Verified", icon: ShieldCheck },
];

export function LogoMarquee() {
  return (
    <div className="relative bg-background border-y border-[var(--border)] py-6 overflow-hidden">
      <div className="max-w-7xl mx-auto px-5 sm:px-8 mb-4">
        <p className="text-center font-mono text-[10.5px] uppercase tracking-[0.2em] text-[var(--muted-foreground)]">
          Built on India&apos;s trusted rails
        </p>
      </div>
      <Marquee>
        {MARKS.map((m) => (
          <span
            key={m.label}
            className="inline-flex items-center gap-2.5 px-8 shrink-0 text-[var(--muted-foreground)]"
          >
            <m.icon className="w-5 h-5 text-[var(--tyre-violet)]" />
            <span className="text-[15px] font-semibold tracking-tight text-[var(--tyre-ink)]">{m.label}</span>
          </span>
        ))}
      </Marquee>
      {/* fade edges */}
      <div className="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-background to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-background to-transparent" />
    </div>
  );
}
