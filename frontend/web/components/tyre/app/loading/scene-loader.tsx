"use client";

/**
 * SCENE LOADER v2 — open, literal, fast.
 *
 * No card, no box: each module loads through a small scene sitting directly
 * on the page canvas, centered, with a quiet mono caption. Every scene
 * literally depicts the action — dispatching looks like a load leaving the
 * depot for a truck, tracking looks like a GPS lock, payments look like
 * money moving through settlement. Loops run ~2s so even a slow fetch feels
 * like a fast system.
 *
 * Rules: transform/opacity only, loops pause off-screen (useInView),
 * reduced motion shows a calm static frame, role="status" for AT.
 *
 * Usage: {isLoading ? <SceneLoader scene="dispatch" /> : <Content/>}
 */
import { useRef } from "react";
import { motion, useInView, useReducedMotion } from "framer-motion";
import {
  BarChart3,
  Boxes,
  Check,
  FileText,
  IndianRupee,
  Landmark,
  Lightbulb,
  Mic,
  Search,
  Sparkles,
  Truck,
  Users,
  Wallet,
  Warehouse,
  Wrench,
} from "lucide-react";

const EXPO = [0.19, 1, 0.22, 1] as const;
/* paper-canvas palette (adapts to dark mode via tokens) */
const FAINT = "var(--border)";
const DIM = "var(--muted-foreground)";
const LINE = "#4062E8"; /* paper-safe signal */
const DEEP = "var(--tyre-green-deep)";
const EMBER = "var(--tyre-ember)";

export type LoaderScene =
  | "drivers"
  | "fleet"
  | "dispatch"
  | "tracking"
  | "trips"
  | "marketplace"
  | "my_freight"
  | "payments"
  | "analytics"
  | "voice"
  | "dashboard"
  | "settings"
  | "copilot"
  | "search"
  | "knowledge";

const SCENE_LABEL: Record<LoaderScene, string> = {
  drivers: "Loading drivers",
  fleet: "Assembling fleet",
  dispatch: "Dispatching",
  tracking: "Acquiring GPS",
  trips: "Building timeline",
  marketplace: "Loading the board",
  my_freight: "Rolling out",
  payments: "Settling ledger",
  analytics: "Streaming data",
  voice: "Warming up",
  dashboard: "Coming online",
  settings: "Checking systems",
  copilot: "Thinking",
  search: "Indexing",
  knowledge: "Reading your documents",
};

export function SceneLoader({
  scene,
  label,
  compact = false,
}: {
  scene: LoaderScene;
  label?: string;
  compact?: boolean;
}) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.2 });
  const play = !reduce && inView;
  const text = label ?? SCENE_LABEL[scene];

  return (
    <div
      ref={ref}
      role="status"
      aria-label={text}
      className={`flex flex-col items-center justify-center gap-3 ${compact ? "py-10" : "py-20 sm:py-28"}`}
    >
      <div className="relative w-[280px] h-[76px] flex items-center justify-center" aria-hidden>
        <SceneArt scene={scene} play={play} />
      </div>
      <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--muted-foreground)]">
        {text}
        {play ? <Ellipsis /> : "…"}
      </div>
    </div>
  );
}

function Ellipsis() {
  return (
    <span className="inline-flex w-4">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          animate={{ opacity: [0.2, 1, 0.2] }}
          transition={{ duration: 1, repeat: Infinity, delay: i * 0.18 }}
        >
          .
        </motion.span>
      ))}
    </span>
  );
}

