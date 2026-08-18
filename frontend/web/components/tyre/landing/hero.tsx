"use client";

/**
 * HERO v3 — "Daylight yard, violet signal."
 *
 * Marketing-page redesign: light cream background (matches the reference
 * moodboard) with a violet accent instead of the app's signal-blue/ember,
 * scoped to this page only via the new --tyre-violet-* tokens in globals.css.
 * Below the headline, a bento grid of small "moments" tiles (voice match,
 * live route, UPI settlement, trust score) replaces the single dark
 * CorridorScene card — each tile floats independently and lifts on hover.
 */
import { useRef, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { useTyreUI } from "@/lib/tyre/store";
import {
  ArrowRight,
  Play,
  Mic,
  Route,
  IndianRupee,
  Star,
  Users,
  Zap,
  TrendingUp,
  Wallet,
  CheckCircle2,
  Ban,
  RotateCcw,
} from "lucide-react";
import {
  motion,
  useMotionValue,
  useSpring,
  useReducedMotion,
  useInView,
} from "framer-motion";
import { useLandingStats } from "@/lib/tyre/use-landing-stats";

const EXPO = [0.19, 1, 0.22, 1] as const;

const TRUST_CHIPS = [
  { icon: IndianRupee, label: "₹0 to list" },
  { icon: CheckCircle2, label: "Fee only when booked" },
  { icon: RotateCcw, label: "Auto-refund on cancel" },
];

export function LandingHero() {
  const { enterApp } = useTyreUI();
  const t = useTranslations("landing");
  const m = useLandingStats();
  const reduce = useReducedMotion();

  /* gentle mouse parallax on the bento grid only — subtle, not a full scene */
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const px = useSpring(mx, { stiffness: 45, damping: 18 });
  const py = useSpring(my, { stiffness: 45, damping: 18 });

  const onMove = (e: ReactMouseEvent<HTMLElement>) => {
    if (reduce) return;
    const r = e.currentTarget.getBoundingClientRect();
    mx.set(((e.clientX - r.left) / r.width - 0.5) * 14);
    my.set(((e.clientY - r.top) / r.height - 0.5) * 14);
  };

  const STATS = [
    { icon: Users, value: m.drivers, label: "Drivers & listers", target: !m.live },
    { icon: Zap, value: m.booking_time, label: "Avg. leg booked in", target: true },
    { icon: TrendingUp, value: m.return_match, label: "Return legs filled", target: true },
    { icon: Wallet, value: m.earnings, label: "Extra earnings / day", target: true },
  ];

  return (
    <section
      id="home"
      onMouseMove={onMove}
      className="relative overflow-hidden bg-background text-foreground scroll-mt-20"
    >
      {/* ── soft violet blobs — the reference's signature glow, not a headlight ── */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="absolute -top-32 -right-24 w-[560px] h-[560px] rounded-full opacity-40 blur-3xl"
          style={{ background: "radial-gradient(circle, rgba(139,92,246,0.35) 0%, transparent 70%)" }}
        />
        <div
          className="absolute top-1/3 -left-32 w-[420px] h-[420px] rounded-full opacity-30 blur-3xl"
          style={{ background: "radial-gradient(circle, rgba(192,38,211,0.22) 0%, transparent 70%)" }}
        />
        <div className="absolute inset-0 opacity-[0.5] tyre-grid-bg" />
      </div>

      <div className="relative max-w-7xl mx-auto px-5 sm:px-8 pt-28 sm:pt-32 pb-14 sm:pb-20">
        {/* ── Badge ── */}
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: EXPO, delay: 0.1 }}
          className="mx-auto w-fit inline-flex items-center gap-2.5 rounded-full border border-[var(--border)] bg-card/80 backdrop-blur-sm px-3.5 py-1.5 shadow-[0_1px_2px_rgba(28,22,12,0.05)]"
        >
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full rounded-full bg-[var(--tyre-violet)] opacity-70 animate-ping" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--tyre-violet)]" />
          </span>
          <span className="font-mono text-[11px] tracking-[0.16em] uppercase text-[var(--muted-foreground)]">
            {t("hero_badge")}
          </span>
        </motion.div>

        {/* ── Headline — centered, violet accent both lines ── */}
        <h1 className="tyre-display-xl mt-8 text-center text-[clamp(2.6rem,1.3rem+6vw,6rem)] text-[var(--tyre-ink)]">
          <HeadLine a={t("hero_l1_a")} b={t("hero_l1_b")} delay={0.15} />
          <HeadLine a={t("hero_l2_a")} b={t("hero_l2_b")} delay={0.3} />
        </h1>

        <motion.p
          initial={reduce ? false : { opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: EXPO, delay: 0.55 }}
          className="mt-7 mx-auto text-center text-[var(--muted-foreground)] text-base sm:text-lg max-w-2xl leading-relaxed"
        >
          {t("hero_subtitle")}
        </motion.p>

        {/* ── CTAs ── */}
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: EXPO, delay: 0.68 }}
          className="mt-9 flex flex-col sm:flex-row gap-3 sm:items-center justify-center"
        >
          <button onClick={enterApp} className="group tyre-btn-violet tyre-focus text-[15px] px-7 py-3.5">
            {t("hero_cta_primary")}
            <ArrowRight className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-1" />
          </button>
          <button
            onClick={() => document.getElementById("product")?.scrollIntoView({ behavior: "smooth", block: "start" })}
            className="group tyre-focus inline-flex items-center justify-center gap-2 rounded-full border border-[var(--border)] bg-card px-7 py-3.5 text-[15px] font-semibold text-[var(--tyre-ink)] transition-all duration-300 hover:border-[var(--tyre-violet)] hover:text-[var(--tyre-violet)] active:scale-[0.97]"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            {t("hero_cta_secondary")}
          </button>
        </motion.div>

        {/* ── Trust chips — scannable proof points before the fold ── */}
        <motion.div
          initial={reduce ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, ease: EXPO, delay: 0.85 }}
          className="mt-6 flex flex-wrap items-center justify-center gap-2.5"
        >
          {TRUST_CHIPS.map((c) => (
            <span
              key={c.label}
              className="inline-flex items-center gap-1.5 rounded-full bg-[var(--tyre-violet-soft)] px-3 py-1.5 text-[11.5px] font-semibold text-[var(--tyre-violet-deep)]"
            >
              <c.icon className="w-3.5 h-3.5" />
              {c.label}
            </span>
          ))}
        </motion.div>

        {/* ── Bento collage — the product as a grid of moments ── */}
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 32 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, ease: EXPO, delay: 0.45 }}
          style={{ x: reduce ? 0 : px, y: reduce ? 0 : py }}
          className="mt-16 sm:mt-20"
        >
          <BentoCollage />
        </motion.div>

        {/* ── Odometer stats ── */}
        <div className="mt-14 sm:mt-16 grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-8 border-t border-[var(--border)] pt-8">
          {STATS.map((s, i) => (
            <Odometer key={s.label} icon={s.icon} value={s.value} label={s.label} target={s.target} delay={i * 0.08} />
          ))}
        </div>
      </div>
    </section>
  );
}

