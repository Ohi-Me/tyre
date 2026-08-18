"use client";

/**
 * NAV v4 — brand, section links, Pricing, Book a call, Get started.
 * An asphalt glass capsule that ducks away on scroll-down and glides back
 * on scroll-up. Section anchors give the reference's Home/Work/Services
 * parity without adding real routes. Accent is violet, matching the
 * marketing-page redesign (the authenticated app keeps its own accent).
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { useTyreUI } from "@/lib/tyre/store";
import { ArrowUpRight } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { LeadButton } from "./lead-dialog";

const EXPO = [0.19, 1, 0.22, 1] as const;

const LINKS = [
  { label: "Product", id: "product" },
  { label: "Marketplace", id: "trust" },
  { label: "FAQ", id: "faq" },
];

export function LandingNav() {
  const [hidden, setHidden] = useState(false);
  const { enterApp } = useTyreUI();
  const router = useRouter();
  const locale = useLocale();
  const reduce = useReducedMotion();

  useEffect(() => {
    let last = window.scrollY;
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const y = window.scrollY;
        if (y > 140 && y > last + 4) setHidden(true);
        else if (y < last - 4 || y <= 140) setHidden(false);
        last = y;
        ticking = false;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const scrollTo = (id: string) =>
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <motion.header
      animate={{ y: hidden ? -84 : 0 }}
      transition={{ duration: reduce ? 0 : 0.5, ease: EXPO }}
      className="fixed top-0 inset-x-0 z-50 px-3 sm:px-5 pt-3"
    >
      <div className="relative max-w-4xl mx-auto h-14 pl-5 pr-2 flex items-center justify-between gap-3 rounded-full bg-[rgba(12,11,8,0.82)] backdrop-blur-xl border border-[rgba(243,241,232,0.12)] text-[#F3F1E8] shadow-[0_12px_40px_-16px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,250,235,0.08)]">
        {/* Brand */}
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className="group flex items-start gap-[3px] shrink-0 tyre-focus rounded-full"
          aria-label="TYRE home"
        >
          <span className="tyre-display text-[19px] tracking-[-0.02em] leading-none text-[var(--tyre-violet-hot)]">
            TYRE
          </span>
          <span className="relative mt-[2px] flex h-[6px] w-[6px]">
            <span className="absolute inline-flex h-full w-full rounded-full bg-[var(--tyre-violet-hot)] opacity-70 animate-ping" />
            <span className="relative inline-flex rounded-full h-[6px] w-[6px] bg-[var(--tyre-violet-hot)]" />
          </span>
        </button>

        {/* Section links — desktop only */}
        <nav className="hidden md:flex items-center gap-1">
          {LINKS.map((l) => (
            <button
              key={l.id}
              onClick={() => scrollTo(l.id)}
              className="px-3.5 py-2 rounded-full text-[13px] font-medium text-[rgba(243,241,232,0.6)] hover:text-[#F3F1E8] hover:bg-[rgba(243,241,232,0.07)] transition-colors"
            >
              {l.label}
            </button>
          ))}
        </nav>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => router.push(`/${locale}/pricing`)}
            className="hidden sm:inline-flex px-4 py-2 rounded-full text-[13.5px] font-medium text-[rgba(243,241,232,0.65)] hover:text-[#F3F1E8] hover:bg-[rgba(243,241,232,0.07)] transition-colors"
          >
            Pricing
          </button>
          <LeadButton
            label="Book a call"
            variant="bare"
            className="hidden sm:inline-flex px-4 py-2 rounded-full text-[13px] font-semibold text-[rgba(243,241,232,0.75)] border border-[rgba(243,241,232,0.18)] hover:border-[var(--tyre-violet-hot)] hover:text-[var(--tyre-violet-hot)] transition-colors"
          />
          <button
            onClick={enterApp}
            className="group inline-flex items-center gap-1.5 rounded-full bg-[var(--tyre-violet)] pl-4 pr-3.5 py-2 text-[13px] font-bold text-white transition-all duration-200 hover:brightness-110 hover:shadow-[0_8px_24px_-8px_rgba(124,58,237,0.8)] active:scale-[0.97]"
          >
            Get started
            <ArrowUpRight className="w-3.5 h-3.5 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </button>
        </div>
      </div>
    </motion.header>
  );
}