function SceneArt({ scene, play }: { scene: LoaderScene; play: boolean }) {
  switch (scene) {
    case "drivers":
      return <DriversScene play={play} />;
    case "fleet":
      return <FleetScene play={play} />;
    case "dispatch":
      return <DispatchScene play={play} />;
    case "tracking":
      return <TrackingScene play={play} />;
    case "trips":
      return <TripsScene play={play} />;
    case "marketplace":
      return <MarketplaceScene play={play} />;
    case "my_freight":
      return <MyFreightScene play={play} />;
    case "payments":
      return <PaymentsScene play={play} />;
    case "analytics":
      return <AnalyticsScene play={play} />;
    case "voice":
      return <VoiceScene play={play} />;
    case "dashboard":
      return <DashboardScene play={play} />;
    case "settings":
      return <SettingsScene play={play} />;
    case "copilot":
      return <CopilotScene play={play} />;
    case "search":
      return <SearchScene play={play} />;
    case "knowledge":
      return <KnowledgeScene play={play} />;
  }
}

/* ── KNOWLEDGE — doc → OCR → chunk → embed → graph ── */
function KnowledgeScene({ play }: { play: boolean }) {
  const stages = [
    { icon: FileText, k: "doc" },
    { icon: Search, k: "ocr" },
    { icon: Boxes, k: "chunk" },
    { icon: Sparkles, k: "embed" },
    { icon: Wrench, k: "graph" },
  ];
  return (
    <div className="relative w-full flex items-center justify-between px-6">
      <div className="absolute left-12 right-12 top-1/2 h-px bg-[var(--border)]" />
      {stages.map((s, i) => (
        <div key={s.k} className="relative flex flex-col items-center gap-1.5">
          <motion.span
            className="grid place-items-center w-9 h-9 rounded-xl border bg-card"
            animate={
              play
                ? { borderColor: [FAINT, "rgba(44,70,200,0.6)", FAINT], color: [DIM, "#2C46C8", DIM], scale: [1, 1.08, 1] }
                : { borderColor: "rgba(44,70,200,0.4)", color: "#2C46C8" }
            }
            transition={play ? { duration: 1.6, repeat: Infinity, delay: i * 0.3, times: [0, 0.2, 1] } : undefined}
            style={{ borderWidth: 1 }}
          >
            <s.icon className="w-4 h-4" />
          </motion.span>
          <span className="font-mono text-[8px] uppercase tracking-[0.12em] text-[var(--muted-foreground)]">{s.k}</span>
        </div>
      ))}
      {/* the document travelling the pipeline */}
      <motion.span
        className="absolute top-1/2 -translate-y-1/2 -mt-3 grid place-items-center w-5 h-5 rounded-md bg-[var(--tyre-signal)] text-white shadow-[0_4px_12px_-4px_rgba(61,107,255,0.7)]"
        animate={play ? { left: ["9%", "87%"] } : { left: "48%" }}
        transition={play ? { duration: 1.6, repeat: Infinity, ease: [0.2, 0, 0, 1] } : undefined}
      >
        <FileText className="w-3 h-3" />
      </motion.span>
    </div>
  );
}

/* ── shared ── */

function TruckChip({ size = 9 }: { size?: number }) {
  return (
    <span
      className="grid place-items-center rounded-xl bg-[var(--tyre-ink)] text-[var(--tyre-signal)] shadow-[0_6px_16px_-6px_rgba(18,16,11,0.4)]"
      style={{ width: size * 4, height: size * 4 }}
    >
      <Truck style={{ width: size * 1.9, height: size * 1.9 }} />
    </span>
  );
}

function Lane({ className = "" }: { className?: string }) {
  return <div className={`text-[rgba(18,16,11,0.22)] tyre-lane ${className}`} />;
}

/* ── DRIVERS — the pickup run: the van drives the lane and each driver
       stop lights up exactly as the van passes it (synced, not random) ── */
