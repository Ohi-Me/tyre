"use client";

/**
 * SCENE 5 — "The driver speaks Bhojpuri." (v2)
 *
 * Back to daylight — this is the human section. Left: the claim, plus all
 * of India's languages flowing past in two counter-rotating marquee rows
 * (not static chips: the languages are alive, like radio stations on a
 * long drive). Right: the voice console — an asphalt HUD with a breathing
 * waveform and a pipeline that types itself. The console is the one dark
 * object in the room, like a radio on a sunny dashboard.
 */
import { useEffect, useRef, useState } from "react";
import { motion, useInView, useReducedMotion } from "framer-motion";
import { Mic, Waves, Sparkles, Truck, CheckCircle2 } from "lucide-react";
import { Marquee } from "./motion";
import { useLandingStats } from "@/lib/tyre/use-landing-stats";

const EXPO = [0.19, 1, 0.22, 1] as const;

const LANGS_A = ["हिन्दी", "भोजपुरी", "বাংলা", "मराठी", "தமிழ்", "తెలుగు", "ಕನ್ನಡ", "ગુજરાતી"];
const LANGS_B = ["ਪੰਜਾਬੀ", "ଓଡ଼ିଆ", "മലയാളം", "অসমীয়া", "मैथिली", "छत्तीसगढ़ी", "राजस्थानी", "کٲشُر"];

const STEPS = [
  { icon: Mic, k: "Heard", v: "“Patna se Delhi load chahiye”", meta: "Bhojpuri" },
  { icon: Waves, k: "Transcribed", v: "Whisper Large v3 · fine-tuned", meta: "820ms" },
  { icon: Sparkles, k: "Understood", v: "Patna → Delhi · 16-ton container", meta: "intent" },
  { icon: Truck, k: "Matched", v: "₹42,000 · broker GSTIN verified", meta: "load" },
];

export function VoiceSection() {
  const m = useLandingStats();
  const reduce = useReducedMotion();

  return (
    <section id="voice" className="relative bg-background tyre-section overflow-hidden">
      <div className="relative max-w-7xl mx-auto px-5 sm:px-8 grid lg:grid-cols-[0.85fr_1.15fr] gap-12 lg:gap-16 items-center">
        {/* Left — the claim + living languages */}
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.7, ease: EXPO }}
        >
          <div className="tyre-eyebrow flex items-center gap-3">
            <span className="w-7 h-px bg-[var(--tyre-green-deep)]" />
            Voice-first wedge
          </div>
          <h2 className="tyre-h2 text-[var(--tyre-ink)] mt-5">
            The driver speaks <span className="tyre-em text-[var(--tyre-green-deep)]">Bhojpuri.</span>
            <br />
            The system just <span className="tyre-em">works.</span>
          </h2>
          <p className="text-[15px] sm:text-base text-[var(--muted-foreground)] mt-6 leading-relaxed max-w-lg">
            88% of Indian truck drivers don&apos;t read Hindi fluently — so voice isn&apos;t a feature,
            it&apos;s the only interface that works. One sentence becomes a matched, paid load.
          </p>

          <div className="mt-9">
            <div className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.2em] text-[var(--muted-foreground)] mb-4">
              {m.languages} Indian languages live
            </div>
            {/* two counter-flowing language rivers */}
            <div className="space-y-2.5 [mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)]">
              <Marquee slow>
                {LANGS_A.map((l) => (
                  <span
                    key={l}
                    className="mx-1.5 inline-flex items-center rounded-full border border-[var(--border)] bg-card px-4 py-1.5 text-[14px] text-[var(--tyre-ink)] whitespace-nowrap"
                  >
                    {l}
                  </span>
                ))}
              </Marquee>
              <Marquee slow reverse>
                {LANGS_B.map((l) => (
                  <span
                    key={l}
                    className="mx-1.5 inline-flex items-center rounded-full border border-[var(--border)] bg-card px-4 py-1.5 text-[14px] text-[var(--tyre-ink)] whitespace-nowrap"
                  >
                    {l}
                  </span>
                ))}
                <span className="mx-1.5 inline-flex items-center rounded-full bg-[var(--tyre-mint)] px-4 py-1.5 text-[13px] font-semibold text-[var(--tyre-green-deep)] whitespace-nowrap">
                  +33 more
                </span>
              </Marquee>
            </div>
          </div>
        </motion.div>

        {/* Right — the radio on the dashboard */}
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 40, rotate: 0.6 }}
          whileInView={{ opacity: 1, y: 0, rotate: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.9, ease: EXPO, delay: 0.1 }}
        >
          <VoiceConsole />
        </motion.div>
      </div>
    </section>
  );
}

