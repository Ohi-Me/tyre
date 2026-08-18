"use client";

/**
 * SCENE 6 — "Pricing." (v2)
 *
 * Daylight, paper, honesty. The ₹49 is printed as an actual toll receipt —
 * perforated edge, mono type, rubber stamp — because that's the entire fee
 * story. The three plans are three different materials: Driver is mint
 * (free, always), Broker is asphalt (the professional cockpit), Shipper is
 * paper (coming soon). Hover lifts are physical; nothing wobbles.
 */
import { useEffect, useState } from "react";
import { useTyreUI } from "@/lib/tyre/store";
import { ArrowRight, Check, IndianRupee, Undo2 } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";

const EXPO = [0.19, 1, 0.22, 1] as const;

type Plan = {
  name: string;
  price: string;
  period?: string;
  sub: string;
  cta: string;
  highlight: boolean;
  features: string[];
};

// Instant fallback (no layout shift); replaced by GET /api/v1/landing/pricing.
const PLANS: Plan[] = [
  {
    name: "Driver",
    price: "Free",
    sub: "Forever — for every driver on the corridor",
    cta: "Open the driver app",
    highlight: false,
    features: [
      "Unlimited voice load search",
      "UPI escrow + ₹10K advance",
      "FASTag wallet integration",
      "Voice onboarding in 2 minutes",
      "WhatsApp voice bot access",
    ],
  },
  {
    name: "Broker",
    price: "₹2,000",
    period: "/mo",
    sub: "Per broker seat. Cancel anytime.",
    cta: "Start 30-day trial",
    highlight: true,
    features: [
      "Unlimited load postings",
      "GSTIN-verified broker badge",
      "Live dispatch board for 50 loads",
      "Trust score dashboard",
      "Automated e-way bill generation",
      "API access (1K calls/day)",
    ],
  },
  {
    name: "Shipper",
    price: "₹1,000",
    period: "/mo",
    sub: "Per shipper seat. Live in H2 2026.",
    cta: "Join waitlist",
    highlight: false,
    features: [
      "RFP & contract load posting",
      "Dedicated fleet allocation",
      "POD & invoice automation",
      "Lane analytics dashboard",
      "Dedicated account manager",
    ],
  },
];

