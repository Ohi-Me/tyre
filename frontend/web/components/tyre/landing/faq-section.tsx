"use client";

/**
 * FAQ — "Your Questions, Answered." Genuine TYRE product questions (fees,
 * refunds, GST, escrow safety, onboarding time) pulled from the app's real
 * mechanics, not filler copy.
 */
import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { Reveal } from "./motion";

const FAQS = [
  {
    q: "What does it cost to list a return leg?",
    a: "Nothing. Listing is always ₹0. A small fee — ₹9 under ₹200, ₹29 up to ₹500, or 4.99% above that — is deducted from the lister's payout only when someone actually books. The booker never pays a platform fee.",
  },
  {
    q: "What happens if a booking is cancelled?",
    a: "The platform fee is refunded automatically to the lister's payout ledger — no forms, no support ticket, no waiting period.",
  },
  {
    q: "Is the advance payment actually held safely?",
    a: "Yes. Advances move through an RBI-compliant UPI escrow flow — funds are held against the load and released to the driver on match, with the balance released on proof of delivery, not paid out of a shared pool.",
  },
  {
    q: "How does GST and TDS work on completed trips?",
    a: "TYRE's settlement engine computes CGST+SGST (intra-state) or IGST (inter-state), platform commission plus GST on that commission, and TDS under section 194C automatically when an invoice is generated for a completed trip — the operator doesn't calculate any of it by hand.",
  },
  {
    q: "How long does it take to onboard a fleet or a driver?",
    a: "Drivers can be onboarded by voice in under a minute, in their own language. Fleet operators get full dashboard access — dispatch, documents, billing — as soon as their account is created.",
  },
  {
    q: "Which languages does TYRE support?",
    a: "The voice and dispatch experience is built for India's linguistic diversity — Hindi, Bhojpuri, Marathi, Bengali and more, with the corridor-first languages (Hindi, Bhojpuri) fully localized today.",
  },
];

export function FaqSection() {
  const [open, setOpen] = useState<number | null>(0);
  const reduce = useReducedMotion();

  return (
    <section id="faq" className="bg-background tyre-section">
      <div className="max-w-5xl mx-auto px-5 sm:px-8">
        <Reveal className="text-center max-w-xl mx-auto">
          <div className="tyre-eyebrow flex items-center justify-center gap-3 !text-[var(--tyre-violet-deep)]">
            <span className="w-7 h-px bg-[var(--tyre-violet)]" />
            FAQ
            <span className="w-7 h-px bg-[var(--tyre-violet)]" />
          </div>
          <h2 className="tyre-h2 mt-5 text-[var(--tyre-ink)]">
            Your questions, <span className="tyre-em text-[var(--tyre-violet)]">answered.</span>
          </h2>
        </Reveal>

        <div className="mt-12 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {FAQS.map((f, i) => {
            const isOpen = open === i;
            return (
              <div
                key={f.q}
                className="rounded-2xl border border-[var(--border)] bg-card overflow-hidden self-start"
              >
                <button
                  onClick={() => setOpen(isOpen ? null : i)}
                  aria-expanded={isOpen}
                  className="w-full flex items-center justify-between gap-3 text-left px-5 py-4"
                >
                  <span className="text-[14px] font-semibold text-[var(--tyre-ink)]">{f.q}</span>
                  <motion.span
                    animate={{ rotate: isOpen ? 180 : 0 }}
                    transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                    className={`shrink-0 grid place-items-center w-7 h-7 rounded-full ${
                      isOpen ? "bg-[var(--tyre-violet)] text-white" : "bg-[var(--secondary)] text-[var(--muted-foreground)]"
                    }`}
                  >
                    <ChevronDown className="w-4 h-4" />
                  </motion.span>
                </button>
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      initial={reduce ? false : { height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                      className="overflow-hidden"
                    >
                      <p className="px-5 pb-5 text-[13px] text-[var(--muted-foreground)] leading-relaxed">{f.a}</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