function DriversScene({ play }: { play: boolean }) {
  const STOPS = [30, 94, 158, 222]; // px along the lane
  const DUR = 1.8;
  return (
    <div className="relative w-full h-full">
      <Lane className="absolute inset-x-4 bottom-4" />
      {/* the van */}
      <motion.div
        className="absolute bottom-6"
        animate={play ? { x: [4, 236] } : { x: 110 }}
        transition={play ? { duration: DUR, repeat: Infinity, ease: "linear" } : undefined}
      >
        <TruckChip />
      </motion.div>
      {/* stops with map-pin stems; each ignites as the van reaches it */}
      {STOPS.map((x, i) => (
        <motion.span
          key={x}
          className="absolute top-0 flex flex-col items-center"
          style={{ left: x }}
          animate={
            play
              ? { opacity: [0.25, 0.25, 1, 1, 0.25], y: [3, 3, 0, 0, 3] }
              : { opacity: 1, y: 0 }
          }
          transition={
            play
              ? { duration: DUR, repeat: Infinity, times: [0, Math.max(0.01, (i + 0.2) / 4.6), (i + 0.9) / 4.6, 0.96, 1] }
              : undefined
          }
        >
          <span className="grid place-items-center w-7 h-7 rounded-full bg-[var(--tyre-mint)] text-[var(--tyre-green-deep)] shadow-[0_4px_10px_-4px_rgba(44,70,200,0.4)]">
            <Users className="w-3.5 h-3.5" />
          </span>
          <span className="w-px h-4 bg-[var(--border)]" />
        </motion.span>
      ))}
    </div>
  );
}

/* ── FLEET — the depot fills: parking bays, trucks reverse in one by one
       and settle with a brake dip; the bay lights when occupied ── */
function FleetScene({ play }: { play: boolean }) {
  const DUR = 2.1;
  return (
    <div className="relative w-full h-full flex items-end justify-center gap-3 pb-1">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="relative flex flex-col items-center">
          {/* the truck arrives into its bay */}
          <motion.div
            animate={
              play
                ? { y: [-46, 2, 0, 0, -46], opacity: [0, 1, 1, 1, 0] }
                : { y: 0, opacity: 1 }
            }
            transition={
              play
                ? { duration: DUR, repeat: Infinity, delay: i * 0.35, ease: [0.05, 0.7, 0.1, 1], times: [0, 0.22, 0.28, 0.85, 1] }
                : undefined
            }
          >
            <TruckChip size={8} />
          </motion.div>
          {/* parking bay outline lights up when occupied */}
          <motion.span
            className="mt-1 h-1 w-9 rounded-full"
            animate={
              play
                ? { backgroundColor: ["rgba(18,16,11,0.1)", "rgba(18,16,11,0.1)", "#3D6BFF", "#3D6BFF", "rgba(18,16,11,0.1)"] }
                : { backgroundColor: "#3D6BFF" }
            }
            transition={play ? { duration: DUR, repeat: Infinity, delay: i * 0.35, times: [0, 0.2, 0.3, 0.85, 1] } : undefined}
          />
        </div>
      ))}
    </div>
  );
}

/* ── DISPATCH — a load leaves the depot and lands on a truck ── */
function DispatchScene({ play }: { play: boolean }) {
  return (
    <div className="relative w-full h-full">
      {/* depot */}
      <span className="absolute left-6 top-1/2 -translate-y-1/2 grid place-items-center w-10 h-10 rounded-xl bg-[var(--secondary)] text-[var(--tyre-ink-soft)]">
        <Warehouse className="w-5 h-5" />
      </span>
      {/* truck */}
      <span className="absolute right-6 top-1/2 -translate-y-1/2">
        <TruckChip size={10} />
      </span>
      {/* route between them */}
      <div className="absolute left-20 right-20 top-1/2 h-px bg-[var(--border)]" />
      {/* the load being dispatched */}
      <motion.span
        className="absolute top-1/2 -mt-3 grid place-items-center w-6 h-6 rounded-md bg-[var(--tyre-signal)] text-white shadow-[0_4px_12px_-4px_rgba(64,98,232,0.8)]"
        animate={play ? { left: [74, 194], opacity: [0, 1, 1, 0], scale: [0.7, 1, 1, 0.7] } : { left: 134, opacity: 1 }}
        transition={play ? { duration: 1.4, repeat: Infinity, ease: [0.3, 0, 0.2, 1], times: [0, 0.15, 0.85, 1] } : undefined}
      >
        <Boxes className="w-3.5 h-3.5" />
      </motion.span>
      {/* confirmation ping on the truck */}
      <motion.span
        className="absolute right-4 top-2 grid place-items-center w-4 h-4 rounded-full bg-[var(--tyre-mint)] text-[var(--tyre-green-deep)]"
        animate={play ? { scale: [0, 1.2, 1, 0], opacity: [0, 1, 1, 0] } : { scale: 1, opacity: 1 }}
        transition={play ? { duration: 1.4, repeat: Infinity, delay: 1.5, times: [0, 0.4, 0.8, 1] } : undefined}
      >
        <Check className="w-2.5 h-2.5" />
      </motion.span>
    </div>
  );
}

