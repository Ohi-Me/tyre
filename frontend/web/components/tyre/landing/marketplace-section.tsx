"use client";

/**
 * SCENE 4 — "The open marketplace." (v2)
 *
 * Night falls again: the marketplace is where the deal happens, so it plays
 * on asphalt. Left — the five moments of a listing as manifest rows that
 * light in sequence (auto-advance, pause on hover, click to jump). Right —
 * a single listing card that morphs through every state like a ledger being
 * written in real time. The ₹49 is the hero number: ember when charged,
 * signal when refunded. IntersectionObserver gates the loop; reduced motion
 * shows the final state.
 */
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useInView, useReducedMotion } from "framer-motion";
import {
  ArrowRight,
  BadgeCheck,
  Camera,
  IndianRupee,
  PhoneCall,
  Undo2,
} from "lucide-react";
import { useTyreUI } from "@/lib/tyre/store";

const EXPO = [0.19, 1, 0.22, 1] as const;

const STEPS = [
  {
    icon: Camera,
    title: "List the leg you'd drive empty — free",
    body: "Car, van or truck. Route, time window, seats or capacity, your price. Live in under a minute.",
    badge: "₹0 to list",
  },
  {
    icon: BadgeCheck,
    title: "Sweeten the window",
    body: "Offer −10% to anyone who books before you leave. The clock is yours — offer expires when you say it does.",
    badge: "Time-boxed discount",
  },
  {
    icon: PhoneCall,
    title: "Travellers, parcels, pallets find you",
    body: "Anyone already heading your way can book the leg — a passenger, a shopkeeper's parcel, a return load.",
    badge: "Rides + freight",
  },
  {
    icon: IndianRupee,
    title: "Fee only on booking — lister pays, never the booker",
    body: "₹9 under ₹200 · ₹29 up to ₹500 · 4.99% above. Deducted from your payout only when someone actually books.",
    badge: "No booking · no fee",
  },
  {
    icon: Undo2,
    title: "Cancelled? Refunded. Automatically.",
    body: "If the booking falls through, the fee returns to your payout ledger on its own — no forms, no follow-ups.",
    badge: "Auto-refund",
  },
];

export function MarketplaceSection() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const { enterApp } = useTyreUI();
  const sectionRef = useRef<HTMLDivElement>(null);
  const inView = useInView(sectionRef, { amount: 0.3 });
  const reduce = useReducedMotion();

  useEffect(() => {
    if (paused || !inView || reduce) return;
    const t = setInterval(() => setActive((a) => (a + 1) % STEPS.length), 3400);
    return () => clearInterval(t);
  }, [paused, inView, reduce]);

  return (
    <section
      id="trust"
      ref={sectionRef}
      className="relative bg-[var(--tyre-panel)] text-[#F3F1E8] tyre-section scroll-mt-24 overflow-hidden"
    >
      {/* seams of light at both edges of the night */}
      <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-[rgba(124,58,237,0.4)] to-transparent" />
      <div className="absolute inset-0 opacity-[0.3] tyre-grid-bg-light pointer-events-none" />

      <div className="relative max-w-7xl mx-auto px-5 sm:px-8">
        {/* Heading */}
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.7, ease: EXPO }}
          className="max-w-2xl"
        >
          <div className="tyre-eyebrow flex items-center gap-3 !text-[var(--tyre-violet)]">
            <span className="w-7 h-px bg-[var(--tyre-violet)]" />
            The marketplace
          </div>
          <h2 className="tyre-h2 mt-5">
            List the way back.
            <br />
            <span className="tyre-em text-[var(--tyre-violet)]">Someone&apos;s already going.</span>
          </h2>
        </motion.div>

        <div
          className="mt-12 sm:mt-16 grid grid-cols-1 lg:grid-cols-[1fr_0.9fr] gap-10 lg:gap-16 items-center"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
        >
          {/* Manifest rows */}
          <div className="space-y-1.5">
            {STEPS.map((s, i) => {
              const on = i === active;
              return (
                <button
                  key={s.title}
                  onClick={() => setActive(i)}
                  className={`w-full text-left flex items-start gap-4 rounded-2xl p-4 sm:p-5 transition-all duration-500 tyre-focus ${
                    on
                      ? "bg-[rgba(243,241,232,0.06)] shadow-[inset_0_1px_0_rgba(255,250,235,0.08)]"
                      : "opacity-45 hover:opacity-80"
                  }`}
                >
                  <span
                    className={`grid place-items-center w-10 h-10 rounded-xl shrink-0 transition-colors duration-500 ${
                      on
                        ? "bg-[var(--tyre-violet)] text-white"
                        : "bg-[rgba(243,241,232,0.06)] text-[rgba(243,241,232,0.5)]"
                    }`}
                  >
                    <s.icon className="w-[18px] h-[18px]" />
                  </span>
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-[15.5px] font-bold">{s.title}</span>
                      {on && (
                        <motion.span
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          className="tyre-num px-2 py-0.5 rounded-full bg-[rgba(124,58,237,0.12)] text-[var(--tyre-violet)] text-[10.5px] font-bold"
                        >
                          {s.badge}
                        </motion.span>
                      )}
                    </span>
                    <AnimatePresence initial={false}>
                      {on && (
                        <motion.span
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.4, ease: EXPO }}
                          className="block overflow-hidden"
                        >
                          <span className="block pt-1.5 text-[13px] text-[rgba(243,241,232,0.55)] leading-relaxed">
                            {s.body}
                          </span>
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </span>
                </button>
              );
            })}

            <div className="pt-4 pl-1">
              <button onClick={enterApp} className="group tyre-btn-violet tyre-focus text-[14px] px-6 py-3">
                Open the marketplace
                <ArrowRight className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-1" />
              </button>
            </div>
          </div>

          {/* Living ledger card */}
          <div className="relative">
            <div
              className="absolute -inset-10 rounded-[3rem] opacity-25 blur-3xl pointer-events-none"
              style={{ background: "radial-gradient(50% 50% at 50% 40%, rgba(124,58,237,0.4) 0%, transparent 70%)" }}
            />
            <MockListing step={reduce ? 3 : active} />
          </div>
        </div>
      </div>
    </section>
  );
}

