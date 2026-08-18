"use client";

/**
 * ASKPILOT — the platform's operator, one tap away.
 *
 * A floating button in the bottom-left corner of the app. Tap it and a
 * short window springs open in the centre of the dashboard: ask by text or
 * voice. Before any message reaches the model it is contextually enriched —
 * the user's profile (name, role, company) and a compact platform brief are
 * prepended so answers are grounded in who's asking and what TYRE can do.
 * Requests go to the existing BFF endpoint (POST /api/v1/copilot/chat),
 * which fronts the Python gateway's copilot agent (Groq).
 *
 * Voice uses the browser SpeechRecognition API when available.
 */
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { FileText, Mic, Paperclip, Send, Sparkles, X } from "lucide-react";
import { useTyreUI, type AppView } from "@/lib/tyre/store";
import { useProfile, ROLE_LABEL } from "@/lib/tyre/profile";

/* "/" commands — AskPilot doubles as a command palette */
const COMMANDS: { cmd: string; label: string; view: AppView }[] = [
  { cmd: "/dashboard", label: "Go to Dashboard", view: "dashboard" },
  { cmd: "/dispatch", label: "Open Dispatch board", view: "dispatch" },
  { cmd: "/tracking", label: "Open live Tracking", view: "tracking" },
  { cmd: "/marketplace", label: "Open the Marketplace", view: "marketplace" },
  { cmd: "/freight", label: "My Freight & listings", view: "my_freight" },
  { cmd: "/fleet", label: "Fleet overview", view: "fleet" },
  { cmd: "/drivers", label: "Driver roster", view: "drivers" },
  { cmd: "/payments", label: "Payments & ledger", view: "payments" },
  { cmd: "/analytics", label: "Analytics", view: "analytics" },
  { cmd: "/settings", label: "Settings", view: "settings" },
];

const EXPO = [0.19, 1, 0.22, 1] as const;

type Msg = { role: "user" | "assistant"; text: string };

const PLATFORM_BRIEF =
  "You are AskPilot, the in-app operator for TYRE — a two-way marketplace for every vehicle (cars, vans, trucks). " +
  "Users list legs they'd otherwise drive empty (rides or freight), can attach time-boxed discounts, and pay a fee " +
  "only when a booking happens (₹9 under ₹200, ₹29 to ₹500, 4.99% above; memberships remove cuts). Bookers never pay the platform. " +
  "App areas: Dashboard, Dispatch, Tracking, Trips, Marketplace, My Freight, Fleet, Drivers, Payments, Analytics, Settings. " +
  "Answer concisely and concretely about the user's operations and the platform.";

/** Contextual enrichment: profile + platform brief travel with every message. */
function enrich(message: string, profile: ReturnType<typeof useProfile>["profile"]) {
  const who = profile
    ? `The user is ${profile.name} (${ROLE_LABEL[profile.role]}${profile.company ? `, ${profile.company}` : ""}).`
    : "The user has not completed a profile.";
  return `${PLATFORM_BRIEF}\n${who}\n\nUser question: ${message}`;
}

