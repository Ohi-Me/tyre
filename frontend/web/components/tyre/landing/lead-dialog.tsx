"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X, ArrowRight, CheckCircle2, Loader2 } from "lucide-react";

const ROLES = [
  { key: "fleet", label: "Fleet operator" },
  { key: "broker", label: "Broker" },
  { key: "driver", label: "Driver" },
  { key: "shipper", label: "Shipper" },
  { key: "other", label: "Other" },
] as const;

/**
 * Lead-capture button + modal. Posts to /api/v1/leads (rate-limited, Redis-backed).
 * Drop in anywhere on the landing page with a label + variant.
 */
export function LeadButton({
  label,
  variant = "primary",
  className = "",
}: {
  label: string;
  variant?: "primary" | "ghost" | "light" | "bare";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const cls =
    variant === "bare"
      ? ""
      : variant === "primary"
      ? "tyre-btn-primary"
      : variant === "light"
      ? "inline-flex items-center justify-center gap-2 rounded-full bg-white text-[#0A0A0A] px-6 py-3 text-sm font-semibold hover:bg-white/90 transition-all active:scale-[0.98]"
      : "tyre-btn-secondary";

  return (
    <>
      <button onClick={() => setOpen(true)} className={`${cls} ${className}`}>
        {label}
      </button>
      <AnimatePresence>{open && <LeadModal onClose={() => setOpen(false)} />}</AnimatePresence>
    </>
  );
}

function LeadModal({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<string>("fleet");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done">("idle");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [position, setPosition] = useState<number | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setErrors({});
    try {
      const res = await fetch("/api/v1/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, phone, role, message }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        if (typeof data.position === "number") setPosition(data.position);
        setStatus("done");
      } else if (res.status === 422 && data.errors) {
        setErrors(data.errors);
        setStatus("idle");
      } else {
        setErrors({ form: data.error || "Something went wrong. Try again." });
        setStatus("idle");
      }
    } catch {
      setErrors({ form: "Network error. Please try again." });
      setStatus("idle");
    }
  }

  return (
    <motion.div
      className="fixed inset-0 z-[60] grid place-items-center p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        className="relative w-full max-w-md rounded-[1.5rem] border border-[var(--border)] bg-[var(--card)] p-6 sm:p-7 shadow-[0_40px_120px_-30px_rgba(0,0,0,0.5)]"
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.98 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      >
        <button onClick={onClose} className="absolute top-4 right-4 grid place-items-center w-8 h-8 rounded-full text-[var(--muted-foreground)] hover:bg-[var(--secondary)]" aria-label="Close">
          <X className="w-4 h-4" />
        </button>

        {status === "done" ? (
          <div className="py-6 text-center">
            <div className="mx-auto w-14 h-14 rounded-full bg-[var(--tyre-mint)] grid place-items-center mb-4">
              <CheckCircle2 className="w-7 h-7 text-[var(--tyre-green-deep)]" />
            </div>
            <h3 className="tyre-display text-[24px] text-[var(--tyre-ink)]">
              You're on the list{position ? <> — <span className="text-[var(--tyre-green-deep)]">#{position}</span></> : null}.
            </h3>
            <p className="text-[14px] text-[var(--muted-foreground)] mt-2">
              Our corridor team will call you on <span className="font-semibold text-[var(--tyre-ink)]">{phone}</span> within one working day.
            </p>
            <button onClick={onClose} className="tyre-btn-primary mt-6 w-full justify-center">Done</button>
          </div>
        ) : (
          <form onSubmit={submit}>
            <div className="tyre-eyebrow">Talk to TYRE</div>
            <h3 className="tyre-display text-[26px] text-[var(--tyre-ink)] mt-2">Move your first load.</h3>
            <p className="text-[13.5px] text-[var(--muted-foreground)] mt-1.5 mb-5">
              Leave your number — we onboard new fleets and brokers in under a day.
            </p>

            <label className="block text-[12px] font-semibold text-[var(--tyre-ink)] mb-1.5">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              className="w-full h-11 px-3.5 rounded-xl bg-[var(--secondary)] border border-[var(--border)] focus:border-[var(--tyre-green)] focus:outline-none text-[14px] mb-1"
            />
            {errors.name && <p className="text-[11.5px] text-[var(--destructive)] mb-2">{errors.name}</p>}

            <label className="block text-[12px] font-semibold text-[var(--tyre-ink)] mb-1.5 mt-3">Mobile number</label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              inputMode="numeric"
              placeholder="98765 43210"
              className="w-full h-11 px-3.5 rounded-xl bg-[var(--secondary)] border border-[var(--border)] focus:border-[var(--tyre-green)] focus:outline-none text-[14px] mb-1"
            />
            {errors.phone && <p className="text-[11.5px] text-[var(--destructive)] mb-2">{errors.phone}</p>}

            <label className="block text-[12px] font-semibold text-[var(--tyre-ink)] mb-1.5 mt-3">I am a…</label>
            <div className="flex flex-wrap gap-2 mb-1">
              {ROLES.map((r) => (
                <button
                  type="button"
                  key={r.key}
                  onClick={() => setRole(r.key)}
                  className={`px-3 py-1.5 rounded-full text-[12.5px] font-medium border transition-colors ${
                    role === r.key
                      ? "bg-[var(--tyre-ink)] text-[var(--background)] border-[var(--tyre-ink)]"
                      : "border-[var(--border)] text-[var(--muted-foreground)] hover:border-[var(--tyre-ink)]"
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
            {errors.role && <p className="text-[11.5px] text-[var(--destructive)] mb-2">{errors.role}</p>}

            {errors.form && (
              <p className="text-[12px] text-[var(--destructive)] mt-3 bg-[var(--destructive)]/10 rounded-lg px-3 py-2">{errors.form}</p>
            )}

            <button type="submit" disabled={status === "loading"} className="tyre-btn-primary w-full justify-center mt-5 disabled:opacity-60">
              {status === "loading" ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Submitting…</>
              ) : (
                <>Request a callback <ArrowRight className="w-4 h-4" /></>
              )}
            </button>
            <p className="text-[11px] text-[var(--muted-foreground)] text-center mt-3">
              No spam. We call once, in your language.
            </p>
          </form>
        )}
      </motion.div>
    </motion.div>
  );
}