function VoiceConsole() {
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.4 });
  const reduce = useReducedMotion();

  useEffect(() => {
    if (!inView || reduce) return;
    const t = setInterval(() => setActive((a) => (a + 1) % STEPS.length), 1900);
    return () => clearInterval(t);
  }, [inView, reduce]);

  return (
    <div
      ref={ref}
      className="relative rounded-[1.6rem] tyre-card-dark p-6 sm:p-7 tyre-grain overflow-hidden"
    >
      <span className="tyre-scan" aria-hidden />

      <div className="relative">
        {/* header + waveform */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="grid place-items-center w-9 h-9 rounded-full bg-[var(--tyre-signal)] text-[#12100B]">
              <Mic className="w-4 h-4" />
            </span>
            <div>
              <div className="text-[13px] font-semibold text-[#F3F1E8]">Live voice intake</div>
              <div className="text-[11px] text-[rgba(243,241,232,0.4)] font-mono">+91-TYRE-VOICE · Bhojpuri</div>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider text-[var(--tyre-signal)]">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--tyre-signal)] tyre-pulse-dot" /> rec
          </span>
        </div>

        <div className="mt-5 flex items-end justify-center gap-[3px] h-16" aria-hidden>
          {Array.from({ length: 44 }).map((_, i) => (
            <motion.span
              key={i}
              className="w-[3px] rounded-full bg-[var(--tyre-signal)]"
              animate={
                reduce
                  ? undefined
                  : { height: [`${8 + ((i * 7) % 22)}%`, `${40 + ((i * 13) % 55)}%`, `${8 + ((i * 5) % 22)}%`] }
              }
              transition={{ duration: 0.9 + (i % 5) * 0.12, repeat: Infinity, ease: "easeInOut", delay: (i % 7) * 0.05 }}
              style={{ opacity: 0.45 + (i % 3) * 0.22, height: reduce ? `${20 + ((i * 9) % 50)}%` : undefined }}
            />
          ))}
        </div>

        <div className="mt-4 rounded-2xl bg-[rgba(243,241,232,0.05)] tyre-toplight px-4 py-3 text-[14px] text-[#F3F1E8]">
          “Patna se Delhi load chahiye. Container 16 ton ka.”
        </div>

        {/* pipeline */}
        <div className="mt-6 space-y-1.5">
          {STEPS.map((s, i) => {
            const on = i === active;
            const done = i < active;
            return (
              <div key={s.k} className="flex items-center gap-3 py-1.5">
                <motion.span
                  animate={{ scale: on ? 1.1 : 1 }}
                  transition={{ type: "spring", stiffness: 360, damping: 22 }}
                  className={`shrink-0 grid place-items-center w-9 h-9 rounded-xl border transition-colors duration-500 ${
                    on
                      ? "bg-[var(--tyre-signal)] border-[var(--tyre-signal)] text-[#12100B]"
                      : done
                        ? "bg-[rgba(198,246,61,0.09)] border-[rgba(198,246,61,0.35)] text-[var(--tyre-signal)]"
                        : "bg-[rgba(243,241,232,0.04)] border-[rgba(243,241,232,0.12)] text-[rgba(243,241,232,0.4)]"
                  }`}
                >
                  <s.icon className="w-4 h-4" />
                </motion.span>
                <div className="min-w-0 flex-1">
                  <div className={`text-[12.5px] font-semibold transition-colors duration-500 ${on ? "text-[#F3F1E8]" : "text-[rgba(243,241,232,0.5)]"}`}>
                    {s.k}
                  </div>
                  <div className={`text-[12px] truncate transition-colors duration-500 ${on ? "text-[rgba(243,241,232,0.65)]" : "text-[rgba(243,241,232,0.3)]"}`}>
                    {s.v}
                  </div>
                </div>
                <span className={`text-[10.5px] font-mono shrink-0 transition-colors duration-500 ${on ? "text-[var(--tyre-signal)]" : "text-[rgba(243,241,232,0.25)]"}`}>
                  {s.meta}
                </span>
              </div>
            );
          })}
        </div>

        {/* result */}
        <div className="mt-5 rounded-xl border border-[rgba(198,246,61,0.3)] bg-[rgba(198,246,61,0.07)] px-4 py-3 flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 text-[var(--tyre-signal)] shrink-0" />
          <div>
            <div className="text-[12.5px] font-semibold text-[#F3F1E8]">Load accepted · ₹10,000 advance released</div>
            <div className="text-[11px] text-[rgba(243,241,232,0.5)] font-mono">2-minute voice KYC · no forms · FASTag linked</div>
          </div>
        </div>
      </div>
    </div>
  );
}