/* Headline line: both words rise from a mask; the second word carries the
   violet accent + serif-italic editorial voice. */
function HeadLine({ a, b, delay }: { a: string; b: string; delay: number }) {
  const reduce = useReducedMotion();
  return (
    <span className="block overflow-hidden pb-[0.06em]">
      <span className="inline-flex items-baseline justify-center gap-[0.26em] whitespace-nowrap">
        <motion.span
          className="inline-block"
          initial={reduce ? false : { y: "112%" }}
          animate={{ y: "0%" }}
          transition={{ duration: 0.9, ease: EXPO, delay }}
        >
          {a}
        </motion.span>
        <motion.span
          className="inline-block tyre-em"
          style={{ color: "var(--tyre-violet)" }}
          initial={reduce ? false : { y: "112%", rotate: 2 }}
          animate={{ y: "0%", rotate: 0 }}
          transition={{ duration: 0.9, ease: EXPO, delay: delay + 0.1 }}
        >
          {b}
        </motion.span>
      </span>
    </span>
  );
}

/* ── Bento tiles — each one a small proof of a real product moment ── */
function BentoCollage() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.2 });
  const reduce = useReducedMotion();

  return (
    <div ref={ref} className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 max-w-4xl mx-auto">
      <BentoTile className="col-span-2 row-span-2" delay={0} inView={inView} reduce={reduce}>
        <RouteTile />
      </BentoTile>
      <BentoTile className="col-span-2 sm:col-span-1" delay={0.08} inView={inView} reduce={reduce}>
        <VoiceTile />
      </BentoTile>
      <BentoTile className="col-span-2 sm:col-span-1" delay={0.14} inView={inView} reduce={reduce}>
        <SettlementTile />
      </BentoTile>
      <BentoTile className="col-span-1" delay={0.2} inView={inView} reduce={reduce}>
        <TrustTile />
      </BentoTile>
      <BentoTile className="col-span-1" delay={0.26} inView={inView} reduce={reduce}>
        <SafetyTile />
      </BentoTile>
    </div>
  );
}