/* The listing card morphs through the five states like a ledger being written. */
function MockListing({ step }: { step: number }) {
  return (
    <div className="relative rounded-[1.6rem] tyre-card-dark overflow-hidden">
      {/* photo area */}
      <div className="relative h-40 bg-gradient-to-br from-[#26231C] to-[#0C0B08] overflow-hidden">
        <div className="absolute inset-0 opacity-40 tyre-grid-bg-light" />
        {/* truck silhouette catching the headlight */}
        <svg viewBox="0 0 320 120" className="absolute bottom-2 left-1/2 -translate-x-1/2 w-[260px]" fill="none" aria-hidden>
          <rect x="30" y="30" width="170" height="58" rx="8" fill="var(--tyre-violet)" opacity="0.85" />
          <rect x="200" y="48" width="58" height="40" rx="6" fill="#8B877A" />
          <rect x="206" y="54" width="20" height="14" rx="2" fill="#0C0B08" opacity="0.5" />
          <circle cx="70" cy="94" r="13" fill="#171510" stroke="#4A463C" strokeWidth="3" />
          <circle cx="120" cy="94" r="13" fill="#171510" stroke="#4A463C" strokeWidth="3" />
          <circle cx="232" cy="94" r="13" fill="#171510" stroke="#4A463C" strokeWidth="3" />
        </svg>
        <AnimatePresence>
          {step === 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute top-3 right-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[rgba(243,241,232,0.12)] backdrop-blur text-[#F3F1E8] text-[10.5px] font-semibold"
            >
              <Camera className="w-3 h-3" />
              photo added
            </motion.div>
          )}
        </AnimatePresence>
        <span
          className={`absolute top-3 left-3 px-2 py-0.5 rounded-full text-[10px] font-bold transition-colors duration-500 ${
            step >= 2 && step !== 4 ? "bg-[var(--tyre-violet)] text-white" : "bg-[rgba(243,241,232,0.15)] text-[#F3F1E8]"
          }`}
        >
          {step >= 2 && step !== 4 ? "BOOKED" : "AVAILABLE"}
        </span>
      </div>

      {/* body */}
      <div className="p-5">
        <div className="flex items-center justify-between">
          <div>
            <div className="tyre-num text-[16px] font-extrabold text-[#F3F1E8]">DL 8C AV 4321</div>
            <div className="text-[11.5px] text-[rgba(243,241,232,0.45)] mt-0.5">
              College → Station · Hatchback · 3 seats
            </div>
          </div>
          <div className="text-right">
            <div className="tyre-num text-[20px] font-bold text-[#F3F1E8] leading-none">₹162</div>
            <div className="text-[10px] text-[rgba(243,241,232,0.4)] mt-1">−10% before 10:50 PM</div>
          </div>
        </div>

        {/* state strip */}
        <div className="mt-4 min-h-[86px]">
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.35, ease: EXPO }}
            >
              {step === 0 && (
                <div className="rounded-xl bg-[rgba(124,58,237,0.1)] border border-[rgba(124,58,237,0.2)] p-3.5 flex items-center gap-3">
                  <span className="relative flex h-2.5 w-2.5 shrink-0">
                    <span className="absolute inline-flex h-full w-full rounded-full bg-[var(--tyre-violet)] opacity-70 animate-ping" />
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[var(--tyre-violet)]" />
                  </span>
                  <div>
                    <div className="text-[12.5px] font-bold text-[#F3F1E8]">Live on the board · offer ticking</div>
                    <div className="text-[11px] text-[rgba(243,241,232,0.5)]">Listed free · −10% until 10:50 PM</div>
                  </div>
                </div>
              )}
              {step === 1 && (
                <div className="rounded-xl border border-[rgba(243,241,232,0.12)] p-3.5">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-[12.5px] font-bold text-[#F3F1E8]">Ananya wants seat 1</div>
                      <div className="text-[11px] text-[rgba(243,241,232,0.45)]">College → Station · leaving 10:50 PM</div>
                    </div>
                    <span className="px-2 py-1 rounded-lg bg-[rgba(255,90,30,0.15)] text-[var(--tyre-ember)] text-[10px] font-bold">
                      PENDING
                    </span>
                  </div>
                </div>
              )}
              {step === 2 && (
                <div className="rounded-xl bg-[rgba(243,241,232,0.07)] tyre-toplight p-3.5">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-[12.5px] font-bold text-[#F3F1E8]">Booking accepted ✓</div>
                      <div className="text-[11px] text-[rgba(243,241,232,0.5)]">Platform fee deducted from payout</div>
                    </div>
                    <motion.span
                      initial={{ scale: 0.6, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ type: "spring", stiffness: 300, damping: 18, delay: 0.15 }}
                      className="tyre-num text-[22px] font-bold text-[var(--tyre-ember)]"
                    >
                      −₹9
                    </motion.span>
                  </div>
                </div>
              )}
              {step === 3 && (
                <div className="rounded-xl border border-[rgba(243,241,232,0.12)] p-3.5 flex items-center justify-between">
                  <div>
                    <div className="text-[12.5px] font-bold text-[#F3F1E8]">Direct line open</div>
                    <div className="text-[11px] text-[rgba(243,241,232,0.45)]">Owner ↔ booker · no middlemen</div>
                  </div>
                  <motion.span
                    animate={{ rotate: [0, -12, 10, -8, 0] }}
                    transition={{ duration: 0.9, repeat: Infinity, repeatDelay: 1.4 }}
                    className="grid place-items-center w-9 h-9 rounded-full bg-[rgba(124,58,237,0.12)] text-[var(--tyre-violet)]"
                  >
                    <PhoneCall className="w-4 h-4" />
                  </motion.span>
                </div>
              )}
              {step === 4 && (
                <div className="rounded-xl bg-[rgba(124,58,237,0.1)] border border-[rgba(124,58,237,0.2)] p-3.5">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-[12.5px] font-bold text-[#F3F1E8]">Booking cancelled — fee returned</div>
                      <div className="text-[11px] text-[rgba(243,241,232,0.5)]">Refund posted to your ledger automatically</div>
                    </div>
                    <motion.span
                      initial={{ scale: 0.6, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ type: "spring", stiffness: 300, damping: 18, delay: 0.15 }}
                      className="tyre-num text-[22px] font-bold text-[var(--tyre-violet)]"
                    >
                      +₹9
                    </motion.span>
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* progress lane */}
        <div className="mt-4 flex gap-1.5">
          {STEPS.map((_, i) => (
            <span
              key={i}
              className={`h-1 rounded-full transition-all duration-500 ${
                i === step ? "w-6 bg-[var(--tyre-violet)]" : "w-1.5 bg-[rgba(243,241,232,0.15)]"
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
