"use client";

/**
 * SCENE 3 — "Three motions." (v2)
 *
 * Book / Track / Pay as full-bleed stacking cards: each motion pins under
 * the last like freight being loaded. Every card has its own material —
 * Book is daylight mint with a live voice line, Track is asphalt night with
 * a self-drawing route, Pay is ember with an instant UPI receipt. No two
 * cards animate the same way; scroll does the storytelling.
 */
import { useRef, type ReactNode } from "react";
import { ArrowRight, FileCheck2, Route, IndianRupee, Mic, CheckCircle2 } from "lucide-react";
import { motion, useInView, useReducedMotion } from "framer-motion";
import { useTyreUI } from "@/lib/tyre/store";

const EXPO = [0.19, 1, 0.22, 1] as const;

export function FeatureCards() {
  const { enterApp } = useTyreUI();

  return (
    <section id="product" className="bg-background tyre-section">
      <div className="max-w-7xl mx-auto px-5 sm:px-8">
        {/* Heading */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.7, ease: EXPO }}
        >
          <div className="tyre-eyebrow flex items-center gap-3">
            <span className="w-7 h-px bg-[var(--tyre-violet-deep)]" />
            Simple. Powerful.
          </div>
          <div className="mt-5 flex flex-col lg:flex-row lg:items-end lg:justify-between gap-5">
            <h2 className="tyre-h2 text-[var(--tyre-ink)]">
              Three motions.<br />One operating <span className="tyre-em">system.</span>
            </h2>
            <p className="text-[15px] text-[var(--muted-foreground)] max-w-sm leading-relaxed">
              Everything a trucker needs — in three simple steps built for speed, trust
              and transparency.
            </p>
          </div>
        </motion.div>

        {/* Stacking cards */}
        <div className="mt-14">
          <StackCard index={0}>
            <BookCard onEnter={enterApp} />
          </StackCard>
          <StackCard index={1}>
            <TrackCard onEnter={enterApp} />
          </StackCard>
          <StackCard index={2}>
            <PayCard onEnter={enterApp} />
          </StackCard>
        </div>
      </div>
    </section>
  );
}

/* Sticky wrapper — cards pile on top of each other as you scroll */
function StackCard({ index, children }: { index: number; children: ReactNode }) {
  return (
    <div className="sticky mb-6" style={{ top: `${96 + index * 26}px`, zIndex: index + 1 }}>
      {children}
    </div>
  );
}

const cardBase =
  "relative overflow-hidden rounded-[1.8rem] p-8 sm:p-12 min-h-[420px] grid grid-cols-1 lg:grid-cols-2 gap-10 items-center";

/* ── 01 BOOK — daylight, voice-first ── */
function BookCard({ onEnter }: { onEnter: () => void }) {
  return (
    <article className={`${cardBase} bg-[var(--tyre-mint)] border border-[rgba(44,70,200,0.18)] shadow-[0_30px_70px_-40px_rgba(44,70,200,0.45)]`}>
      <div>
        <CardHead n="01" icon={FileCheck2} dark />
        <h3 className="tyre-display text-[clamp(2.2rem,1.4rem+3vw,3.6rem)] text-[var(--tyre-ink)]">Book it.</h3>
        <p className="mt-4 text-[15px] leading-relaxed text-[rgba(18,16,11,0.65)] max-w-[34ch]">
          Find the best loads instantly near you — voice-matched in 8 seconds.
        </p>
        <CardCta onClick={onEnter} className="bg-[var(--tyre-ink)] text-[var(--primary-foreground)] hover:opacity-90" />
      </div>
      {/* live voice line */}
      <div className="rounded-2xl bg-card border border-[var(--border)] p-5 shadow-[0_20px_50px_-30px_rgba(28,22,12,0.3)]">
        <div className="flex items-center gap-2.5">
          <span className="grid place-items-center w-9 h-9 rounded-full bg-[var(--tyre-ink)] text-[var(--tyre-violet)]">
            <Mic className="w-4 h-4" />
          </span>
          <span className="text-[13px] font-semibold text-[var(--tyre-ink)]">“Patna se Delhi load chahiye”</span>
        </div>
        <div className="mt-4 flex items-end gap-[3px] h-10" aria-hidden>
          {Array.from({ length: 36 }).map((_, i) => (
            <motion.span
              key={i}
              className="w-[3px] rounded-full bg-[var(--tyre-violet-deep)]"
              animate={{ height: [`${14 + ((i * 7) % 20)}%`, `${45 + ((i * 13) % 50)}%`, `${14 + ((i * 5) % 20)}%`] }}
              transition={{ duration: 1 + (i % 5) * 0.12, repeat: Infinity, ease: "easeInOut", delay: (i % 7) * 0.06 }}
              style={{ opacity: 0.45 + (i % 3) * 0.22 }}
            />
          ))}
        </div>
        <div className="mt-4 rounded-xl bg-[var(--tyre-mint)] px-3.5 py-2.5 flex items-center justify-between">
          <span className="text-[12px] font-semibold text-[var(--tyre-ink)]">3 loads matched</span>
          <span className="tyre-num text-[12px] font-bold text-[var(--tyre-violet-deep)]">8s</span>
        </div>
      </div>
    </article>
  );
}

