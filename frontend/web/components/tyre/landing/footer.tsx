"use client";

/**
 * FOOTER v3 — compact credits that still tell the story.
 * Top: what TYRE solves, as a living five-step strip (book → list back →
 * booked → track → paid) with icons that light in sequence. Middle: lean
 * link columns. Bottom: language picker on the LEFT, status + socials on
 * the right. Closes on the outlined wordmark.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useTyreUI } from "@/lib/tyre/store";
import { ThemeToggle } from "../theme-toggle";
import { LanguageMenu } from "./language-menu";
import { useHealth, HEALTH_LABEL, HEALTH_COLOR } from "@/lib/tyre/use-health";
import { motion, useReducedMotion } from "framer-motion";
import {
  BadgePercent,
  CarFront,
  Github,
  Linkedin,
  ListPlus,
  MapPin,
  Twitter,
  Wallet,
} from "lucide-react";

const PROCESS = [
  { icon: CarFront, label: "Ride there, booked" },
  { icon: ListPlus, label: "List the way back" },
  { icon: BadgePercent, label: "Discount window" },
  { icon: MapPin, label: "Tracked live" },
  { icon: Wallet, label: "Both ways paid" },
];

type FooterLink = { label: string; section?: string; href?: string; app?: boolean };
const COLUMNS: { title: string; links: FooterLink[] }[] = [
  {
    title: "Product",
    links: [
      { label: "Marketplace", app: true },
      { label: "Dispatch", app: true },
      { label: "Tracking", app: true },
      { label: "Pricing", href: "/pricing" },
      { label: "Trust", section: "trust" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", section: "product" },
      { label: "Careers", href: "mailto:careers@tyre.in" },
      { label: "Contact", href: "mailto:hello@tyre.in" },
      { label: "Status", href: "/status" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy", href: "/legal/privacy" },
      { label: "Terms", href: "/legal/terms" },
      { label: "RBI escrow policy", href: "/legal/escrow" },
    ],
  },
];

const SOCIALS = [
  { Icon: Twitter, href: "https://twitter.com/tyrefreight", label: "Twitter / X" },
  { Icon: Linkedin, href: "https://www.linkedin.com/company/tyrefreight", label: "LinkedIn" },
  { Icon: Github, href: "https://github.com/tyrefreight", label: "GitHub" },
];

export function LandingFooter() {
  const { enterApp } = useTyreUI();
  const t = useTranslations("landing");
  const { health } = useHealth();
  const status = health?.status ?? "healthy";
  const reduce = useReducedMotion();

  const [joined, setJoined] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    fetch("/api/v1/leads")
      .then((r) => r.json())
      .then((d) => {
        if (alive && typeof d?.count === "number") setJoined(d.count);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  /* light the process steps in sequence */
  const [lit, setLit] = useState(0);
  useEffect(() => {
    if (reduce) return;
    const i = setInterval(() => setLit((v) => (v + 1) % PROCESS.length), 1200);
    return () => clearInterval(i);
  }, [reduce]);

  const scrollTo = (id: string) =>
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <footer className="relative bg-[var(--tyre-panel)] text-[#F3F1E8] overflow-hidden">
      <div className="relative h-px bg-gradient-to-r from-transparent via-[rgba(61,107,255,0.4)] to-transparent" />

      <div className="relative max-w-7xl mx-auto px-5 sm:px-8">
        {/* ── What we solve — the loop, in one line ── */}
        <div className="py-10 border-b border-[rgba(243,241,232,0.09)]">
          <div className="flex flex-col lg:flex-row lg:items-center gap-6 lg:gap-10">
            <div className="shrink-0">
              <div className="flex items-start gap-[3px]">
                <span className="tyre-display text-[22px] tracking-tight text-[var(--tyre-violet)] leading-none">TYRE</span>
                <span className="mt-[3px] w-[5px] h-[5px] rounded-full bg-[var(--tyre-violet)]" />
              </div>
              <p className="text-[12.5px] text-[rgba(243,241,232,0.5)] mt-2 max-w-[26ch] leading-relaxed">
                {t("footer_tagline")}
              </p>
              <div className="mt-3 flex flex-col gap-1">
                <a href="mailto:hello@tyre.in" className="text-[12px] text-[rgba(243,241,232,0.55)] hover:text-white transition-colors">hello@tyre.in</a>
                <a href="mailto:careers@tyre.in" className="text-[12px] text-[rgba(243,241,232,0.55)] hover:text-white transition-colors">careers@tyre.in</a>
              </div>
            </div>
            <div className="flex-1 flex flex-wrap items-center gap-x-2 gap-y-3">
              {PROCESS.map((p, i) => {
                const on = reduce || i === lit;
                const done = !reduce && i < lit;
                return (
                  <div key={p.label} className="flex items-center">
                    <div className="flex items-center gap-2">
                      <motion.span
                        animate={{ scale: i === lit && !reduce ? 1.1 : 1 }}
                        transition={{ type: "spring", stiffness: 360, damping: 22 }}
                        className={`grid place-items-center w-8 h-8 rounded-xl border transition-colors duration-400 ${
                          on
                            ? "bg-[var(--tyre-violet)] border-[var(--tyre-violet)] text-white"
                            : done
                              ? "bg-[rgba(124,58,237,0.14)] border-[rgba(124,58,237,0.35)] text-[var(--tyre-violet)]"
                              : "bg-[rgba(243,241,232,0.04)] border-[rgba(243,241,232,0.12)] text-[rgba(243,241,232,0.4)]"
                        }`}
                      >
                        <p.icon className="w-3.5 h-3.5" />
                      </motion.span>
                      <span
                        className={`text-[11.5px] font-semibold transition-colors duration-400 ${
                          on ? "text-[#F3F1E8]" : "text-[rgba(243,241,232,0.45)]"
                        }`}
                      >
                        {p.label}
                      </span>
                    </div>
                    {i < PROCESS.length - 1 && (
                      <span className="mx-2.5 w-5 h-px bg-[rgba(243,241,232,0.15)] hidden sm:block" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── Lean columns ── */}
        <div className="py-8 grid grid-cols-3 gap-8 max-w-2xl">
          {COLUMNS.map((c) => (
            <div key={c.title}>
              <div className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.2em] text-[rgba(243,241,232,0.35)] mb-3">
                {c.title}
              </div>
              <ul className="space-y-2">
                {c.links.map((l) => {
                  const cls =
                    "tyre-link text-[12.5px] text-[rgba(243,241,232,0.6)] hover:text-[#F3F1E8] transition-colors cursor-pointer";
                  if (l.app)
                    return (
                      <li key={l.label}>
                        <button onClick={enterApp} className={cls}>
                          {l.label}
                        </button>
                      </li>
                    );
                  if (l.section)
                    return (
                      <li key={l.label}>
                        <button onClick={() => scrollTo(l.section!)} className={cls}>
                          {l.label}
                        </button>
                      </li>
                    );
                  return (
                    <li key={l.label}>
                      <a
                        href={l.href}
                        className={cls}
                        {...(l.href?.startsWith("http") ? { target: "_blank", rel: "noreferrer" } : {})}
                      >
                        {l.label}
                      </a>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>

        {/* ── Bottom bar — language LEFT ── */}
        <div className="py-6 border-t border-[rgba(243,241,232,0.09)] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <LanguageMenu direction="up" />
            <span className="text-[11.5px] text-[rgba(243,241,232,0.4)]">© 2026 TYRE Technologies Pvt. Ltd.</span>
            {joined !== null && joined > 0 && (
              <span className="hidden md:inline text-[11.5px] text-[rgba(243,241,232,0.5)]">
                {joined.toLocaleString()} operators joined
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/status"
              className="inline-flex items-center gap-1.5 text-[11.5px] text-[rgba(243,241,232,0.4)] hover:text-[rgba(243,241,232,0.7)] transition-colors"
            >
              <span className="w-1.5 h-1.5 rounded-full tyre-pulse-dot" style={{ background: HEALTH_COLOR[status] }} />
              {HEALTH_LABEL[status]}
            </Link>
            <div className="flex items-center">
              {SOCIALS.map(({ Icon, href, label }) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={label}
                  title={label}
                  className="grid place-items-center w-8 h-8 rounded-full text-[rgba(243,241,232,0.5)] hover:text-[#F3F1E8] hover:bg-[rgba(243,241,232,0.08)] transition-colors"
                >
                  <Icon className="w-4 h-4" />
                </a>
              ))}
            </div>
            <div className="w-px h-4 bg-[rgba(243,241,232,0.1)]" />
            <ThemeToggle variant="switch" />
          </div>
        </div>
      </div>

      {/* ── Closing frame ── */}
      <div className="relative select-none pointer-events-none" aria-hidden>
        <div
          className="mx-auto max-w-7xl px-5 sm:px-8 tyre-display-xl leading-none text-transparent text-[clamp(4rem,15vw,14rem)] -mb-[0.24em]"
          style={{ WebkitTextStroke: "1px rgba(243,241,232,0.12)" }}
        >
          TYRE
        </div>
      </div>
    </footer>
  );
}
