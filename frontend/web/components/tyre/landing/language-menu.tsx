"use client";

/**
 * Language picker — 49 Indian languages, searchable.
 * Lives in the footer (left side). Opens upward by default.
 */
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { Check, Globe, Search } from "lucide-react";
import { INDIAN_LOCALES, Y1_ACTIVE_LOCALE_CODES } from "@tyre/i18n";
import { AnimatePresence, motion } from "framer-motion";

const EXPO = [0.19, 1, 0.22, 1] as const;

export function LanguageMenu({ direction = "up" }: { direction?: "up" | "down" }) {
  const router = useRouter();
  const currentLocale = useLocale();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(currentLocale);
  const ref = useRef<HTMLDivElement>(null);

  const [langs, setLangs] = useState(INDIAN_LOCALES);
  const [liveCodes, setLiveCodes] = useState<string[]>(Y1_ACTIVE_LOCALE_CODES);
  useEffect(() => {
    fetch("/api/v1/languages")
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d?.languages) && d.languages.length) setLangs(d.languages);
        if (Array.isArray(d?.live)) setLiveCodes(d.live);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const current = langs.find((l) => l.code === selected);
  const live = new Set<string>(liveCodes);
  const q = query.trim().toLowerCase();
  const list = q
    ? langs.filter(
        (l) =>
          l.name.toLowerCase().includes(q) ||
          l.native_name.toLowerCase().includes(q) ||
          l.code.toLowerCase().includes(q),
      )
    : langs;

  const pick = (code: string) => {
    setSelected(code);
    setOpen(false);
    setQuery("");
    if (live.has(code)) router.push(`/${code}`);
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 rounded-full border border-[rgba(243,241,232,0.18)] px-3.5 py-2 text-[13px] font-medium text-[rgba(243,241,232,0.7)] hover:text-[#F3F1E8] hover:border-[var(--tyre-signal)] transition-colors"
        aria-label="Choose language"
      >
        <Globe className="w-4 h-4" />
        <span>{current?.native_name ?? "English"}</span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: direction === "up" ? 8 : -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: direction === "up" ? 8 : -8, scale: 0.97 }}
            transition={{ duration: 0.25, ease: EXPO }}
            className={`absolute left-0 ${direction === "up" ? "bottom-full mb-2" : "top-full mt-2"} w-[320px] max-w-[88vw] rounded-2xl border border-[rgba(243,241,232,0.12)] bg-[rgba(16,14,10,0.97)] backdrop-blur-xl text-[#F3F1E8] shadow-[0_24px_60px_-20px_rgba(0,0,0,0.7),inset_0_1px_0_rgba(255,250,235,0.07)] overflow-hidden z-50`}
          >
            <div className="p-2.5 border-b border-[rgba(243,241,232,0.1)]">
              <div className="flex items-center justify-between px-1.5 pb-2">
                <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-[var(--tyre-signal)]">
                  {langs.length} Indian languages
                </span>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[rgba(243,241,232,0.4)]" />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search language…"
                  className="w-full h-9 pl-9 pr-3 rounded-xl bg-[rgba(243,241,232,0.06)] border border-transparent focus:border-[var(--tyre-signal)] focus:outline-none text-[13px] text-[#F3F1E8] placeholder:text-[rgba(243,241,232,0.35)]"
                />
              </div>
            </div>

            <div className="max-h-[300px] overflow-y-auto tyre-scroll p-1.5">
              {list.length === 0 && (
                <div className="px-3 py-6 text-center text-[13px] text-[rgba(243,241,232,0.4)]">No match</div>
              )}
              {list.map((l) => {
                const isSel = l.code === selected;
                return (
                  <button
                    key={l.code}
                    onClick={() => pick(l.code)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left transition-colors ${
                      isSel ? "bg-[rgba(61,107,255,0.15)]" : "hover:bg-[rgba(243,241,232,0.06)]"
                    }`}
                  >
                    <span className="text-[15px] text-[#F3F1E8] min-w-[88px]">{l.native_name}</span>
                    <span className="flex-1 text-[12px] text-[rgba(243,241,232,0.45)] truncate">{l.name}</span>
                    {live.has(l.code) && (
                      <span className="text-[9.5px] font-semibold uppercase tracking-wider text-[var(--tyre-signal)] bg-[rgba(61,107,255,0.15)] px-1.5 py-0.5 rounded-full">
                        Live
                      </span>
                    )}
                    {isSel && <Check className="w-3.5 h-3.5 text-[var(--tyre-signal)]" />}
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