/* ── 02 TRACK — asphalt night, self-drawing route ── */
function TrackCard({ onEnter }: { onEnter: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.5 });
  const reduce = useReducedMotion();

  return (
    <article ref={ref} className={`${cardBase} tyre-card-dark text-[#F3F1E8]`}>
      <span className="tyre-scan" aria-hidden />
      <div>
        <CardHead n="02" icon={Route} />
        <h3 className="tyre-display text-[clamp(2.2rem,1.4rem+3vw,3.6rem)]">Track it.</h3>
        <p className="mt-4 text-[15px] leading-relaxed text-[rgba(243,241,232,0.6)] max-w-[34ch]">
          Live trip tracking with full visibility — GPS, FASTag and last-mile AI.
        </p>
        <CardCta onClick={onEnter} className="bg-[var(--tyre-violet)] text-white hover:brightness-105" />
      </div>
      {/* the route draws itself; the truck dot rides it */}
      <div className="relative rounded-2xl bg-[rgba(243,241,232,0.04)] border border-[rgba(243,241,232,0.1)] p-5 tyre-toplight">
        <div className="flex justify-between font-mono text-[10px] tracking-[0.16em] uppercase text-[rgba(243,241,232,0.4)]">
          <span>Patna</span>
          <span className="text-[var(--tyre-violet)]">1,040 km</span>
          <span>Delhi</span>
        </div>
        <svg className="mt-3 w-full h-28" viewBox="0 0 300 90" fill="none" preserveAspectRatio="none" aria-hidden>
          <path
            d="M6 74 C 60 66, 90 40, 140 44 S 240 20, 294 14"
            stroke="rgba(243,241,232,0.12)"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <path
            d="M6 74 C 60 66, 90 40, 140 44 S 240 20, 294 14"
            stroke="var(--tyre-violet)"
            strokeWidth="2.5"
            strokeLinecap="round"
            className={inView && !reduce ? "tyre-route" : undefined}
            style={inView || reduce ? undefined : { strokeDasharray: 1400, strokeDashoffset: 1400 }}
          />
          <circle cx="294" cy="14" r="4" fill="var(--tyre-violet)" />
        </svg>
        <div className="mt-2 grid grid-cols-3 gap-2 text-center">
          {[
            ["GPS", "live"],
            ["FASTag", "linked"],
            ["ETA", "14:20"],
          ].map(([k, v]) => (
            <div key={k} className="rounded-lg bg-[rgba(243,241,232,0.05)] py-2">
              <div className="font-mono text-[9.5px] uppercase tracking-wider text-[rgba(243,241,232,0.4)]">{k}</div>
              <div className="tyre-num text-[12.5px] font-bold text-[var(--tyre-violet)] mt-0.5">{v}</div>
            </div>
          ))}
        </div>
      </div>
    </article>
  );
}