/* ── TRACKING — GPS dot rides the route; pings ripple ── */
function TrackingScene({ play }: { play: boolean }) {
  const path = "M8 62 C 66 56, 96 24, 148 30 S 236 8, 272 6";
  return (
    <svg viewBox="0 0 280 70" className="w-full h-full" fill="none">
      <path d={path} stroke={FAINT} strokeWidth="2" strokeLinecap="round" strokeDasharray="1 7" />
      <motion.path
        d={path}
        stroke={LINE}
        strokeWidth="2.5"
        strokeLinecap="round"
        animate={play ? { pathLength: [0, 1] } : { pathLength: 1 }}
        transition={play ? { duration: 1.6, repeat: Infinity, ease: EXPO } : undefined}
      />
      <circle cx="272" cy="6" r="4" fill="none" stroke={LINE} strokeWidth="2" />
      <circle r="5" fill={LINE} cx={play ? undefined : 148} cy={play ? undefined : 30}>
        {play && <animateMotion dur="1.6s" repeatCount="indefinite" path={path} />}
      </circle>
    </svg>
  );
}

/* ── TRIPS — pins drop onto the route one by one, the road connects them,
       and a flag plants at the destination ── */
function TripsScene({ play }: { play: boolean }) {
  const stops = ["PAT", "AUR", "KNP", "DEL"];
  const DUR = 1.9;
  return (
    <div className="w-full px-6">
      <div className="flex justify-between mb-2.5">
        {stops.map((s, i) => (
          <motion.span
            key={s}
            className="flex flex-col items-center gap-1"
            animate={play ? { y: [-14, 2, 0, 0, -14], opacity: [0, 1, 1, 1, 0] } : { y: 0, opacity: 1 }}
            transition={
              play
                ? { duration: DUR, repeat: Infinity, delay: i * 0.32, ease: [0.2, 0.9, 0.2, 1.2], times: [0, 0.18, 0.24, 0.85, 1] }
                : undefined
            }
          >
            <span
              className={`grid place-items-center w-5 h-5 rounded-full ${
                i === stops.length - 1 ? "bg-[var(--tyre-ember)] text-white" : "bg-[#3D6BFF] text-white"
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-white" />
            </span>
            <span className="font-mono text-[8.5px] tracking-[0.12em] text-[var(--muted-foreground)]">{s}</span>
          </motion.span>
        ))}
      </div>
      {/* the road connects the pins as they land */}
      <div className="relative h-[2px] bg-[var(--border)] rounded-full">
        <motion.div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ background: "var(--tyre-gradient)" }}
          animate={play ? { width: ["0%", "0%", "100%", "100%", "0%"] } : { width: "100%" }}
          transition={play ? { duration: DUR, repeat: Infinity, ease: EXPO, times: [0, 0.15, 0.7, 0.9, 1] } : undefined}
        />
      </div>
    </div>
  );
}

/* ── MARKETPLACE — supply meets demand: a vehicle card slides in from the
       left, a request from the right, they meet and the deal ticks ── */
function MarketplaceScene({ play }: { play: boolean }) {
  const DUR = 1.9;
  return (
    <div className="relative w-full h-full flex items-center justify-center">
      {/* vehicle (supply) card from the left */}
      <motion.div
        className="absolute rounded-lg border border-[var(--border)] bg-card px-2.5 py-2 shadow-[0_8px_20px_-10px_rgba(18,16,11,0.3)]"
        animate={play ? { x: [-110, -46, -46, -110], opacity: [0, 1, 1, 0] } : { x: -46, opacity: 1 }}
        transition={play ? { duration: DUR, repeat: Infinity, ease: EXPO, times: [0, 0.25, 0.85, 1] } : undefined}
      >
        <div className="flex items-center gap-1.5">
          <Truck className="w-3.5 h-3.5 text-[var(--tyre-green-deep)]" />
          <span className="font-mono text-[10px] font-bold text-[var(--tyre-ink)]">3 seats</span>
        </div>
      </motion.div>
      {/* request (demand) card from the right */}
      <motion.div
        className="absolute rounded-lg border border-[var(--border)] bg-card px-2.5 py-2 shadow-[0_8px_20px_-10px_rgba(18,16,11,0.3)]"
        animate={play ? { x: [110, 46, 46, 110], opacity: [0, 1, 1, 0] } : { x: 46, opacity: 1 }}
        transition={play ? { duration: DUR, repeat: Infinity, ease: EXPO, times: [0, 0.25, 0.85, 1] } : undefined}
      >
        <div className="flex items-center gap-1.5">
          <Users className="w-3.5 h-3.5 text-[var(--tyre-ember)]" />
          <span className="font-mono text-[10px] font-bold text-[var(--tyre-ink)]">₹162</span>
        </div>
      </motion.div>
      {/* the match — sparks when they meet */}
      <motion.span
        className="relative z-10 grid place-items-center w-8 h-8 rounded-full bg-[var(--tyre-signal)] text-white shadow-[0_0_20px_rgba(61,107,255,0.5)]"
        animate={play ? { scale: [0, 0, 1.15, 1, 1, 0], opacity: [0, 0, 1, 1, 1, 0] } : { scale: 1, opacity: 1 }}
        transition={play ? { duration: DUR, repeat: Infinity, ease: EXPO, times: [0, 0.3, 0.42, 0.5, 0.85, 1] } : undefined}
      >
        <Check className="w-4 h-4" />
      </motion.span>
    </div>
  );
}

/* ── MY FREIGHT — the gate lifts, your truck pulls out ── */
function MyFreightScene({ play }: { play: boolean }) {
  return (
    <div className="relative w-full h-full overflow-hidden">
      <Lane className="absolute inset-x-4 bottom-4" />
      <div className="absolute left-12 top-2 bottom-4 w-px bg-[rgba(18,16,11,0.25)]" />
      <motion.div
        className="absolute left-12 top-3 w-9 h-[3px] rounded-full bg-[var(--tyre-ember)] origin-left"
        animate={play ? { rotate: [0, -64, -64, 0] } : { rotate: -64 }}
        transition={play ? { duration: 1.6, repeat: Infinity, times: [0, 0.25, 0.8, 1], ease: EXPO } : undefined}
      />
      <motion.div
        className="absolute bottom-6"
        animate={play ? { x: [8, 232], opacity: [1, 1, 0] } : { x: 110, opacity: 1 }}
        transition={play ? { duration: 1.6, repeat: Infinity, delay: 0.35, ease: [0.4, 0, 0.6, 1], times: [0, 0.85, 1] } : undefined}
      >
        <TruckChip />
      </motion.div>
    </div>
  );
}

/* ── PAYMENTS — money hops invoice → escrow → UPI → settled ── */
function PaymentsScene({ play }: { play: boolean }) {
  const nodes = [FileText, Landmark, Wallet, Check];
  return (
    <div className="relative w-full flex items-center justify-between px-8">
      <div className="absolute left-14 right-14 top-1/2 h-px bg-[var(--border)]" />
      {nodes.map((Icon, i) => (
        <motion.span
          key={i}
          className="relative grid place-items-center w-9 h-9 rounded-xl border bg-card"
          animate={
            play
              ? { borderColor: [FAINT, "rgba(44,70,200,0.6)", FAINT], color: [DIM, "#2C46C8", DIM], scale: [1, 1.08, 1] }
              : { borderColor: "rgba(44,70,200,0.4)", color: "#2C46C8" }
          }
          transition={play ? { duration: 1.5, repeat: Infinity, delay: i * 0.35, times: [0, 0.2, 1] } : undefined}
          style={{ borderWidth: 1 }}
        >
          <Icon className="w-4 h-4" />
        </motion.span>
      ))}
      <motion.span
        className="absolute top-1/2 -translate-y-1/2 grid place-items-center w-5 h-5 rounded-full text-white shadow-[0_4px_12px_-4px_rgba(255,90,30,0.7)]"
        style={{ background: EMBER }}
        animate={play ? { left: ["12%", "84%"] } : { left: "48%" }}
        transition={play ? { duration: 1.5, repeat: Infinity, ease: [0.2, 0, 0, 1] } : undefined}
      >
        <IndianRupee className="w-3 h-3" />
      </motion.span>
    </div>
  );
}

/* ── ANALYTICS — bars grow from streaming data ── */
function AnalyticsScene({ play }: { play: boolean }) {
  const heights = [30, 52, 40, 68, 56, 74];
  return (
    <div className="flex items-end gap-2 h-full pb-2">
      {heights.map((h, i) => (
        <motion.span
          key={i}
          className="w-5 rounded-t-md origin-bottom"
          style={{ height: `${h}%`, background: i === 5 ? "var(--tyre-gradient)" : "var(--secondary)" }}
          animate={play ? { scaleY: [0, 1, 1, 0] } : { scaleY: 1 }}
          transition={play ? { duration: 1.6, repeat: Infinity, delay: i * 0.1, ease: EXPO, times: [0, 0.3, 0.85, 1] } : undefined}
        />
      ))}
      <BarChart3 className="w-4 h-4 mb-1 text-[var(--tyre-green-deep)]" />
    </div>
  );
}

/* ── VOICE — waveform breathes ── */
function VoiceScene({ play }: { play: boolean }) {
  return (
    <div className="flex items-center gap-4">
      <span className="grid place-items-center w-9 h-9 rounded-full bg-[var(--tyre-ink)] text-[var(--tyre-signal)]">
        <Mic className="w-4 h-4" />
      </span>
      <div className="flex items-end gap-[3px] h-12">
        {Array.from({ length: 18 }).map((_, i) => (
          <motion.span
            key={i}
            className="w-[3px] rounded-full bg-[#4062E8]"
            style={{ opacity: 0.5 + (i % 3) * 0.2, height: play ? undefined : `${20 + ((i * 9) % 55)}%` }}
            animate={
              play
                ? { height: [`${10 + ((i * 7) % 20)}%`, `${45 + ((i * 13) % 50)}%`, `${10 + ((i * 5) % 20)}%`] }
                : undefined
            }
            transition={play ? { duration: 0.8 + (i % 5) * 0.1, repeat: Infinity, ease: "easeInOut", delay: (i % 7) * 0.05 } : undefined}
          />
        ))}
      </div>
    </div>
  );
}

/* ── DASHBOARD — KPI tiles come online ── */
function DashboardScene({ play }: { play: boolean }) {
  return (
    <div className="grid grid-cols-4 gap-2 w-full px-6">
      {[0, 1, 2, 3].map((i) => (
        <motion.div
          key={i}
          className="h-12 rounded-lg border border-[var(--border)] bg-card p-1.5"
          animate={play ? { opacity: [0.2, 1, 1, 0.2], y: [4, 0, 0, 4] } : { opacity: 1 }}
          transition={play ? { duration: 1.6, repeat: Infinity, delay: i * 0.2, ease: EXPO, times: [0, 0.2, 0.85, 1] } : undefined}
        >
          <span className="block h-1.5 w-2/3 rounded bg-[var(--secondary)]" />
          <span className="mt-2 block h-2.5 w-1/2 rounded bg-[rgba(64,98,232,0.45)]" />
        </motion.div>
      ))}
    </div>
  );
}

/* ── SETTINGS — systems verify in order ── */
function SettingsScene({ play }: { play: boolean }) {
  const rows = [Wrench, Search, Check];
  return (
    <div className="w-full max-w-[200px] space-y-2">
      {rows.map((Icon, i) => (
        <motion.div
          key={i}
          className="flex items-center gap-2.5"
          animate={play ? { opacity: [0.25, 1, 1, 0.25] } : { opacity: 1 }}
          transition={play ? { duration: 1.5, repeat: Infinity, delay: i * 0.6, times: [0, 0.25, 0.9, 1] } : undefined}
        >
          <span className="grid place-items-center w-6 h-6 rounded-md bg-[var(--tyre-mint)] text-[var(--tyre-green-deep)]">
            <Icon className="w-3 h-3" />
          </span>
          <span className="h-1.5 flex-1 rounded bg-[var(--secondary)]" />
        </motion.div>
      ))}
    </div>
  );
}

/* ── COPILOT — plan → recall → tools → compose ── */
function CopilotScene({ play }: { play: boolean }) {
  const nodes = [Lightbulb, Boxes, Wrench, Sparkles];
  return (
    <div className="relative w-full flex items-center justify-between px-8">
      {nodes.map((Icon, i) => (
        <div key={i} className="flex items-center flex-1 last:flex-none">
          <motion.span
            className="grid place-items-center w-8 h-8 rounded-full border bg-card"
            animate={
              play
                ? { scale: [1, 1.12, 1], borderColor: [FAINT, "rgba(44,70,200,0.7)", FAINT], color: [DIM, "#2C46C8", DIM] }
                : { borderColor: "rgba(44,70,200,0.4)", color: "#2C46C8" }
            }
            transition={play ? { duration: 1.5, repeat: Infinity, delay: i * 0.35, times: [0, 0.25, 1] } : undefined}
            style={{ borderWidth: 1 }}
          >
            <Icon className="w-3.5 h-3.5" />
          </motion.span>
          {i < nodes.length - 1 && (
            <motion.span
              className="flex-1 h-px mx-1.5 origin-left bg-[rgba(64,98,232,0.6)]"
              animate={play ? { scaleX: [0, 1, 1, 0] } : { scaleX: 1 }}
              transition={play ? { duration: 1.5, repeat: Infinity, delay: 0.15 + i * 0.5, times: [0, 0.35, 0.9, 1] } : undefined}
            />
          )}
        </div>
      ))}
    </div>
  );
}

/* ── SEARCH — items flick past, matches pin ── */
function SearchScene({ play }: { play: boolean }) {
  return (
    <div className="w-full max-w-[200px]">
      <div className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-card px-2.5 py-1.5">
        <Search className="w-3.5 h-3.5 text-[var(--tyre-green-deep)]" />
        <motion.span
          className="h-1.5 rounded bg-[var(--secondary)]"
          animate={play ? { width: ["10%", "70%", "70%", "10%"] } : { width: "50%" }}
          transition={play ? { duration: 1.6, repeat: Infinity, times: [0, 0.4, 0.85, 1] } : undefined}
        />
      </div>
      <div className="mt-2 space-y-1.5">
        {[0, 1].map((i) => (
          <motion.div
            key={i}
            className="flex items-center gap-2"
            animate={play ? { opacity: [0, 1, 1, 0], x: [-5, 0, 0, -5] } : { opacity: 1 }}
            transition={play ? { duration: 1.6, repeat: Infinity, delay: 0.5 + i * 0.25, times: [0, 0.2, 0.85, 1] } : undefined}
          >
            <Check className="w-3 h-3 text-[var(--tyre-green-deep)]" />
            <span className="h-1.5 flex-1 rounded bg-[var(--secondary)]" />
          </motion.div>
        ))}
      </div>
    </div>
  );
}