export function PricingSection() {
  const { enterApp } = useTyreUI();
  const [plans, setPlans] = useState<Plan[]>(PLANS);
  const reduce = useReducedMotion();

  useEffect(() => {
    let alive = true;
    fetch("/api/v1/landing/pricing")
      .then((r) => r.json())
      .then((d) => {
        if (alive && Array.isArray(d?.plans) && d.plans.length) setPlans(d.plans);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  return (
    <section id="pricing" className="bg-background tyre-section">
      <div className="max-w-7xl mx-auto px-5 sm:px-8">
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.7, ease: EXPO }}
          className="text-center max-w-2xl mx-auto mb-12"
        >
          <div className="tyre-eyebrow flex items-center justify-center gap-3">
            <span className="w-6 h-px bg-[var(--tyre-green-deep)]" />
            Pricing
            <span className="w-6 h-px bg-[var(--tyre-green-deep)]" />
          </div>
          <h2 className="tyre-h2 text-[var(--tyre-ink)] mt-5">
            Drivers never pay.
            <br />
            Everyone else pays <span className="tyre-em">only for leverage.</span>
          </h2>
        </motion.div>

        {/* ── The ₹49 toll receipt ── */}
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 24, rotate: -0.6 }}
          whileInView={{ opacity: 1, y: 0, rotate: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.8, ease: EXPO }}
          className="relative mb-14 mx-auto max-w-3xl"
        >
          <div className="relative rounded-[1.4rem] bg-[var(--tyre-panel)] text-[#F3F1E8] overflow-hidden tyre-toplight shadow-[0_40px_90px_-40px_rgba(18,16,11,0.6)]">
            {/* perforation notches */}
            <span className="absolute top-1/2 -translate-y-1/2 -left-3 w-6 h-6 rounded-full bg-[var(--background)]" />
            <span className="absolute top-1/2 -translate-y-1/2 -right-3 w-6 h-6 rounded-full bg-[var(--background)]" />
            {/* punched perforation row along the top */}
            <div
              className="absolute top-0 inset-x-8 h-px opacity-40"
              style={{ backgroundImage: "linear-gradient(90deg, rgba(243,241,232,0.5) 0 6px, transparent 6px 14px)", backgroundSize: "14px 1px" }}
            />
            <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr_auto] items-center gap-5 px-8 sm:px-12 py-7">
              <div className="flex items-baseline gap-1">
                <span className="tyre-num text-[52px] font-extrabold leading-none text-[var(--tyre-signal)]">₹49</span>
                <span className="font-mono text-[11px] text-[rgba(243,241,232,0.45)] uppercase tracking-wider">flat</span>
              </div>
              <div className="sm:border-l sm:border-dashed sm:border-[rgba(243,241,232,0.2)] sm:pl-6">
                <div className="text-[15px] font-bold">Marketplace booking fee</div>
                <p className="text-[12.5px] text-[rgba(243,241,232,0.55)] mt-1 leading-relaxed">
                  Charged only when you <strong className="text-[rgba(243,241,232,0.9)]">accept</strong> a booking on
                  your freight — refunded automatically if it&apos;s cancelled. Listing is always free.
                </p>
              </div>
              <div className="flex sm:flex-col gap-2">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[rgba(243,241,232,0.08)] text-[10.5px] font-semibold text-[rgba(243,241,232,0.8)]">
                  <IndianRupee className="w-3 h-3" /> No commissions
                </span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[rgba(198,246,61,0.12)] text-[10.5px] font-semibold text-[var(--tyre-signal)]">
                  <Undo2 className="w-3 h-3" /> Auto-refund
                </span>
              </div>
            </div>
          </div>
        </motion.div>

        {/* ── Three materials ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-stretch">
          {plans.map((p, i) => (
            <motion.div
              key={p.name}
              initial={reduce ? false : { opacity: 0, y: 32 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.7, ease: EXPO, delay: reduce ? 0 : i * 0.1 }}
              className="h-full"
            >
              <motion.article
                whileHover={reduce ? undefined : { y: -6 }}
                transition={{ type: "spring", stiffness: 300, damping: 24 }}
                className={`relative h-full rounded-[1.6rem] p-7 sm:p-8 flex flex-col transition-shadow duration-500 ${
                  p.highlight
                    ? "tyre-card-dark text-[#F3F1E8] lg:scale-[1.04] lg:-translate-y-2"
                    : p.name === "Driver"
                      ? "bg-[var(--tyre-mint)] text-[var(--tyre-ink)] border border-[rgba(61,122,15,0.22)] hover:shadow-[0_24px_60px_-28px_rgba(61,122,15,0.4)]"
                      : "bg-card text-[var(--tyre-ink)] border border-[var(--border)] hover:shadow-[0_24px_60px_-28px_rgba(28,22,12,0.3)]"
                }`}
              >
                {p.highlight && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <div className="rounded-full bg-[var(--tyre-signal)] px-3 py-1 text-[10.5px] font-bold uppercase tracking-wider text-[#12100B]">
                      Most popular
                    </div>
                  </div>
                )}
                {p.name === "Driver" && (
                  <div className="absolute top-5 right-6 font-mono text-[9.5px] font-bold uppercase tracking-[0.16em] text-[var(--tyre-green-deep)] border border-[rgba(61,122,15,0.35)] rounded px-1.5 py-0.5 rotate-3">
                    ₹0 forever
                  </div>
                )}
                <div className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em] mb-3 opacity-60">
                  {p.name}
                </div>
                <div className="flex items-baseline gap-1 mb-2">
                  <span className="tyre-num text-[44px] font-extrabold leading-none tracking-tight">{p.price}</span>
                  {p.period && (
                    <span className={`text-[14px] ${p.highlight ? "text-[rgba(243,241,232,0.55)]" : "text-[var(--muted-foreground)]"}`}>
                      {p.period}
                    </span>
                  )}
                </div>
                <div className={`text-[13px] mb-6 ${p.highlight ? "text-[rgba(243,241,232,0.6)]" : "text-[var(--muted-foreground)]"}`}>
                  {p.sub}
                </div>

                <button
                  onClick={enterApp}
                  className={`w-full inline-flex items-center justify-center gap-2 rounded-full py-3 text-[13.5px] font-bold transition-all duration-200 active:scale-[0.98] tyre-focus ${
                    p.highlight
                      ? "bg-[var(--tyre-signal)] text-[#12100B] hover:brightness-105 hover:shadow-[0_12px_30px_-10px_rgba(198,246,61,0.6)]"
                      : "bg-[var(--tyre-ink)] text-[var(--primary-foreground)] hover:opacity-90"
                  }`}
                >
                  {p.cta}
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>

                <div className={`h-px my-6 ${p.highlight ? "bg-[rgba(243,241,232,0.1)]" : "bg-[rgba(18,16,11,0.08)]"}`} />

                <ul className="space-y-3">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-[13.5px]">
                      <div
                        className={`shrink-0 w-4 h-4 rounded-full flex items-center justify-center mt-0.5 ${
                          p.highlight ? "bg-[var(--tyre-signal)]" : "bg-[var(--tyre-ink)]"
                        }`}
                      >
                        <Check className={`w-2.5 h-2.5 ${p.highlight ? "text-[#12100B]" : "text-white"}`} />
                      </div>
                      <span className={p.highlight ? "text-[rgba(243,241,232,0.85)]" : "text-[var(--tyre-ink-soft)]"}>
                        {f}
                      </span>
                    </li>
                  ))}
                </ul>
              </motion.article>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