function BentoTile({
  children,
  className,
  delay,
  inView,
  reduce,
}: {
  children: ReactNode;
  className?: string;
  delay: number;
  inView: boolean;
  reduce: boolean | null;
}) {
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 24, scale: 0.96 }}
      animate={inView ? { opacity: 1, y: 0, scale: 1 } : undefined}
      transition={{ duration: 0.7, ease: EXPO, delay }}
      className={`relative rounded-2xl bg-card border border-[var(--border)] p-4 overflow-hidden shadow-[0_1px_2px_rgba(28,22,12,0.05)] transition-shadow duration-500 hover:shadow-[0_24px_50px_-24px_rgba(124,58,237,0.35)] ${className ?? ""}`}
      style={reduce ? undefined : { animation: `tyre-float ${5 + delay * 3}s ease-in-out ${delay}s infinite` }}
    >
      {children}
    </motion.div>
  );
}

function RouteTile() {
  return (
    <div className="h-full flex flex-col justify-between min-h-[190px]">
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--tyre-violet-soft)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[var(--tyre-violet-deep)]">
          <Route className="w-3 h-3" /> Live route
        </span>
        <span className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-[var(--tyre-violet)]">
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--tyre-violet)] tyre-pulse-dot" />
          in motion
        </span>
      </div>
      <div className="flex justify-between font-mono text-[10px] tracking-[0.14em] uppercase text-[var(--muted-foreground)] mt-4">
        <span>Patna</span>
        <span className="text-[var(--tyre-violet-deep)] font-bold">1,040 km</span>
        <span>Delhi</span>
      </div>
      <svg className="mt-2 w-full h-20" viewBox="0 0 300 90" fill="none" preserveAspectRatio="none" aria-hidden>
        <path d="M6 74 C 60 66, 90 40, 140 44 S 240 20, 294 14" stroke="var(--tyre-violet-soft)" strokeWidth="3" strokeLinecap="round" />
        <path
          d="M6 74 C 60 66, 90 40, 140 44 S 240 20, 294 14"
          stroke="var(--tyre-violet)"
          strokeWidth="3"
          strokeLinecap="round"
          className="tyre-route"
        />
        <circle cx="294" cy="14" r="5" fill="var(--tyre-violet)" />
      </svg>
      <div className="mt-2 grid grid-cols-3 gap-2 text-center">
        {[["GPS", "live"], ["FASTag", "linked"], ["ETA", "14:20"]].map(([k, v]) => (
          <div key={k} className="rounded-lg bg-[var(--secondary)] py-1.5">
            <div className="font-mono text-[9px] uppercase tracking-wider text-[var(--muted-foreground)]">{k}</div>
            <div className="tyre-num text-[11.5px] font-bold text-[var(--tyre-violet-deep)] mt-0.5">{v}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function VoiceTile() {
  return (
    <div className="h-full flex flex-col justify-between min-h-[86px]">
      <div className="flex items-center gap-2">
        <span className="grid place-items-center w-7 h-7 rounded-full bg-[var(--tyre-violet)] text-white shrink-0">
          <Mic className="w-3.5 h-3.5" />
        </span>
        <span className="text-[11.5px] font-semibold text-[var(--tyre-ink)] leading-tight">
          &ldquo;Patna se Delhi load chahiye&rdquo;
        </span>
      </div>
      <div className="mt-3 flex items-end gap-[2.5px] h-7" aria-hidden>
        {Array.from({ length: 24 }).map((_, i) => (
          <motion.span
            key={i}
            className="w-[2.5px] rounded-full bg-[var(--tyre-violet)]"
            animate={{ height: [`${14 + ((i * 7) % 20)}%`, `${45 + ((i * 13) % 50)}%`, `${14 + ((i * 5) % 20)}%`] }}
            transition={{ duration: 1 + (i % 5) * 0.12, repeat: Infinity, ease: "easeInOut", delay: (i % 7) * 0.06 }}
            style={{ opacity: 0.4 + (i % 3) * 0.22 }}
          />
        ))}
      </div>
      <div className="mt-2 flex items-center justify-between text-[10.5px]">
        <span className="font-semibold text-[var(--tyre-ink)]">3 loads matched</span>
        <span className="tyre-num font-bold text-[var(--tyre-violet-deep)]">8s</span>
      </div>
    </div>
  );
}

function SettlementTile() {
  return (
    <div className="h-full flex flex-col justify-between min-h-[86px]">
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
          <IndianRupee className="w-3 h-3" /> UPI settlement
        </span>
        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#1C7C2E]">
          <CheckCircle2 className="w-3 h-3" /> instant
        </span>
      </div>
      <div className="mt-2 space-y-1.5">
        {[["Advance", "₹10,000"], ["Balance (POD)", "₹22,000"]].map(([k, v]) => (
          <div key={k} className="flex items-center justify-between text-[11px]">
            <span className="text-[var(--muted-foreground)]">{k}</span>
            <span className="tyre-num font-bold text-[var(--tyre-ink)]">{v}</span>
          </div>
        ))}
      </div>
      <div className="mt-2 pt-2 border-t border-dashed border-[var(--border)] flex items-center justify-between">
        <span className="text-[10.5px] font-semibold text-[var(--muted-foreground)]">Driver receives</span>
        <span className="tyre-num text-[16px] font-extrabold text-[var(--tyre-violet-deep)]">₹32,000</span>
      </div>
    </div>
  );
}

function TrustTile() {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center gap-1.5 min-h-[86px]">
      <div className="flex items-center gap-0.5 text-[var(--tyre-violet)]">
        {Array.from({ length: 5 }).map((_, i) => (
          <Star key={i} className="w-3.5 h-3.5 fill-current" />
        ))}
      </div>
      <div className="tyre-num text-[18px] font-extrabold text-[var(--tyre-ink)] leading-none">4.9</div>
      <div className="text-[10px] text-[var(--muted-foreground)]">driver trust score</div>
    </div>
  );
}

function SafetyTile() {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center gap-1.5 min-h-[86px]">
      <span className="grid place-items-center w-8 h-8 rounded-full bg-[var(--tyre-violet-soft)] text-[var(--tyre-violet-deep)]">
        <Ban className="w-4 h-4" />
      </span>
      <div className="text-[10.5px] font-semibold text-[var(--tyre-ink)] leading-tight">Fraud &amp; GSTIN checked</div>
      <div className="text-[10px] text-[var(--muted-foreground)]">before every match</div>
    </div>
  );
}

/* ── Odometer stat — mono numerals tick up into place ── */
function Odometer({
  icon: Icon,
  value,
  label,
  delay,
  target = false,
}: {
  icon: typeof Users;
  value: string;
  label: string;
  delay: number;
  target?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const reduce = useReducedMotion();

  return (
    <div ref={ref} className="flex items-center gap-3.5">
      <div className="shrink-0 grid place-items-center w-11 h-11 rounded-2xl border border-[var(--tyre-violet)]/25 bg-[var(--tyre-violet-soft)] text-[var(--tyre-violet-deep)]">
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <div className="tyre-num text-[22px] font-bold leading-none text-[var(--tyre-ink)] overflow-hidden">
          {inView &&
            value.split("").map((ch, i) => (
              <span
                key={i}
                className={reduce ? undefined : "tyre-tick"}
                style={reduce ? undefined : { animationDelay: `${delay + i * 0.045}s` }}
              >
                {ch}
              </span>
            ))}
          {!inView && <span className="opacity-0">{value}</span>}
        </div>
        <div className="text-[12px] text-[var(--muted-foreground)] mt-1.5">
          {label}
          {target && (
            <span className="ml-1.5 inline-block align-middle rounded-full border border-[var(--border)] px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide">
              target
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