/* ── 03 PAY — ember, instant receipt ── */
function PayCard({ onEnter }: { onEnter: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.5 });

  return (
    <article
      ref={ref}
      className={`${cardBase} text-[#12100B] border border-[rgba(190,59,11,0.25)] shadow-[0_30px_70px_-40px_rgba(255,90,30,0.55)]`}
      style={{ background: "linear-gradient(135deg, #FF8A55 0%, #FF5A1E 70%, #F04E12 100%)" }}
    >
      <div>
        <CardHead n="03" icon={IndianRupee} dark />
        <h3 className="tyre-display text-[clamp(2.2rem,1.4rem+3vw,3.6rem)]">Pay it.</h3>
        <p className="mt-4 text-[15px] leading-relaxed text-[rgba(18,16,11,0.65)] max-w-[34ch]">
          Instant UPI payouts. No middlemen, no chasing, no fraud.
        </p>
        <CardCta onClick={onEnter} className="bg-[#12100B] text-white hover:opacity-90" />
      </div>
      {/* receipt slides up + settles */}
      <motion.div
        initial={{ opacity: 0, y: 40, rotate: -1.5 }}
        animate={inView ? { opacity: 1, y: 0, rotate: 0 } : undefined}
        transition={{ duration: 0.9, ease: EXPO, delay: 0.2 }}
        className="rounded-2xl bg-[#FDFCF8] p-5 shadow-[0_30px_60px_-30px_rgba(120,30,0,0.5)]"
      >
        <div className="flex items-center justify-between border-b border-dashed border-[rgba(18,16,11,0.15)] pb-3">
          <span className="font-mono text-[10px] tracking-[0.18em] uppercase text-[var(--muted-foreground)]">
            UPI settlement
          </span>
          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#1C7C2E]">
            <CheckCircle2 className="w-3.5 h-3.5" /> instant
          </span>
        </div>
        <div className="py-4 space-y-2.5">
          {[
            ["Advance (on match)", "₹10,000"],
            ["Balance (on POD)", "₹22,000"],
            ["Commission", "₹0"],
          ].map(([k, v], i) => (
            <motion.div
              key={k}
              initial={{ opacity: 0, x: 16 }}
              animate={inView ? { opacity: 1, x: 0 } : undefined}
              transition={{ duration: 0.5, ease: EXPO, delay: 0.5 + i * 0.15 }}
              className="flex items-center justify-between"
            >
              <span className="text-[12.5px] text-[#37332A]">{k}</span>
              <span className={`tyre-num text-[14px] font-bold ${k === "Commission" ? "text-[#1C7C2E]" : "text-[#12100B]"}`}>
                {v}
              </span>
            </motion.div>
          ))}
        </div>
        <div className="pt-3 border-t border-[rgba(18,16,11,0.1)] flex items-center justify-between">
          <span className="text-[12px] font-semibold text-[#37332A]">Driver receives</span>
          <span className="tyre-num text-[22px] font-extrabold text-[#12100B]">₹32,000</span>
        </div>
      </motion.div>
    </article>
  );
}

/* shared bits */
function CardHead({ n, icon: Icon, dark }: { n: string; icon: typeof Route; dark?: boolean }) {
  return (
    <div className="flex items-center gap-3 mb-7">
      <span
        className={`tyre-num text-[12px] font-bold px-2.5 py-1 rounded-full ${
          dark ? "bg-[#12100B] text-white" : "bg-[rgba(243,241,232,0.1)] text-[#F3F1E8]"
        }`}
      >
        {n}
      </span>
      <span
        className={`grid place-items-center w-11 h-11 rounded-2xl ${
          dark ? "bg-[rgba(18,16,11,0.08)] text-[#12100B]" : "bg-[rgba(243,241,232,0.08)] text-[var(--tyre-violet)]"
        }`}
      >
        <Icon className="w-5 h-5" />
      </span>
    </div>
  );
}

function CardCta({ onClick, className }: { onClick: () => void; className: string }) {
  return (
    <button
      onClick={onClick}
      aria-label="Open the app"
      className={`group/cta mt-8 inline-flex items-center gap-2 rounded-full px-6 py-3 text-[13.5px] font-bold transition-all duration-300 active:scale-[0.96] tyre-focus ${className}`}
    >
      Open the app
      <ArrowRight className="w-4 h-4 transition-transform duration-300 group-hover/cta:translate-x-1" />
    </button>
  );
}
