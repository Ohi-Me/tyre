"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Sun, Moon, Monitor } from "lucide-react";

/**
 * Theme control.
 *  - variant="switch": a 3-way segmented light / system / dark control (footer).
 *  - variant="icon": a single button that cycles light → dark (nav).
 */
export function ThemeToggle({ variant = "switch" }: { variant?: "switch" | "icon" }) {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (variant === "icon") {
    const isDark = mounted && resolvedTheme === "dark";
    return (
      <button
        onClick={() => setTheme(isDark ? "light" : "dark")}
        aria-label="Toggle theme"
        className="grid place-items-center w-9 h-9 rounded-full text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--secondary)] transition-colors"
      >
        {mounted && (isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />)}
      </button>
    );
  }

  const opts = [
    { key: "light", icon: Sun, label: "Light" },
    { key: "system", icon: Monitor, label: "System" },
    { key: "dark", icon: Moon, label: "Dark" },
  ] as const;

  return (
    <div className="inline-flex items-center gap-0.5 rounded-full border border-white/15 p-0.5">
      {opts.map((o) => {
        const activeKey = mounted ? theme : "light";
        const isActive = activeKey === o.key;
        return (
          <button
            key={o.key}
            onClick={() => setTheme(o.key)}
            aria-label={o.label}
            title={o.label}
            className={`grid place-items-center w-7 h-7 rounded-full transition-colors ${
              isActive ? "bg-white text-[#0A0A0A]" : "text-white/60 hover:text-white"
            }`}
          >
            <o.icon className="w-3.5 h-3.5" />
          </button>
        );
      })}
    </div>
  );
}
