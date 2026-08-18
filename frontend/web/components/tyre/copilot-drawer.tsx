"use client";

import { useTyreUI } from "@/lib/tyre/store";
import { Sparkles, X, Send, ArrowUpRight, Loader2 } from "lucide-react";
import { useState } from "react";

const SUGGESTIONS = [
  "Show me loads Patna → Delhi under ₹45K with return",
  "Which drivers haven't moved in 4 hours?",
  "Release the held balance for TYR-LD-4781",
  "What's our GMV trend this week vs last?",
  "Find trucks near Varanasi available now",
];

interface Msg {
  role: "user" | "assistant";
  text: string;
}

const INITIAL: Msg[] = [
  {
    role: "assistant",
    text:
      "Namaste! I'm TYRE Copilot. I can search loads, dispatch trucks, release payments, and pull analytics — all in Hindi, Bhojpuri, or English. What do you need?",
  },
];

export function CopilotDrawer() {
  const { copilotOpen, setCopilotOpen } = useTyreUI();
  const [messages, setMessages] = useState<Msg[]>(INITIAL);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  if (!copilotOpen) return null;

  // FE-H13 fix: wire to real /api/v1/copilot/chat instead of setTimeout hardcoded reply
  const send = async (text: string) => {
    if (!text.trim() || loading) return;
    setMessages((m) => [...m, { role: "user", text }]);
    setInput("");
    setLoading(true);
    try {
      const res = await fetch("/api/v1/copilot/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Request failed: ${res.status}`);
      }
      const data = await res.json();
      setMessages((m) => [
        ...m,
        { role: "assistant", text: data.reply || data.data?.reply || "Sorry, I couldn't process that." },
      ]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setMessages((m) => [
        ...m,
        { role: "assistant", text: `Sorry, I couldn't reach the copilot service: ${msg}` },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm"
        onClick={() => setCopilotOpen(false)}
      />
      {/* Drawer */}
      <aside className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-md bg-white shadow-2xl flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-black/[0.06] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl tyre-bg-gradient flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <div>
              <div className="text-[13.5px] font-bold text-[#181410]">TYRE Copilot</div>
              <div className="text-[10.5px] text-[#71717A] flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-[#14B8A6] tyre-pulse-dot" />
                Online · Llama-3.3-70b · 5 languages
              </div>
            </div>
          </div>
          <button
            onClick={() => setCopilotOpen(false)}
            className="p-1.5 rounded-lg hover:bg-black/[0.04]"
            aria-label="Close copilot"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto tyre-scroll px-5 py-4 space-y-4">
          {messages.map((m, i) => (
            <div
              key={i}
              className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-[13px] leading-relaxed ${
                  m.role === "user"
                    ? "bg-[#181410] text-white rounded-tr-sm"
                    : "bg-[#F4F4F5] text-[#181410] rounded-tl-sm"
                }`}
              >
                {m.text}
              </div>
            </div>
          ))}
        </div>

        {/* Suggestions */}
        <div className="px-5 py-3 border-t border-black/[0.06]">
          <div className="text-[10.5px] font-semibold uppercase tracking-wider text-[#71717A] mb-2">
            Try
          </div>
          <div className="flex flex-wrap gap-1.5">
            {SUGGESTIONS.slice(0, 3).map((s) => (
              <button
                key={s}
                onClick={() => send(s)}
                className="px-2.5 py-1 rounded-full bg-[#EBFBD6] text-[#8FE03A] text-[11px] font-medium hover:bg-[#FFE0CC] transition-colors"
              >
                {s.length > 36 ? s.slice(0, 36) + "…" : s}
              </button>
            ))}
          </div>
        </div>

        {/* Input */}
        <div className="p-4 border-t border-black/[0.06]">
          <div className="flex items-end gap-2 rounded-2xl border border-black/[0.10] bg-white p-2 focus-within:border-[#181410]/30 transition-colors">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              placeholder="Ask in Hindi, Bhojpuri, or English..."
              rows={1}
              className="flex-1 resize-none bg-transparent text-[13px] text-[#181410] placeholder:text-[#a1a1aa] focus:outline-none max-h-24"
            />
            <button
              onClick={() => send(input)}
              className="w-8 h-8 rounded-xl bg-[#181410] text-white flex items-center justify-center hover:bg-[#27272A] transition-colors"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="text-[10px] text-[#a1a1aa] text-center mt-2 flex items-center justify-center gap-1">
            <ArrowUpRight className="w-2.5 h-2.5" />
            TYRE Copilot can dispatch trucks, release payments, and pull analytics on your behalf.
          </div>
        </div>
      </aside>
    </>
  );
}
