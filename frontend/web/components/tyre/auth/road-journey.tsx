"use client";

/**
 * ROAD JOURNEY — the road IS the onboarding.
 *
 * A single road self-draws, then illuminates from the start up to the user's
 * current progress (0→1). A glowing orb — the user's journey — rides that point
 * with a spring, trailing a fading comet tail, orbiting sparks and a soft bloom.
 * The camera drifts to keep the orb near centre. Milestone nodes light as the
 * journey passes them. Ambient trucks loop the road at different speeds with
 * head- and brake-lights. On launch the whole road ignites and the destination
 * blooms — the journey is completed.
 */
import {
  motion,
  useMotionValue,
  useMotionValueEvent,
  useSpring,
  useTransform,
  type MotionValue,
} from "framer-motion";
import { useEffect, useRef, useState } from "react";

const VB_W = 480;
const VB_H = 760;
const CENTER_Y = 380;

const ROAD =
  "M 120 720 C 60 628 250 598 220 508 S 56 430 214 360 S 404 300 280 220 S 132 168 320 108 S 430 66 360 24";

const MILESTONES = [
  { frac: 0.02, label: "Start" },
  { frac: 0.28, label: "Account" },
  { frac: 0.52, label: "Profile" },
  { frac: 0.76, label: "Fleet ready" },
  { frac: 0.99, label: "Dashboard" },
] as const;

type PV = MotionValue<number> | undefined;

