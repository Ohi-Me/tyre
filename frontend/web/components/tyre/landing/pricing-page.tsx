"use client";

/**
 * PRICING PAGE — /[locale]/pricing
 * Two ways to pay, two tabs (morphing pill like monthly/yearly switches):
 *   1. Pay per booking — auto-cut from the lister only, on booking only:
 *      ₹9 under ₹200 · ₹29 for ₹200–500 · 4.99% above ₹500. Auto-refund.
 *   2. Membership — unlimited listings, zero cuts: ₹499/wk · ₹2,499/mo · ₹9,999/yr.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, ArrowRight, Check, IndianRupee, Undo2, Zap } from "lucide-react";
import { useTyreUI } from "@/lib/tyre/store";

const EXPO = [0.19, 1, 0.22, 1] as const;

const CUTS = [
  { range: "Booking under ₹200", fee: "₹9", note: "flat" },
  { range: "₹200 – ₹500", fee: "₹29", note: "flat" },
  { range: "Above ₹500", fee: "4.99%", note: "of booking value" },
];

const PLANS = [
  { name: "Weekly", price: "₹499", period: "/week", sub: "Try it on your busiest week", highlight: false },
  { name: "Monthly", price: "₹2,499", period: "/month", sub: "For daily drivers & small fleets", highlight: true },
  { name: "Yearly", price: "₹9,999", period: "/year", sub: "Two months effectively free", highlight: false },
];

const PLAN_FEATURES = [
  "Unlimited listings — rides & freight",
  "Zero per-booking cuts",
  "Time-boxed discount offers",
  "Priority placement on the board",
  "Instant UPI settlement",
];

export function PricingPage() {
  const [tab, setTab] = useState<"cuts" | "plans">("cuts");
  const { enterApp } = useTyreUI();
  const router = useRouter();
  const locale = useLocale();
  const reduce = useReducedMotion();

  return (
    <div className="min-h-screen bg-background text-foreground tyre-scroll">
      {/* header band */}
      <div className="relative bg-[var(--tyre-panel)] text-[#F3F1E8] overflow-hidden">
        <div className="absolute bottom-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-[rgba(61,107,255,0.5)] to-transparent" />
        <div className="max-w-4xl mx-auto px-5 sm:px-8 pt-8 pb-14 sm:pb-16">
          <button
            onClick={() => router.push(`/${locale}`)}
            className="inline-flex items-center gap-2 text-[13px] text-[rgba(243,241,232,0.6)] hover:text-[#F3F1E8] transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Home
          </button>
          <motion.h1
            initial={reduce ? false : { opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: EXPO }}
            className="tyre-display-xl mt-8 text-[clamp(2.4rem,1.6rem+4vw,4.6rem)]"
          >
            Pay per booking.
            <br />
            Or <span className="tyre-em text-[var(--tyre-signal)]">never pay per booking.</span>
          </motion.h1>
          <motion.p
            initial={reduce ? false : { opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: EXPO, delay: 0.15 }}
            className="mt-5 max-w-lg text-[15px] text-[rgba(243,241,232,0.6)] leading-relaxed"
          >
            Listing is always free, for every vehicle. The booker never pays the platform —
            fees come from the lister, only when a booking actually happens.
          </motion.p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-5 sm:px-8 py-12 sm:py-16">
        {/* tab switch */}
        <div className="flex justify-center">
          <div className="inline-flex rounded-full border border-[var(--border)] bg-card p-1">
            {(
              [
                { id: "cuts", label: "Pay per booking" },
                { id: "plans", label: "Membership — no cuts" },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`relative px-5 py-2 rounded-full text-[13.5px] font-semibold transition-colors duration-300 ${
                  tab === t.id ? "text-white" : "text-[var(--muted-foreground)] hover:text-[var(--tyre-ink)]"
                }`}
              >
                {tab === t.id && (
                  <motion.span
                    layoutId="pricing-tab"
                    transition={{ type: "spring", stiffness: 420, damping: 34 }}
                    className="absolute inset-0 rounded-full bg-[var(--tyre-signal)]"
                  />
                )}
                <span className="relative z-10">{t.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* recognition over recall — help pick without thinking */}
        <p className="mt-3 text-center text-[12px] text-[var(--muted-foreground)]">
          {tab === "cuts"
            ? "Most solo drivers start here — no commitment, you pay only when you earn."
            : "Running 10+ bookings a week? Membership usually costs less than the cuts."}
        </p>

        <AnimatePresence mode="wait">
          {tab === "cuts" ? (
            <motion.div
              key="cuts"
              initial={reduce ? false : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.35, ease: EXPO }}
              className="mt-10"
            >
              {/* auto-cut tiers */}
              <div className="rounded-[1.6rem] border border-[var(--border)] bg-card overflow-hidden">
                {CUTS.map((c, i) => (
                  <div
                    key={c.range}
                    className={`flex items-center justify-between px-6 sm:px-8 py-5 ${
                      i > 0 ? "border-t border-dashed border-[var(--border)]" : ""
                    }`}
                  >
                    <div className="text-[14.5px] font-semibold text-[var(--tyre-ink)]">{c.range}</div>
                    <div className="flex items-baseline gap-2">
                      <span className="tyre-num text-[26px] font-extrabold text-[var(--tyre-green-deep)]">{c.fee}</span>
                      <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--muted-foreground)]">
                        {c.note}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-5 grid sm:grid-cols-3 gap-3">
                {[
                  { icon: IndianRupee, text: "Charged to the lister only — bookers never pay the platform" },
                  { icon: Zap, text: "Deducted only when a booking happens. No booking, no fee." },
                  { icon: Undo2, text: "Cancelled booking? The cut returns to your ledger automatically." },
                ].map(({ icon: Icon, text }) => (
                  <div key={text} className="flex items-start gap-3 rounded-2xl bg-[var(--tyre-mint)] p-4">
                    <span className="grid place-items-center w-8 h-8 rounded-lg bg-[var(--tyre-ink)] text-[var(--tyre-signal)] shrink-0">
                      <Icon className="w-4 h-4" />
                    </span>
                    <p className="text-[12.5px] leading-relaxed text-[var(--tyre-ink-soft)]">{text}</p>
                  </div>
                ))}
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="plans"
              initial={reduce ? false : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.35, ease: EXPO }}
              className="mt-10 grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch"
            >
              {PLANS.map((p) => (
                <article
                  key={p.name}
                  className={`relative h-full rounded-[1.6rem] p-7 flex flex-col ${
                    p.highlight
                      ? "tyre-card-dark text-[#F3F1E8] lg:scale-[1.03] lg:-translate-y-1"
                      : "bg-card text-[var(--tyre-ink)] border border-[var(--border)]"
                  }`}
                >
                  {p.highlight && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[var(--tyre-signal)] px-3 py-1 text-[10.5px] font-bold uppercase tracking-wider text-white">
                      Most popular
                    </div>
                  )}
                  <div className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em] opacity-60 mb-3">
                    {p.name}
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className="tyre-num text-[40px] font-extrabold leading-none tracking-tight">{p.price}</span>
                    <span className={`text-[13px] ${p.highlight ? "text-[rgba(243,241,232,0.55)]" : "text-[var(--muted-foreground)]"}`}>
                      {p.period}
                    </span>
                  </div>
                  <div className={`text-[12.5px] mt-2 mb-6 ${p.highlight ? "text-[rgba(243,241,232,0.6)]" : "text-[var(--muted-foreground)]"}`}>
                    {p.sub}
                  </div>
                  <button
                    onClick={enterApp}
                    className={`w-full inline-flex items-center justify-center gap-2 rounded-full py-3 text-[13.5px] font-bold transition-all duration-200 active:scale-[0.98] ${
                      p.highlight
                        ? "bg-[var(--tyre-signal)] text-white hover:brightness-110"
                        : "bg-[var(--tyre-ink)] text-[var(--primary-foreground)] hover:opacity-90"
                    }`}
                  >
                    Get started <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                  <div className={`h-px my-6 ${p.highlight ? "bg-[rgba(243,241,232,0.1)]" : "bg-[rgba(18,16,11,0.08)]"}`} />
                  <ul className="space-y-2.5">
                    {PLAN_FEATURES.map((f) => (
                      <li key={f} className="flex items-start gap-2.5 text-[13px]">
                        <span
                          className={`shrink-0 grid place-items-center w-4 h-4 rounded-full mt-0.5 ${
                            p.highlight ? "bg-[var(--tyre-signal)]" : "bg-[var(--tyre-ink)]"
                          }`}
                        >
                          <Check className="w-2.5 h-2.5 text-white" />
                        </span>
                        <span className={p.highlight ? "text-[rgba(243,241,232,0.85)]" : "text-[var(--tyre-ink-soft)]"}>
                          {f}
                        </span>
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
