"use client";

/**
 * Contact — "Let's Connect." Reference has the lead form live on the page,
 * not hidden behind a modal. Posts to the same real, rate-limited
 * /api/v1/leads endpoint the modal (lead-dialog.tsx) already uses.
 */
import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, CheckCircle2, Loader2, Mail } from "lucide-react";
import { Reveal } from "./motion";

const ROLES = [
  { key: "fleet", label: "Fleet operator" },
  { key: "broker", label: "Broker" },
  { key: "driver", label: "Driver" },
  { key: "shipper", label: "Shipper" },
] as const;

export function ContactSection() {
  const reduce = useReducedMotion();
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
    <section id="contact" className="relative bg-[#12100B] text-[#F3F1E8] overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{ background: "radial-gradient(60% 60% at 15% 15%, rgba(139,92,246,0.25) 0%, transparent 60%), radial-gradient(50% 50% at 90% 90%, rgba(192,38,211,0.18) 0%, transparent 60%)" }}
      />
      <div className="relative max-w-6xl mx-auto px-5 sm:px-8 py-20 sm:py-24 grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-12 items-start">
        <Reveal>
          <div className="tyre-eyebrow !text-[var(--tyre-violet-hot)] flex items-center gap-3">
            <span className="w-7 h-px bg-[var(--tyre-violet-hot)]" />
            Let&apos;s connect
          </div>
          <h2 className="tyre-h2 mt-5">
            Got a fleet <span className="tyre-em" style={{ color: "var(--tyre-violet-hot)" }}>in mind?</span>
          </h2>
          <p className="mt-5 text-[15px] text-[rgba(243,241,232,0.6)] leading-relaxed max-w-md">
            Leave your number — our corridor team calls back within one working day, in your language.
            No spam, no sales sequence.
          </p>
          <div className="mt-8 space-y-2.5">
            <a href="mailto:hello@tyre.in" className="flex items-center gap-2.5 text-[14px] text-[rgba(243,241,232,0.75)] hover:text-white transition-colors">
              <Mail className="w-4 h-4 text-[var(--tyre-violet-hot)]" />
              hello@tyre.in
            </a>
            <a href="mailto:careers@tyre.in" className="flex items-center gap-2.5 text-[14px] text-[rgba(243,241,232,0.75)] hover:text-white transition-colors">
              <Mail className="w-4 h-4 text-[var(--tyre-violet-hot)]" />
              careers@tyre.in
            </a>
          </div>
        </Reveal>

        <motion.div
          initial={reduce ? false : { opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          className="rounded-[1.5rem] bg-[rgba(243,241,232,0.05)] border border-[rgba(243,241,232,0.12)] backdrop-blur-sm p-6 sm:p-7"
        >
          {status === "done" ? (
            <div className="py-8 text-center">
              <div className="mx-auto w-14 h-14 rounded-full bg-[rgba(139,92,246,0.15)] grid place-items-center mb-4">
                <CheckCircle2 className="w-7 h-7 text-[var(--tyre-violet-hot)]" />
              </div>
              <h3 className="tyre-display text-[22px]">
                You&apos;re on the list{position ? <> — <span style={{ color: "var(--tyre-violet-hot)" }}>#{position}</span></> : null}.
              </h3>
              <p className="text-[13.5px] text-[rgba(243,241,232,0.6)] mt-2">
                Our corridor team will call you on <span className="font-semibold text-white">{phone}</span> within one working day.
              </p>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11.5px] font-semibold text-[rgba(243,241,232,0.7)] mb-1.5">Full name</label>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your name"
                    className="w-full h-11 px-3.5 rounded-xl bg-[rgba(243,241,232,0.06)] border border-[rgba(243,241,232,0.12)] focus:border-[var(--tyre-violet-hot)] focus:outline-none text-[14px] text-white placeholder:text-[rgba(243,241,232,0.35)]"
                  />
                  {errors.name && <p className="text-[11px] text-[#FF7A45] mt-1">{errors.name}</p>}
                </div>
                <div>
                  <label className="block text-[11.5px] font-semibold text-[rgba(243,241,232,0.7)] mb-1.5">Mobile number</label>
                  <input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    inputMode="numeric"
                    placeholder="98765 43210"
                    className="w-full h-11 px-3.5 rounded-xl bg-[rgba(243,241,232,0.06)] border border-[rgba(243,241,232,0.12)] focus:border-[var(--tyre-violet-hot)] focus:outline-none text-[14px] text-white placeholder:text-[rgba(243,241,232,0.35)]"
                  />
                  {errors.phone && <p className="text-[11px] text-[#FF7A45] mt-1">{errors.phone}</p>}
                </div>
              </div>

              <div>
                <label className="block text-[11.5px] font-semibold text-[rgba(243,241,232,0.7)] mb-1.5">I am a…</label>
                <div className="flex flex-wrap gap-2">
                  {ROLES.map((r) => (
                    <button
                      type="button"
                      key={r.key}
                      onClick={() => setRole(r.key)}
                      className={`px-3 py-1.5 rounded-full text-[12px] font-medium border transition-colors ${
                        role === r.key
                          ? "bg-[var(--tyre-violet)] border-[var(--tyre-violet)] text-white"
                          : "border-[rgba(243,241,232,0.15)] text-[rgba(243,241,232,0.6)] hover:border-[rgba(243,241,232,0.3)]"
                      }`}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-[11.5px] font-semibold text-[rgba(243,241,232,0.7)] mb-1.5">Message (optional)</label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Tell us about your fleet…"
                  maxLength={400}
                  className="w-full h-20 px-3.5 py-2.5 rounded-xl bg-[rgba(243,241,232,0.06)] border border-[rgba(243,241,232,0.12)] focus:border-[var(--tyre-violet-hot)] focus:outline-none text-[14px] text-white placeholder:text-[rgba(243,241,232,0.35)] resize-none"
                />
              </div>

              {errors.form && (
                <p className="text-[12px] text-[#FF7A45] bg-[rgba(255,122,69,0.1)] rounded-lg px-3 py-2">{errors.form}</p>
              )}

              <button
                type="submit"
                disabled={status === "loading"}
                className="tyre-btn-violet w-full justify-center disabled:opacity-60"
              >
                {status === "loading" ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Submitting…</>
                ) : (
                  <>Send message <ArrowRight className="w-4 h-4" /></>
                )}
              </button>
            </form>
          )}
        </motion.div>
      </div>
    </section>
  );
}