export function AskPilot() {
  const { copilotOpen, setCopilotOpen, setAppView } = useTyreUI();
  const { profile } = useProfile();
  const reduce = useReducedMotion();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [attachment, setAttachment] = useState<{ name: string; text: string } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const recRef = useRef<any>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const commandMatches = input.startsWith("/")
    ? COMMANDS.filter((c) => c.cmd.startsWith(input.toLowerCase().trim()))
    : [];

  const runCommand = (view: AppView, label: string) => {
    setAppView(view);
    setCopilotOpen(false);
    setInput("");
    setMessages((m) => [...m, { role: "assistant", text: `Done — ${label.toLowerCase()}.` }]);
  };

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > 200_000 || !/\.(txt|md|csv|json)$/i.test(f.name)) {
      setMessages((m) => [
        ...m,
        { role: "assistant", text: "For now I read small text files (.txt, .md, .csv, .json up to 200KB). PDFs arrive with the knowledge pipeline." },
      ]);
      return;
    }
    const text = await f.text();
    setAttachment({ name: f.name, text: text.slice(0, 6000) });
  };

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  const send = async (raw?: string) => {
    const text = (raw ?? input).trim();
    if (!text || busy) return;
    /* slash command? run it locally, instantly */
    const exact = COMMANDS.find((c) => c.cmd === text.toLowerCase());
    if (exact) return runCommand(exact.view, exact.label);
    setInput("");
    setMessages((m) => [...m, { role: "user", text: attachment ? `${text} 📎 ${attachment.name}` : text }]);
    setBusy(true);
    const doc = attachment ? `\n\nAttached document "${attachment.name}":\n${attachment.text}` : "";
    setAttachment(null);
    try {
      const res = await fetch("/api/v1/copilot/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: enrich(text, profile) + doc,
          context: { profile, surface: "askpilot" },
        }),
      });
      const d = await res.json().catch(() => null);
      const reply =
        d?.reply ?? d?.message ?? d?.data?.reply ?? d?.data?.message ??
        (res.ok ? "I received that, but the copilot service returned an unexpected shape." :
          "The copilot service isn't reachable right now — start the AI gateway (`tyre-ai`) and I'll have real answers.");
      setMessages((m) => [...m, { role: "assistant", text: String(reply) }]);
    } catch {
      setMessages((m) => [
        ...m,
        { role: "assistant", text: "I couldn't reach the copilot service. Check that the backend is running." },
      ]);
    } finally {
      setBusy(false);
    }
  };

  const toggleVoice = () => {
    const SR = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
    if (!SR) {
      setMessages((m) => [...m, { role: "assistant", text: "Voice input isn't supported in this browser — type away instead." }]);
      return;
    }
    if (listening) {
      recRef.current?.stop();
      setListening(false);
      return;
    }
    const rec = new SR();
    recRef.current = rec;
    rec.lang = "en-IN";
    rec.interimResults = false;
    rec.onresult = (e: any) => {
      const t = e.results?.[0]?.[0]?.transcript;
      setListening(false);
      if (t) send(t);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    rec.start();
    setListening(true);
  };

  return (
    <>
      {/* ── floating launcher — bottom-right ── */}
      <motion.button
        onClick={() => setCopilotOpen(!copilotOpen)}
        initial={reduce ? false : { scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 20, delay: 0.4 }}
        whileHover={reduce ? undefined : { scale: 1.06 }}
        whileTap={{ scale: 0.94 }}
        className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full bg-[var(--tyre-ink)] pl-3 pr-4 py-3 text-[13px] font-bold text-[#F3F1E8] shadow-[0_16px_40px_-12px_rgba(18,16,11,0.55),inset_0_1px_0_rgba(255,250,235,0.12)]"
        aria-label={copilotOpen ? "Close AskPilot" : "Open AskPilot"}
      >
        <span className="relative grid place-items-center w-6 h-6 rounded-full bg-[var(--tyre-signal)]">
          <Sparkles className="w-3.5 h-3.5 text-white" />
          {!copilotOpen && (
            <span className="absolute inline-flex h-full w-full rounded-full bg-[var(--tyre-signal)] opacity-50 animate-ping" />
          )}
        </span>
        AskPilot
      </motion.button>

      {/* ── chat panel — anchored bottom-right, like Claude/GPT ── */}
      <AnimatePresence>
        {copilotOpen && (
          <>
            <motion.div
              role="dialog"
              aria-label="AskPilot"
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 32, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.98 }}
              transition={{ type: "spring", stiffness: 340, damping: 30 }}
              className="fixed right-6 bottom-24 z-50 w-[460px] max-w-[calc(100vw-3rem)] rounded-[1.4rem] tyre-card-dark text-[#F3F1E8] overflow-hidden flex flex-col origin-bottom-right"
              style={{ height: "min(680px, calc(100vh - 8.5rem))" }}
              onKeyDown={(e) => e.key === "Escape" && setCopilotOpen(false)}
            >
              {/* header */}
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-[rgba(243,241,232,0.09)]">
                <div className="flex items-center gap-2.5">
                  <span className="grid place-items-center w-8 h-8 rounded-full bg-[var(--tyre-signal)]">
                    <Sparkles className="w-4 h-4 text-white" />
                  </span>
                  <div>
                    <div className="text-[13.5px] font-bold leading-none">AskPilot</div>
                    <div className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-[rgba(243,241,232,0.4)] mt-1">
                      {profile ? `for ${profile.name.split(" ")[0]}` : "your operator"} · chat + voice
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setCopilotOpen(false)}
                  className="grid place-items-center w-8 h-8 rounded-full text-[rgba(243,241,232,0.5)] hover:bg-[rgba(243,241,232,0.07)] hover:text-[#F3F1E8] transition-colors"
                  aria-label="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* messages */}
              <div ref={listRef} className="flex-1 overflow-y-auto tyre-scroll px-5 py-4 space-y-3 min-h-[220px]">
                {messages.length === 0 && (
                  <div className="pt-6 text-center">
                    <p className="text-[13px] text-[rgba(243,241,232,0.55)]">
                      Ask anything about your trips, listings, payouts — or the platform itself.
                    </p>
                    <div className="mt-4 flex flex-wrap justify-center gap-2">
                      {["What fee will a ₹450 booking cost me?", "How do discount windows work?", "Show my best route this week"].map((q) => (
                        <button
                          key={q}
                          onClick={() => send(q)}
                          className="rounded-full border border-[rgba(243,241,232,0.15)] px-3 py-1.5 text-[11.5px] text-[rgba(243,241,232,0.65)] hover:border-[var(--tyre-signal)] hover:text-[var(--tyre-signal)] transition-colors"
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {messages.map((m, i) => (
                  <motion.div
                    key={i}
                    initial={reduce ? false : { opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, ease: EXPO }}
                    className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed ${
                      m.role === "user"
                        ? "ml-auto bg-[var(--tyre-signal)] text-white"
                        : "bg-[rgba(243,241,232,0.06)] text-[rgba(243,241,232,0.9)]"
                    }`}
                  >
                    {m.text}
                  </motion.div>
                ))}
                {busy && (
                  <div className="flex items-center gap-1.5 px-2 py-1" aria-label="AskPilot is thinking">
                    {[0, 1, 2].map((i) => (
                      <motion.span
                        key={i}
                        className="w-1.5 h-1.5 rounded-full bg-[var(--tyre-signal)]"
                        animate={{ opacity: [0.25, 1, 0.25], y: [0, -3, 0] }}
                        transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15 }}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* input */}
              <div className="px-4 py-3.5 border-t border-[rgba(243,241,232,0.09)]">
                {/* slash-command palette */}
                <AnimatePresence>
                  {commandMatches.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 6 }}
                      transition={{ duration: 0.18 }}
                      className="mb-2 rounded-xl border border-[rgba(243,241,232,0.12)] bg-[rgba(243,241,232,0.04)] overflow-hidden"
                    >
                      {commandMatches.slice(0, 5).map((c) => (
                        <button
                          key={c.cmd}
                          onClick={() => runCommand(c.view, c.label)}
                          className="w-full flex items-center justify-between px-3.5 py-2 text-left hover:bg-[rgba(61,107,255,0.12)] transition-colors"
                        >
                          <span className="text-[12.5px] text-[#F3F1E8]">{c.label}</span>
                          <span className="font-mono text-[10.5px] text-[var(--tyre-signal)]">{c.cmd}</span>
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
                {/* attachment chip */}
                {attachment && (
                  <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-[rgba(61,107,255,0.12)] pl-3 pr-1.5 py-1 text-[11.5px] text-[var(--tyre-signal)]">
                    <FileText className="w-3 h-3" /> {attachment.name}
                    <button
                      onClick={() => setAttachment(null)}
                      aria-label="Remove attachment"
                      className="grid place-items-center w-5 h-5 rounded-full hover:bg-[rgba(243,241,232,0.1)]"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                )}
                <div className="flex items-center gap-2 rounded-full border border-[rgba(243,241,232,0.15)] bg-[rgba(243,241,232,0.05)] pl-2 pr-1.5 py-1.5 focus-within:border-[var(--tyre-signal)] transition-colors">
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".txt,.md,.csv,.json"
                    className="hidden"
                    onChange={(e) => onFile(e.target.files?.[0])}
                  />
                  <button
                    onClick={() => fileRef.current?.click()}
                    aria-label="Attach file"
                    className="shrink-0 grid place-items-center w-8 h-8 rounded-full text-[rgba(243,241,232,0.55)] hover:bg-[rgba(243,241,232,0.08)] hover:text-[#F3F1E8] transition-colors"
                  >
                    <Paperclip className="w-4 h-4" />
                  </button>
                  <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && commandMatches.length === 0 && send()}
                    placeholder={listening ? "Listening…" : "Ask, or type / for commands…"}
                    className="flex-1 min-w-0 bg-transparent text-[13.5px] text-[#F3F1E8] placeholder:text-[rgba(243,241,232,0.35)] focus:outline-none"
                  />
                  <button
                    onClick={toggleVoice}
                    aria-label="Voice input"
                    className={`shrink-0 grid place-items-center w-8 h-8 rounded-full transition-colors ${
                      listening
                        ? "bg-[var(--tyre-ember)] text-white"
                        : "text-[rgba(243,241,232,0.55)] hover:bg-[rgba(243,241,232,0.08)] hover:text-[#F3F1E8]"
                    }`}
                  >
                    <Mic className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => send()}
                    disabled={busy || !input.trim()}
                    aria-label="Send"
                    className="shrink-0 grid place-items-center w-8 h-8 rounded-full bg-[var(--tyre-signal)] text-white hover:brightness-110 disabled:opacity-40 transition-all"
                  >
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
