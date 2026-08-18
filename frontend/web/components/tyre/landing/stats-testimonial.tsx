"use client";

/**
 * Stats + testimonial band beside a purple gradient quote card. The driver
 * count is a live network number (useLandingStats); the service-level figures
 * next to it are pilot targets we're building toward, labelled as such rather
 * than passed off as proven results. The quote is illustrative, attributed by
 * role rather than a fabricated named "verified customer" — TYRE has no public
 * case studies yet, so this stays honest about that.
 */
import { motion, useReducedMotion } from "framer-motion";
import { Quote } from "lucide-react";
import { Reveal, Stagger, StaggerItem } from "./motion";
import { useLandingStats } from "@/lib/tyre/use-landing-stats";

export function StatsTestimonial() {
  const m = useLandingStats();
  const reduce = useReducedMotion();

  const STATS = [
    { value: m.drivers, label: "Drivers & listers on the network", target: !m.live },
    { value: m.ontime, label: "On-time delivery rate", target: true },
    { value: m.return_match, label: "Return legs filled instead of empty", target: true },
  ];

  return (
    <section className="bg-background tyre-section">
      <div className="max-w-7xl mx-auto px-5 sm:px-8">
        <Reveal className="max-w-2xl">
          <div className="tyre-eyebrow flex items-center gap-3 !text-[var(--tyre-violet-deep)]">
            <span className="w-7 h-px bg-[var(--tyre-violet)]" />
            Live counts + pilot targets
          </div>
          <h2 className="tyre-h2 mt-5 text-[var(--tyre-ink)]">
            Real where we can <span className="tyre-em text-[var(--tyre-violet)]">prove it,</span> honest about the rest.
          </h2>
        </Reveal>

        <div className="mt-12 grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-5">
          <Stagger className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-1 gap-4">
            {STATS.map((s) => (
              <StaggerItem key={s.label}>
                <div className="h-full rounded-2xl bg-[#12100B] text-white p-6 flex flex-col justify-between min-h-[150px]">
                  <div className="tyre-num text-[40px] sm:text-[48px] font-extrabold leading-none text-[var(--tyre-violet-hot)]">
                    {s.value}
                  </div>
                  <div className="mt-3 text-[13px] text-[rgba(243,241,232,0.6)] leading-snug">
                    {s.label}
                    {s.target && (
                      <span className="ml-1.5 inline-block align-middle rounded-full border border-white/25 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-white/70">
                        target
                      </span>
                    )}
                  </div>
                </div>
              </StaggerItem>
            ))}
          </Stagger>

          <motion.div
            initial={reduce ? false : { opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            className="tyre-card-violet rounded-2xl p-7 sm:p-9 flex flex-col justify-between relative overflow-hidden min-h-[300px]"
          >
            <div
              className="pointer-events-none absolute -bottom-16 -right-16 w-56 h-56 rounded-full opacity-40 blur-2xl"
              style={{ background: "rgba(255,255,255,0.25)" }}
            />
            <Quote className="w-9 h-9 text-white/40 relative" />
            <p className="relative mt-4 text-[19px] sm:text-[22px] font-semibold leading-snug">
              &ldquo;I used to eat the cost of driving back empty every single night. Now the return leg
              pays for the diesel — sometimes more than the trip out did.&rdquo;
            </p>
            <div className="relative mt-6 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-white/20 grid place-items-center text-[13px] font-bold">
                FO
              </div>
              <div>
                <div className="text-[13.5px] font-bold">Fleet owner</div>
                <div className="text-[11.5px] text-white/70">Patna–Delhi corridor · illustrative</div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
