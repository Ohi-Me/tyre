"use client";

/**
 * SCENE 7 — "The last exit." (v2)
 *
 * The ending is the beginning of the hero: night again, the same corridor,
 * but now the reader is the driver. A full-bleed asphalt band; traffic
 * streaks pass behind a road-sign headline; a live lane line runs beneath
 * the CTAs like the road is already moving. No gradient banner, no clip-art
 * truck — just the highway, the sign, and two ways onto it.
 */
import { useTyreUI } from "@/lib/tyre/store";
import { ArrowRight } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { LeadButton } from "./lead-dialog";

const EXPO = [0.19, 1, 0.22, 1] as const;

export function CtaSection() {
  const { enterApp } = useTyreUI();
  const reduce = useReducedMotion();

  return (
    <section className="relative bg-[var(--tyre-panel)] text-[#F3F1E8] overflow-hidden">
      {/* seam of light where the night begins */}
      <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-[rgba(124,58,237,0.5)] to-transparent" />

      {/* passing traffic */}
      {!reduce &&
        [0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className="tyre-streak absolute h-px w-52 bg-gradient-to-r from-transparent via-[rgba(243,241,232,0.3)] to-transparent"
            style={{
              top: `${18 + i * 20}%`,
              animationDuration: `${6 + i * 2.8}s`,
              animationDelay: `${i * 1.7}s`,
            }}
          />
        ))}

      {/* headlight rising from the road */}
      <div
        className="pointer-events-none absolute -bottom-44 left-1/2 -translate-x-1/2 w-[120%] h-[420px] opacity-[0.14]"
        style={{ background: "radial-gradient(60% 100% at 50% 100%, #7C3AED 0%, transparent 70%)" }}
      />
      <div className="absolute inset-0 tyre-grain pointer-events-none" aria-hidden />

      <div className="relative max-w-7xl mx-auto px-5 sm:px-8 py-20 sm:py-24 text-center">
        {/* road-sign eyebrow */}
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.7, ease: EXPO }}
          className="inline-flex items-center gap-2.5 rounded-lg border border-[rgba(124,58,237,0.35)] bg-[rgba(124,58,237,0.08)] px-4 py-1.5 font-mono text-[11px] uppercase tracking-[0.24em] text-[var(--tyre-violet-hot)]"
        >
          Next trip · both directions paid
        </motion.div>

        <h2 className="tyre-display-xl mt-8 text-[clamp(2.8rem,1.6rem+6vw,6.4rem)]">
          <span className="block overflow-hidden pb-[0.06em]">
            <motion.span
              className="inline-block"
              initial={reduce ? false : { y: "110%" }}
              whileInView={{ y: "0%" }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.9, ease: EXPO, delay: 0.1 }}
            >
              Never drive
            </motion.span>
          </span>
          <span className="block overflow-hidden pb-[0.08em]">
            <motion.span
              className="inline-block tyre-em text-[var(--tyre-violet-hot)]"
              initial={reduce ? false : { y: "110%" }}
              whileInView={{ y: "0%" }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.9, ease: EXPO, delay: 0.22 }}
            >
              back empty.
            </motion.span>
          </span>
        </h2>

        <motion.p
          initial={reduce ? false : { opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.8, ease: EXPO, delay: 0.35 }}
          className="mx-auto mt-6 max-w-lg text-[15px] sm:text-base text-[rgba(243,241,232,0.55)] leading-relaxed"
        >
          No setup. List the leg you were about to drive empty — car, van or truck —
          and the road starts paying you back in 60 seconds.
        </motion.p>

        <motion.div
          initial={reduce ? false : { opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.8, ease: EXPO, delay: 0.45 }}
          className="mt-10 flex flex-col sm:flex-row justify-center gap-3"
        >
          <button onClick={enterApp} className="group tyre-btn-violet tyre-focus text-[15px] px-8 py-4">
            Get started
            <ArrowRight className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-1" />
          </button>
          <LeadButton
            label="Talk to a fleet operator"
            variant="bare"
            className="inline-flex items-center justify-center gap-2 rounded-full border border-[rgba(243,241,232,0.25)] px-8 py-4 text-[15px] font-semibold text-[#F3F1E8] hover:border-[var(--tyre-violet-hot)] hover:text-[var(--tyre-violet-hot)] transition-all duration-300 active:scale-[0.97]"
          />
        </motion.div>

        {/* the road itself, already moving */}
        <div className="mt-12 mx-auto max-w-md text-[rgba(243,241,232,0.25)]">
          <div className="tyre-lane" />
        </div>
      </div>
    </section>
  );
}
