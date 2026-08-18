"use client";

import { useEffect, useState } from "react";
import { useTyreUI } from "@/lib/tyre/store";
import { ArrowUpRight } from "lucide-react";

/**
 * Floating "release" CTA pill (Noomo-style), fixed bottom-right. Slides in once
 * the visitor scrolls past the hero, with the signature ease-out-cubic.
 */
export function FloatingCta() {
  const { enterApp } = useTyreUI();
  const [show, setShow] = useState(false);

  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > window.innerHeight * 0.6);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <button
      onClick={enterApp}
      data-cursor
      aria-label="Open the network"
      className={`fixed right-5 bottom-5 z-40 inline-flex items-center gap-2 rounded-full bg-[var(--tyre-green)] text-[#06210a] px-5 py-3 text-[13.5px] font-semibold shadow-[0_12px_40px_-10px_rgba(143,224,58,0.6)] transition-all duration-500 ease-[var(--ease-cubic)] hover:scale-105 ${
        show ? "opacity-100 translate-y-0 pointer-events-auto" : "opacity-0 translate-y-4 pointer-events-none"
      }`}
    >
      Open the network
      <ArrowUpRight className="w-4 h-4" />
    </button>
  );
}
