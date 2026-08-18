"use client";

/**
 * ATMOSPHERE — the environment behind the road.
 *
 * Slow gradient drift, a faint star field, floating cargo motes, an AI network
 * that quietly pulses, abstract route nodes, drifting fog and the occasional
 * volumetric light ray. Everything lives between 3–10% opacity so it reads as
 * depth, never decoration. Layers accept the hero's parallax so the whole scene
 * has physical depth as the cursor moves.
 */
import { motion, useMotionValue, useTransform, type MotionValue } from "framer-motion";
import { useMemo } from "react";

type PV = MotionValue<number> | undefined;

const rand = (seed: number) => {
  const x = Math.sin(seed * 999.13) * 43758.5453;
  return x - Math.floor(x);
};

export function Atmosphere({ nx, ny, reduce }: { nx?: PV; ny?: PV; reduce: boolean }) {
  const zero = useMotionValue(0);
  const sx = nx ?? zero;
  const sy = ny ?? zero;

  const bgX = useTransform(sx, [-1, 1], [-2, 2]);
  const bgY = useTransform(sy, [-1, 1], [-2, 2]);
  const netX = useTransform(sx, [-1, 1], [-8, 8]);
  const netY = useTransform(sy, [-1, 1], [-8, 8]);
  const moteX = useTransform(sx, [-1, 1], [-22, 22]);
  const moteY = useTransform(sy, [-1, 1], [-22, 22]);

  const par = !reduce && !!nx && !!ny;

  const stars = useMemo(
    () =>
      Array.from({ length: 46 }, (_, i) => ({
        x: rand(i + 1) * 100,
        y: rand(i + 7) * 100,
        s: 0.6 + rand(i + 3) * 1.6,
        d: 3 + rand(i + 5) * 5,
        delay: rand(i + 9) * 6,
      })),
    []
  );

  const motes = useMemo(
    () =>
      Array.from({ length: 16 }, (_, i) => ({
        x: rand(i + 21) * 100,
        y: 20 + rand(i + 27) * 70,
        s: 2 + rand(i + 23) * 3,
        dur: 10 + rand(i + 25) * 12,
        delay: rand(i + 29) * 10,
        dx: (rand(i + 31) - 0.5) * 30,
      })),
    []
  );

  const nodes = useMemo(
    () =>
      Array.from({ length: 9 }, (_, i) => ({
        x: 8 + rand(i + 41) * 84,
        y: 10 + rand(i + 47) * 80,
        delay: rand(i + 43) * 4,
      })),
    []
  );

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* deep base wash */}
      <div className="absolute inset-0 bg-[radial-gradient(120%_90%_at_50%_-10%,rgba(61,107,255,0.10),transparent_55%)]" />

      {/* slow drifting gradient blobs */}
      <motion.div style={par ? { x: bgX, y: bgY } : undefined} className="absolute inset-0">
        {!reduce && (
          <>
            <div
              className="tyre-aurora absolute -top-40 -left-24 w-[560px] h-[560px] rounded-full blur-[130px] opacity-[0.45]"
              style={{ background: "radial-gradient(circle,#2C46C8 0%,transparent 62%)" }}
            />
            <div
              className="tyre-aurora absolute top-1/3 -right-28 w-[520px] h-[520px] rounded-full blur-[140px] opacity-[0.34]"
              style={{ background: "radial-gradient(circle,#45D8FF 0%,transparent 64%)", animationDelay: "-7s" }}
            />
            <div
              className="tyre-aurora absolute -bottom-52 left-1/4 w-[560px] h-[440px] rounded-full blur-[150px] opacity-[0.28]"
              style={{ background: "radial-gradient(circle,#3D6BFF 0%,transparent 65%)", animationDelay: "-13s" }}
            />
          </>
        )}
      </motion.div>

      {/* survey grid */}
      <div className="absolute inset-0 opacity-[0.22] tyre-grid-bg-light" />

      {/* star field */}
      <div className="absolute inset-0">
        {stars.map((s, i) => (
          <span
            key={i}
            className={reduce ? "absolute rounded-full bg-white/40" : "tyre-twinkle absolute rounded-full bg-white/70"}
            style={{
              left: `${s.x}%`,
              top: `${s.y}%`,
              width: s.s,
              height: s.s,
              animationDuration: `${s.d}s`,
              animationDelay: `${s.delay}s`,
            }}
          />
        ))}
      </div>

      {/* AI network + route nodes */}
      <motion.svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        style={par ? { x: netX, y: netY } : undefined}
        className="absolute inset-0 h-full w-full opacity-[0.55]"
        aria-hidden
      >
        {nodes.map((n, i) => {
          const m = nodes[(i + 1) % nodes.length];
          if (!m) return null;
          return (
            <line key={`l${i}`} x1={n.x} y1={n.y} x2={m.x} y2={m.y} stroke="rgba(108,140,255,0.10)" strokeWidth="0.15" />
          );
        })}
        {nodes.map((n, i) => (
          <circle
            key={`n${i}`}
            cx={n.x}
            cy={n.y}
            r="0.55"
            fill="#6C8CFF"
            className={reduce ? undefined : "tyre-node"}
            style={{ animationDelay: `${n.delay}s` }}
          />
        ))}
      </motion.svg>

      {/* volumetric rays */}
      {!reduce && (
        <>
          <div
            className="tyre-ray absolute -top-1/4 left-1/4 h-[150%] w-40 rotate-[18deg] blur-2xl"
            style={{ background: "linear-gradient(to bottom,rgba(108,140,255,0.16),transparent 70%)" }}
          />
          <div
            className="tyre-ray absolute -top-1/4 right-1/3 h-[150%] w-28 rotate-[12deg] blur-2xl"
            style={{ background: "linear-gradient(to bottom,rgba(69,216,255,0.12),transparent 70%)", animationDelay: "-5s" }}
          />
        </>
      )}

      {/* fog */}
      {!reduce && (
        <>
          <div className="tyre-fog absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-t from-[rgba(61,107,255,0.10)] to-transparent" />
          <div
            className="tyre-fog absolute bottom-10 left-0 right-0 h-28 bg-gradient-to-t from-[rgba(69,216,255,0.08)] to-transparent"
            style={{ animationDelay: "-9s" }}
          />
        </>
      )}

      {/* floating cargo motes */}
      <motion.div style={par ? { x: moteX, y: moteY } : undefined} className="absolute inset-0">
        {!reduce &&
          motes.map((m, i) => (
            <span
              key={i}
              className="tyre-drift absolute rounded-full bg-[var(--tyre-signal-hot)]"
              style={{
                left: `${m.x}%`,
                top: `${m.y}%`,
                width: m.s,
                height: m.s,
                ["--dx" as string]: `${m.dx}px`,
                animationDuration: `${m.dur}s`,
                animationDelay: `${m.delay}s`,
                boxShadow: "0 0 8px rgba(108,140,255,0.75)",
              }}
            />
          ))}
      </motion.div>
    </div>
  );
}