export function RoadJourney({
  journey,
  launched,
  reduce,
  nx,
  ny,
}: {
  journey: number;
  launched: boolean;
  reduce: boolean;
  nx?: PV;
  ny?: PV;
}) {
  const roadRef = useRef<SVGPathElement | null>(null);
  const [len, setLen] = useState(0);
  const [pts, setPts] = useState<{ x: number; y: number; frac: number; label: string }[]>([]);

  // journey → smooth spring
  const jRaw = useMotionValue(0);
  const jSpring = useSpring(jRaw, { stiffness: 90, damping: 22, mass: 0.9 });
  useEffect(() => {
    jRaw.set(Math.max(0, Math.min(1, journey)));
  }, [journey, jRaw]);

  // orb position (SVG user space)
  const orbX = useMotionValue(120);
  const orbY = useMotionValue(720);
  const orbA = useMotionValue(0);

  // comet trail — springs of decreasing stiffness lag behind the orb
  const t1x = useSpring(orbX, { stiffness: 220, damping: 26 });
  const t1y = useSpring(orbY, { stiffness: 220, damping: 26 });
  const t2x = useSpring(orbX, { stiffness: 130, damping: 26 });
  const t2y = useSpring(orbY, { stiffness: 130, damping: 26 });
  const t3x = useSpring(orbX, { stiffness: 80, damping: 26 });
  const t3y = useSpring(orbY, { stiffness: 80, damping: 26 });

  // camera follows the orb vertically (subtle)
  const camRaw = useTransform(orbY, (y) => (CENTER_Y - y) * 0.16);
  const camY = useSpring(camRaw, { stiffness: 60, damping: 20 });

  // illuminated road: dashoffset shrinks as journey grows
  const litOffset = useTransform(jSpring, (j) => len * (1 - j));
  const flowOpacity = useTransform(jSpring, [0, 0.05, 1], [0, 0.7, 0.9]);

  // measure the road + milestone points once mounted
  useEffect(() => {
    const el = roadRef.current;
    if (!el) return;
    const total = el.getTotalLength();
    setLen(total);
    setPts(
      MILESTONES.map((m) => {
        const p = el.getPointAtLength(m.frac * total);
        return { x: p.x, y: p.y, frac: m.frac, label: m.label };
      })
    );
    const start = Math.max(0, Math.min(1, journey)) * total;
    const p0 = el.getPointAtLength(start);
    orbX.set(p0.x);
    orbY.set(p0.y);
  }, [orbX, orbY, journey]);

  // drive the orb along the path whenever the smoothed journey changes
  useMotionValueEvent(jSpring, "change", (j) => {
    const el = roadRef.current;
    if (!el || !len) return;
    const d = j * len;
    const p = el.getPointAtLength(d);
    const ahead = el.getPointAtLength(Math.min(len, d + 2));
    orbX.set(p.x);
    orbY.set(p.y);
    orbA.set((Math.atan2(ahead.y - p.y, ahead.x - p.x) * 180) / Math.PI);
  });

  // parallax
  const zero = useMotionValue(0);
  const sx = nx ?? zero;
  const sy = ny ?? zero;
  const roadPX = useTransform(sx, [-1, 1], [-6, 6]);
  const roadPY = useTransform(sy, [-1, 1], [-6, 6]);
  const orbPX = useTransform(sx, [-1, 1], [-12, 12]);
  const orbPY = useTransform(sy, [-1, 1], [-12, 12]);
  const par = !reduce && !!nx && !!ny;

  return (
    <motion.div
      style={par ? { x: roadPX, y: roadPY } : undefined}
      className="pointer-events-none absolute inset-0"
    >
      <svg viewBox={`0 0 ${VB_W} ${VB_H}`} preserveAspectRatio="xMidYMid slice" className="h-full w-full" aria-hidden>
        <defs>
          <linearGradient id="rj-road" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0" stopColor="#2C46C8" />
            <stop offset="0.55" stopColor="#3D6BFF" />
            <stop offset="1" stopColor="#45D8FF" />
          </linearGradient>
          <radialGradient id="rj-orb" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="#F2F7FF" />
            <stop offset="0.35" stopColor="#8FB0FF" />
            <stop offset="1" stopColor="#3D6BFF" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="rj-bloom" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="#6C8CFF" stopOpacity="0.55" />
            <stop offset="1" stopColor="#6C8CFF" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="rj-head" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="#EAF1FF" />
            <stop offset="1" stopColor="#EAF1FF" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="rj-brake" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="#FF5A1E" stopOpacity="0.8" />
            <stop offset="1" stopColor="#FF5A1E" stopOpacity="0" />
          </radialGradient>
        </defs>

        <motion.g style={{ y: camY }}>
          {/* faint base road (self-draws in) + motion track */}
          <path
            id="rj-track"
            ref={roadRef}
            d={ROAD}
            fill="none"
            stroke="rgba(243,241,232,0.09)"
            strokeWidth="18"
            strokeLinecap="round"
            className={reduce ? undefined : "tyre-route"}
          />

          {/* illuminated portion up to the journey point */}
          {len > 0 && (
            <motion.path
              d={ROAD}
              fill="none"
              stroke="url(#rj-road)"
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={len}
              style={{ strokeDashoffset: litOffset }}
              className={reduce ? undefined : "tyre-route-glow"}
            />
          )}

          {/* flowing centreline on the lit portion */}
          {len > 0 && (
            <motion.path
              d={ROAD}
              fill="none"
              stroke="rgba(234,241,255,0.9)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeDasharray="2 20"
              className={reduce ? undefined : "tyre-route-flow"}
              style={{ opacity: flowOpacity }}
            />
          )}

          {/* ambient trucks looping the road */}
          {!reduce &&
            len > 0 &&
            [
              { dur: 9, begin: 0, brake: false },
              { dur: 13, begin: -4, brake: true },
              { dur: 17, begin: -9, brake: false },
            ].map((t, i) => (
              <g key={i}>
                <g>
                  {/* headlight */}
                  <circle cx="7" cy="0" r="6" fill="url(#rj-head)" />
                  {/* brake glow */}
                  {t.brake && <circle cx="-6" cy="0" r="5" fill="url(#rj-brake)" />}
                  {/* body */}
                  <rect x="-6" y="-2.4" width="12" height="4.8" rx="1.5" fill="#DBE4FF" opacity="0.92" />
                  <rect x="-6" y="-2.4" width="4.5" height="4.8" rx="1.2" fill="#9DB4FF" opacity="0.9" />
                  <animateMotion dur={`${t.dur}s`} begin={`${t.begin}s`} repeatCount="indefinite" rotate="auto">
                    <mpath href="#rj-track" />
                  </animateMotion>
                </g>
              </g>
            ))}

          {/* milestone nodes */}
          {pts.map((p, i) => {
            const lit = journey >= p.frac - 0.01;
            return (
              <g key={i} transform={`translate(${p.x} ${p.y})`}>
                {lit && <circle r="11" fill="url(#rj-bloom)" />}
                <circle
                  r="5"
                  fill={lit ? "#6C8CFF" : "rgba(243,241,232,0.14)"}
                  stroke={lit ? "#DCE7FF" : "rgba(243,241,232,0.25)"}
                  strokeWidth="1.5"
                  className={lit && !reduce ? "tyre-pulse-dot" : undefined}
                />
                <text
                  x="14"
                  y="4"
                  fontSize="12"
                  fontFamily="var(--font-mono, monospace)"
                  letterSpacing="0.5"
                  fill={lit ? "rgba(243,241,232,0.9)" : "rgba(243,241,232,0.4)"}
                >
                  {p.label}
                </text>
              </g>
            );
          })}

          {/* comet trail */}
          <motion.circle r="5" fill="#8FB0FF" opacity="0.28" cx={t3x} cy={t3y} />
          <motion.circle r="4" fill="#A9C1FF" opacity="0.4" cx={t2x} cy={t2y} />
          <motion.circle r="3" fill="#CFE0FF" opacity="0.6" cx={t1x} cy={t1y} />

          {/* the journey orb */}
          <motion.g style={{ x: orbX, y: orbY }}>
            {/* bloom */}
            <circle r="26" fill="url(#rj-bloom)" className={reduce ? undefined : "tyre-route-glow"} />
            {/* headlight cone */}
            <motion.g style={{ rotate: orbA }}>
              <path d="M 0 0 L 34 -9 L 34 9 Z" fill="url(#rj-head)" opacity="0.4" />
            </motion.g>
            {/* glow disc */}
            <circle r="12" fill="url(#rj-orb)" />
            {/* core */}
            <circle r="5" fill="#F5F9FF" />
            <circle r="5" fill="none" stroke="#DCE7FF" strokeWidth="1" opacity="0.8" />
            {/* orbiting sparks */}
            {!reduce && (
              <g>
                <g>
                  <circle cx="14" cy="0" r="1.6" fill="#CFE0FF" />
                  <animateTransform attributeName="transform" type="rotate" from="0 0 0" to="360 0 0" dur="3.2s" repeatCount="indefinite" />
                </g>
                <g>
                  <circle cx="-16" cy="0" r="1.3" fill="#8FB0FF" />
                  <animateTransform attributeName="transform" type="rotate" from="360 0 0" to="0 0 0" dur="4.6s" repeatCount="indefinite" />
                </g>
              </g>
            )}
          </motion.g>

          {/* destination bloom on launch */}
          {pts[pts.length - 1] && (
            <motion.circle
              cx={pts[pts.length - 1].x}
              cy={pts[pts.length - 1].y}
              r="60"
              fill="url(#rj-bloom)"
              initial={{ opacity: 0, scale: 0.2 }}
              animate={launched ? { opacity: [0, 0.9, 0], scale: [0.2, 2.4, 3.2] } : { opacity: 0, scale: 0.2 }}
              transition={{ duration: 1.4, ease: [0.19, 1, 0.22, 1] }}
              style={{ transformOrigin: "center" }}
            />
          )}
        </motion.g>
      </svg>
    </motion.div>
  );
}
